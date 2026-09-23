import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { existsSync, readFileSync, writeFileSync, statSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { ProductCore } from '../core.ts';
import { WorkerSupervisor } from '../worker-supervisor.ts';
import { repository, sterileEnvironment } from '../worker-launcher.ts';
import type { ResourceSelection } from '../../../packages/app-contracts/worker-ipc.ts';
import { createScenario, until } from './scenario.ts';
import './ipc.test.ts';
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
for (const mode of ['before-ready', 'approval', 'claimed', 'written', 'replace']) {
  test(`actual SIGKILL at ${mode}; reopen SQLite, cleanup proof, no replay`, async t => {
    const f = fixture(t, mode); const pending = f.start();
    if (mode === 'approval') await until(() => f.core.snapshot(f.thread).operations.length === 1, 'pending approval');
    else if (mode === 'claimed' || mode === 'written') { await f.approval(); await until(() => f.stage(mode), mode); }
    else await until(() => f.stage(mode === 'replace' ? 'rebind' : mode), mode);
    const path = join(f.cwd, 'report.md'); const before = existsSync(path) ? statSync(path).mtimeMs : null;
    process.kill(f.supervisor.workerPid!, 'SIGKILL'); await pending;
    const state = f.core.snapshot(f.thread).runs[0]!.state;
    assert.equal(state, ['before-ready','replace'].includes(mode) ? 'failed' : 'unknown');
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

for (const mode of ['before-ready', 'descendants']) test(`App Server SIGKILL ${mode}: independent guardian fences actual process group before database recovery`, async t => {
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'b-host-kill-'))); t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const manifest = join(temporary, 'host.json');
  const host = spawn(process.execPath, ['--import', join(repository, 'scripts/probe-no-network.mjs'), join(import.meta.dirname, 'host-fixture.ts'), manifest, mode],
    { cwd: temporary, env: sterileEnvironment(temporary), stdio: ['ignore','ignore','inherit'] });
  t.after(() => { if (host.exitCode === null && host.signalCode === null) host.kill('SIGKILL'); });
  await until(() => existsSync(manifest), 'host manifest');
  const m = JSON.parse(readFileSync(manifest, 'utf8')) as { root: string; database: string; cwd: string; thread: string; run: string; resources: ResourceSelection; workerPid: number; guardianPid: number };
  const exited = once(host, 'exit'); host.kill('SIGKILL'); await exited;
  const core = new ProductCore(m.database, [{ id: 'workspace', path: m.cwd }]); t.after(() => core.close());
  const supervisor = new WorkerSupervisor(core, { stateDirectory: join(m.root, 'state'), databaseDirectory: join(m.root, 'host'), resources: m.resources });
  const journal = JSON.parse(core.workerLaunches()[0]!.record) as { spec: { receipt: string } };
  await until(() => existsSync(journal.spec.receipt), 'guardian cleanup receipt');
  const receipt = JSON.parse(readFileSync(journal.spec.receipt, 'utf8')) as { exited: boolean; groupGone: boolean };
  assert.equal(receipt.exited, true); assert.equal(receipt.groupGone, true); assert.throws(() => process.kill(-m.workerPid, 0));
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
