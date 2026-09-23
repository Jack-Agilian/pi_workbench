import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { existsSync, readFileSync, writeFileSync, statSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { ProductCore } from '../core.ts';
import { WorkerSupervisor } from '../worker-supervisor.ts';
import { repository, sterileEnvironment } from '../worker-launcher.ts';
import type { ResourceSelection } from '../../../packages/app-contracts/worker-ipc.ts';
import { createScenario, until } from './scenario.ts';
import './ipc.test.ts';
import { digest, parametersDigest } from '../../../packages/pi-adapter/controlled-tools.ts';
function fixture(t: TestContext, mode = 'normal', persistNative = false) { const f = createScenario(mode, persistNative); t.after(f.dispose); return f; }
test('actual child PID, OS SQLite denial, approved Pi write, artifact, exactly one durable Run/execution', async t => {
  const f = fixture(t); assert.equal(f.supervisor.command(f.command).id, f.run);
  const pending = f.start(); assert.equal(f.start(), pending);
  await until(() => !!f.supervisor.workerPid, 'worker pid'); assert.notEqual(f.supervisor.workerPid, process.pid);
  await f.approval(); await pending;
  const snap = f.core.snapshot(f.thread); assert.equal(snap.runs.length, 1); assert.equal(snap.runs[0]!.state, 'completed');
  assert.equal(snap.operations.length, 1); assert.equal(snap.operations[0]!.state, 'succeeded'); assert.equal(snap.artifacts.length, 1);
  assert.equal(readFileSync(join(f.cwd, 'report.md'), 'utf8'), f.args.content); assert.equal(existsSync(f.database + '.worker-new'), false);
});
test('denied approval causes no write and child is recycled', async t => {
  const f = fixture(t); const pending = f.start(); await f.approval('deny'); await pending;
  assert.equal(existsSync(join(f.cwd, 'report.md')), false); assert.equal(f.core.snapshot(f.thread).operations[0]!.state, 'denied');
  assert.equal(f.core.snapshot(f.thread).runs[0]!.state, 'failed');
});

test('active cancellation waits for claimed Pi tool, operation settlement and actual process cleanup', async t => {
  const f = fixture(t, 'cancel'); const pending = f.start(); await f.approval(); await until(() => f.stage('claimed'), 'claimed');
  const pid = f.supervisor.workerPid!;
  f.supervisor.command({ type: 'runs.cancel', requestId: 'cancel', runId: f.run });
  assert.equal(f.core.snapshot(f.thread).runs[0]!.state, 'cancelling');
  await pending; assert.equal(f.core.snapshot(f.thread).runs[0]!.state, 'cancelled');
  assert.equal(f.core.snapshot(f.thread).operations[0]!.state, 'failed'); assert.equal(existsSync(join(f.cwd, 'report.md')), false);
  assert.throws(() => process.kill(pid, 0));
});
for (const mode of ['before-ready', 'approval', 'claimed', 'written', 'replace', 'session-create', 'replace-create']) {
  test(`actual SIGKILL at ${mode}; reopen SQLite, cleanup proof, no replay`, async t => {
    const f = fixture(t, mode); const pending = f.start();
    if (mode === 'approval') await until(() => f.core.snapshot(f.thread).operations.length === 1, 'pending approval');
    else if (mode === 'claimed' || mode === 'written') { await f.approval(); await until(() => f.stage(mode), mode); }
    else await until(() => f.stage(mode === 'replace' ? 'rebind' : mode), mode);
    const path = join(f.cwd, 'report.md'); const before = existsSync(path) ? statSync(path).mtimeMs : null;
    process.kill(f.supervisor.workerPid!, 'SIGKILL'); await pending;
    const state = f.core.snapshot(f.thread).runs[0]!.state;
    assert.equal(state, ['before-ready','replace','session-create','replace-create'].includes(mode) ? 'failed' : 'unknown');
    if (state === 'unknown') assert.equal(f.core.dispatchNext(), undefined);
    f.reopen(); f.supervisor.recover();
    assert.equal(f.core.snapshot(f.thread).runs[0]!.state, 'failed');
    assert.equal(existsSync(path), mode === 'written');
    if (mode === 'written') {
      assert.equal(statSync(path).mtimeMs, before); assert.equal(readFileSync(path, 'utf8'), f.args.content);
      assert.equal(f.core.snapshot(f.thread).operations[0]!.state, 'succeeded'); assert.equal(f.core.snapshot(f.thread).artifacts.length, 1);
      f.supervisor.recover(); assert.equal(statSync(path).mtimeMs, before);
    }
  });
}
test('resource lock mismatch fails before ready and releases starting slot with cleanup journal', async t => {
  const f = fixture(t); writeFileSync(join(f.resources.root, 'package.json'), '{}');
  await f.start(); const snap = f.core.snapshot(f.thread); assert.equal(snap.runs[0]!.state, 'failed'); assert.equal(snap.operations.length, 0);
  assert.equal(f.core.workerLaunches().length, 1); assert.equal(existsSync(join(f.cwd, 'report.md')), false);
});
test('fileVersion changes before grant revoke execution and require explicit reconciliation', async t => {
  const f = fixture(t); const pending = f.start(); await until(() => f.core.snapshot(f.thread).operations.length === 1, 'approval');
  writeFileSync(join(f.cwd, 'report.md'), '# SYNTHETIC external edit\n'); await f.approval(); await pending;
  assert.equal(f.core.snapshot(f.thread).runs[0]!.state, 'unknown'); f.reopen(); f.supervisor.recover();
  assert.equal(readFileSync(join(f.cwd, 'report.md'), 'utf8'), '# SYNTHETIC external edit\n'); assert.equal(f.core.snapshot(f.thread).operations[0]!.state, 'denied');
});
test('close during creation shares completion and never publishes a ready instance', async t => {
  const f = fixture(t, 'close-create'); await f.start(); assert.equal(f.core.snapshot(f.thread).runs[0]!.state, 'failed');
  assert.equal(f.core.snapshot(f.thread).operations.length, 0); const closing = f.supervisor.close(); assert.equal(f.supervisor.close(), closing); await closing;
});

for (const mode of ['dispatched', 'before-ready', 'descendants']) test(`App Server SIGKILL ${mode}: independent guardian fences actual process group before database recovery`, async t => {
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'b-host-kill-'))); t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const manifest = join(temporary, 'host.json');
  const host = spawn(process.execPath, ['--import', join(repository, 'scripts/probe-no-network.mjs'), join(import.meta.dirname, 'host-fixture.ts'), manifest, mode],
    { cwd: temporary, env: sterileEnvironment(temporary), stdio: ['ignore','ignore','inherit'] });
  const hostExited = once(host, 'exit');
  t.after(() => { if (host.exitCode === null && host.signalCode === null) host.kill('SIGKILL'); });
  await until(() => existsSync(manifest), 'host manifest');
  const m = JSON.parse(readFileSync(manifest, 'utf8')) as { root: string; database: string; cwd: string; thread: string; run: string; resources: ResourceSelection; workerPid: number | null; guardianPid: number };
  if (mode !== 'dispatched') host.kill('SIGKILL'); await hostExited;
  const core = new ProductCore(m.database, [{ id: 'workspace', path: m.cwd }]); t.after(() => core.close());
  const supervisor = new WorkerSupervisor(core, { stateDirectory: join(m.root, 'state'), databaseDirectory: join(m.root, 'host'), resources: m.resources });
  const journal = JSON.parse(core.workerLaunches()[0]!.record) as { spec: { receipt: string } };
  await until(() => existsSync(journal.spec.receipt), 'guardian cleanup receipt');
  const receipt = JSON.parse(readFileSync(journal.spec.receipt, 'utf8')) as { exited: boolean; groupGone: boolean };
  assert.equal(receipt.exited, true); assert.equal(receipt.groupGone, true); if (m.workerPid) assert.throws(() => process.kill(-m.workerPid!, 0));
  else assert.equal(JSON.parse(readFileSync(journal.spec.receipt, 'utf8')).workerPid, null);
  if (mode === 'descendants') {
    for (const role of ['fixed-parent','fixed-child']) {
      const pid = Number(readFileSync(join(m.cwd, `${role}.pid`), 'utf8')); assert.throws(() => process.kill(pid, 0));
      const heartbeat = readFileSync(join(m.cwd, `${role}.heartbeat`), 'utf8');
      await new Promise<void>(r => setTimeout(r, 100)); assert.equal(readFileSync(join(m.cwd, `${role}.heartbeat`), 'utf8'), heartbeat);
    }
    assert.equal(existsSync(join(m.cwd, 'port-denied')), true); assert.equal(existsSync(join(m.cwd, 'unexpected-port')), false);
  }
  supervisor.recover(); assert.equal(core.snapshot(m.thread).runs[0]!.state, 'failed'); assert.equal(existsSync(join(m.cwd, 'report.md')), false);
});

for (const mode of ['old','unknown','oversize','wrong-pid']) test(`actual IPC rejects ${mode} producer without authority or side effects`, async t => {
  const f = fixture(t); f.entry.path = join(import.meta.dirname, 'protocol-fixture.ts'); f.entry.extraRead = [f.entry.path]; f.entry.args = [mode];
  await f.start(); assert.equal(f.core.snapshot(f.thread).runs[0]!.state, 'failed'); assert.equal(f.core.snapshot(f.thread).operations.length, 0);
  assert.equal(existsSync(join(f.cwd, 'report.md')), false);
});
test('duplicate IPC operation request receives one host Operation and one claim; disconnected result stays unknown', async t => {
  const f = fixture(t); f.entry.path = join(import.meta.dirname, 'protocol-fixture.ts'); f.entry.extraRead = [f.entry.path]; f.entry.args = ['duplicate', f.plan.parametersDigest];
  const pending = f.start(); await f.approval(); await pending;
  const snap = f.core.snapshot(f.thread); assert.equal(snap.operations.length, 1); assert.equal(snap.operations[0]!.state, 'unknown');
  assert.equal(f.core.eventsAfter(f.thread, 0).filter(e => e.kind === 'operation.executing').length, 1);
  assert.equal(snap.runs[0]!.state, 'unknown'); f.reopen(); f.supervisor.recover(); assert.equal(existsSync(join(f.cwd, 'report.md')), false);
});
test('missing cleanup receipt cannot free slot; repeated close shares rejection and recovery fails closed', async t => {
  const f = fixture(t, 'claimed'); const pending = f.start(); await f.approval(); await until(() => f.stage('claimed'), 'claimed');
  const pid = f.supervisor.workerPid!; const guardian = f.supervisor.guardianPid!;
  const rejected = assert.rejects(pending, /cleanup_evidence_missing/);
  process.kill(guardian, 'SIGKILL'); process.kill(pid, 'SIGKILL'); await rejected;
  const first = f.supervisor.close(); assert.equal(f.supervisor.close(), first); await assert.rejects(first, /cleanup_evidence_missing/);
  await until(() => { try { process.kill(-pid, 0); return false; } catch { return true; } }, 'actual test group stopped');
  f.reopen(); assert.throws(() => f.supervisor.recover(), /cleanup_evidence_missing/);
  assert.equal(f.core.dispatchNext(), undefined); assert.equal(f.core.snapshot(f.thread).operations[0]!.state, 'executing');
});
test('native Pi reference survives Worker recycling; product subscription reconnect resumes facts without tool replay', async t => {
  const f = fixture(t, 'normal', true); const received: number[] = []; const sub = f.core.subscribe(f.thread, 0, e => received.push(e.seq));
  const pending = f.start(); await f.approval(); await pending; sub.unsubscribe();
  const oldBinding = JSON.parse(f.core.workerLaunches()[0]!.record).binding;
  const cursor = f.core.snapshot(f.thread).cursor; assert.ok(received.length); const before = statSync(join(f.cwd, 'report.md')).mtimeMs;
  f.reopen(); const replay: number[] = []; const again = f.core.subscribe(f.thread, cursor, e => replay.push(e.seq));
  f.supervisor.command({ type: 'runs.start', requestId: 'second-run', threadId: f.thread, input: 'SYNTHETIC resume native Session in another Worker' });
  f.plan.tool = 'edit'; f.plan.fileVersion = f.plan.expectedContentDigest;
  const args = { path: 'report.md', edits: [{ oldText: 'B-IPC', newText: 'native restore' }] };
  f.plan.parametersDigest = parametersDigest(args); f.plan.expectedContentDigest = digest('# SYNTHETIC native restore\n');
  f.entry.args = [JSON.stringify({ mode: 'restore', database: f.database, tool: 'edit', args })];
  const second = f.start(); await until(() => f.core.snapshot(f.thread).operations.length === 2, 'second approval');
  assert.equal(statSync(join(f.cwd, 'report.md')).mtimeMs, before); assert.equal(f.core.observe(oldBinding, 'activity'), false);
  const op = f.core.snapshot(f.thread).operations[1]!;
  f.supervisor.command({ type: 'approvals.resolve', requestId: 'second-approval', operationId: op.id, parametersDigest: op.parametersDigest, decision: 'allow' });
  await second; again.unsubscribe();
  assert.equal(readFileSync(join(f.cwd, 'report.md'), 'utf8'), '# SYNTHETIC native restore\n');
  assert.equal(f.core.snapshot(f.thread).artifacts.length, 2); assert.equal(f.core.snapshot(f.thread).runs[1]!.state, 'completed');
  assert.deepEqual(replay, f.core.eventsAfter(f.thread, cursor).map(e => e.seq)); assert.equal(new Set(replay).size, replay.length);
});

test('schema v1 upgrade preserves durable queued intent and adds the host launch journal', async t => {
  const f = fixture(t); f.core.close();
  // SYNTHETIC old-schema fixture: remove only the v2 addition while the sole host connection is closed.
  const previous = new DatabaseSync(f.database); previous.exec('DROP TABLE worker_launches; PRAGMA user_version=1;'); previous.close();
  f.reopen(); assert.equal(f.core.snapshot(f.thread).runs[0]!.id, f.run); assert.equal(f.core.workerLaunches().length, 0);
  const pending = f.start(); await f.approval(); await pending; assert.equal(f.core.snapshot(f.thread).runs[0]!.state, 'completed');
});
test('real entry startup failure leaves audited failed Run and allows a later dispatch', async t => {
  const f = fixture(t); f.entry.path = join(import.meta.dirname, 'SYNTHETIC-missing-entry.ts');
  await f.start(); assert.equal(f.core.snapshot(f.thread).runs[0]!.state, 'failed'); assert.equal(f.core.workerLaunches().length, 1);
  f.supervisor.command({ type: 'runs.start', requestId: 'after-failure', threadId: f.thread, input: 'SYNTHETIC retry is a new explicit Run' });
  f.entry.path = join(import.meta.dirname, 'worker-fixture.ts'); const next = f.start(); await f.approval(); await next;
  assert.equal(f.core.snapshot(f.thread).runs[1]!.state, 'completed');
});
test('expired approval cannot execute and requires cleanup/reconciliation before another Run', async t => {
  const f = fixture(t); f.plan.deadline = Date.now() + 1500; const pending = f.start();
  await until(() => f.core.snapshot(f.thread).operations.length === 1, 'approval'); await pending;
  const op = f.core.snapshot(f.thread).operations[0]!;
  assert.throws(() => f.supervisor.command({ type: 'approvals.resolve', requestId: 'late-approval', operationId: op.id, parametersDigest: op.parametersDigest, decision: 'allow' }), /approval_not_pending/);
  assert.equal(existsSync(join(f.cwd, 'report.md')), false); f.reopen(); f.supervisor.recover();
  assert.equal(f.core.snapshot(f.thread).runs[0]!.state, 'failed');
});
test('Renderer cannot inject Worker envelopes; an unrelated IPC child cannot route messages by copied identity', async t => {
  const f = fixture(t); const pending = f.start(); await until(() => f.core.snapshot(f.thread).operations.length === 1, 'approval');
  const before = f.core.snapshot(f.thread); const journal = JSON.parse(f.core.workerLaunches()[0]!.record);
  const forged = { version: 1, instanceId: journal.spec.instanceId, runtimeBindingId: journal.binding.runtimeBindingId, requestId: 'foreign', body: { type: 'done', ok: true } };
  assert.throws(() => f.supervisor.command(forged), /unknown_command/);
  const foreign = spawn(process.execPath, ['-e', 'process.send(JSON.parse(process.argv[1])); process.disconnect();', JSON.stringify(forged)],
    { env: sterileEnvironment(join(f.root, 'foreign')), stdio: ['ignore','ignore','ignore','ipc'] });
  const received = once(foreign, 'message'); const ended = once(foreign, 'exit'); assert.deepEqual((await received)[0], forged); await ended;
  assert.deepEqual(f.core.snapshot(f.thread), before); await f.approval('deny'); await pending;
});
test('close during actual Runtime rebind cannot publish late Session and shares close completion', async t => {
  const f = fixture(t, 'close-rebind'); await f.start(); assert.equal(f.core.snapshot(f.thread).runs[0]!.state, 'failed');
  assert.equal(f.core.snapshot(f.thread).operations.length, 0); assert.equal(f.stage('close-rebind'), true);
});
