// Real process regressions for the B-IPC review; SYNTHETIC inputs, no model or fabricated receipts.
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProductCore } from '../core.ts';
import { WorkerSupervisor } from '../worker-supervisor.ts';
import { repository, sterileEnvironment, type CleanupReceipt } from '../worker-launcher.ts';
import { createScenario, until } from './scenario.ts';
import type { ResourceSelection } from '../../../packages/app-contracts/worker-ipc.ts';
import type { Snapshot, Dispatch } from '../../../packages/app-contracts/index.ts';
import { DatabaseSync } from 'node:sqlite';
const gone = (pid: number) => {
  try { process.kill(pid, 0); return false; }
  catch (error) {
    if (error instanceof Error && 'code' in error) { if (error.code === 'ESRCH') return true; if (error.code === 'EPERM') return false; }
    throw error;
  }
};
interface Manifest { root: string; database: string; cwd: string; thread: string; resources: ResourceSelection; workerPid: number; guardianPid: number; snapshot: Snapshot }
async function killedHost(t: TestContext, phase: string, missingReceipt = false) {
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'b-recovery-'))); const path = join(temporary, 'host.json');
  let m: Manifest | undefined; let core: ProductCore | undefined;
  const host = spawn(process.execPath, ['--import', join(repository, 'scripts/probe-no-network.mjs'), join(import.meta.dirname, 'host-fixture.ts'), path, phase],
    { cwd: temporary, env: sterileEnvironment(temporary), stdio: ['ignore','ignore','inherit'] });
  const exit = once(host, 'exit');
  t.after(async () => {
    if (host.exitCode === null && host.signalCode === null) host.kill('SIGKILL');
    if (!m && existsSync(path)) m = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
    if (m) {
      for (const pid of [m.workerPid, m.guardianPid]) if (!gone(pid)) process.kill(pid, 'SIGKILL');
      await until(() => gone(-m!.workerPid), 'cleanup actual process group');
    }
    core?.close(); if (m) rmSync(m.root, { recursive: true, force: true }); rmSync(temporary, { recursive: true, force: true });
  });
  await until(() => existsSync(path), 'committed host checkpoint'); m = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
  if (missingReceipt) process.kill(m.guardianPid, 'SIGSTOP');
  host.kill('SIGKILL'); assert.equal((await exit)[1], 'SIGKILL');
  if (missingReceipt) { process.kill(m.workerPid, 'SIGKILL'); process.kill(m.guardianPid, 'SIGKILL'); }
  core = new ProductCore(m.database, [{ id: 'workspace', path: m.cwd }]);
  const supervisor = new WorkerSupervisor(core, { stateDirectory: join(m.root, 'state'), databaseDirectory: join(m.root, 'host'), resources: m.resources });
  const journal = JSON.parse(core.workerLaunches()[0]!.record) as { binding: Dispatch; spec: { receipt: string } };
  await until(() => gone(-m!.workerPid), 'actual killed group gone');
  if (missingReceipt) assert.equal(existsSync(journal.spec.receipt), false);
  else {
    await until(() => existsSync(journal.spec.receipt), 'actual guardian receipt');
    const receipt = JSON.parse(readFileSync(journal.spec.receipt, 'utf8')) as CleanupReceipt;
    assert.equal(receipt.exited, true); assert.equal(receipt.groupGone, true); assert.equal(receipt.workerPid, m.workerPid);
  }
  return { core, supervisor, m, journal };
}
function queueAnother(core: ProductCore, threadId: string) { core.handle({ type: 'runs.start', requestId: 'next-run', threadId, input: 'SYNTHETIC next intent' }); }
for (const phase of ['pending','approved','claimed']) test(`cold host recovery without receipt fences ${phase}, denies old approval and retains queued admission`, async t => {
  const { core, supervisor, m, journal } = await killedHost(t, phase, true);
  assert.equal(m.snapshot.runs[0]!.state, 'running');
  assert.equal(m.snapshot.operations[0]!.state, phase === 'claimed' ? 'executing' : phase);
  assert.throws(() => supervisor.recover(), /cleanup_evidence_missing/);
  const snap = core.snapshot(m.thread); const op = snap.operations[0]!;
  assert.equal(snap.runs[0]!.state, 'unknown'); assert.equal(op.state, phase === 'claimed' ? 'unknown' : 'denied');
  assert.throws(() => supervisor.command({ type: 'approvals.resolve', requestId: 'old-approval', operationId: op.id, parametersDigest: op.parametersDigest, decision: 'allow' }), /approval_not_pending/);
  assert.throws(() => core.claimOperation(journal.binding, op.id, op.parametersDigest), /stale_binding/);
  assert.equal(core.observe(journal.binding, 'activity'), false);
  const cursor = snap.cursor; assert.throws(() => supervisor.recover(), /cleanup_evidence_missing/); assert.equal(core.snapshot(m.thread).cursor, cursor);
  queueAnother(core, m.thread); assert.equal(core.dispatchNext(), undefined); assert.equal(existsSync(join(m.cwd, 'report.md')), false);
});
for (const change of ['deleted','changed','unchanged']) test(`registered artifact ${change} after host SIGKILL does not block historical reconciliation`, async t => {
  const { core, supervisor, m } = await killedHost(t, 'artifact');
  assert.equal(m.snapshot.runs[0]!.state, 'running'); assert.equal(m.snapshot.operations[0]!.state, 'succeeded'); assert.equal(m.snapshot.artifacts.length, 1);
  const artifact = m.snapshot.artifacts[0]!; const path = join(m.cwd, 'report.md');
  if (change === 'deleted') rmSync(path); else if (change === 'changed') writeFileSync(path, '# SYNTHETIC later edit\n');
  const before = existsSync(path) ? { text: readFileSync(path, 'utf8'), mtime: statSync(path).mtimeMs } : null;
  supervisor.recover(); supervisor.recover();
  const snap = core.snapshot(m.thread); assert.equal(snap.runs[0]!.state, 'failed'); assert.equal(snap.operations[0]!.state, 'succeeded');
  assert.deepEqual(snap.artifacts.map(item => ({ ...item })), [artifact]); assert.equal(core.previewArtifact(artifact.id).status, change === 'deleted' ? 'missing' : change === 'changed' ? 'changed' : 'ready');
  if (before) { assert.equal(readFileSync(path, 'utf8'), before.text); assert.equal(statSync(path).mtimeMs, before.mtime); }
  else assert.equal(existsSync(path), false);
  queueAnother(core, m.thread); assert.ok(core.dispatchNext());
});
test('unregistered succeeded artifact still requires matching bytes after actual host death', async t => {
  const { core, supervisor, m } = await killedHost(t, 'unregistered');
  assert.equal(m.snapshot.operations[0]!.state, 'succeeded'); assert.equal(m.snapshot.artifacts.length, 0);
  writeFileSync(join(m.cwd, 'report.md'), '# SYNTHETIC conflicting bytes\n');
  assert.throws(() => supervisor.recover(), /artifact_content_mismatch/);
  assert.equal(core.snapshot(m.thread).runs[0]!.state, 'unknown'); assert.equal(core.snapshot(m.thread).artifacts.length, 0);
  queueAnother(core, m.thread); assert.equal(core.dispatchNext(), undefined);
});
test('unknown operation with third file version stays blocked and is never replayed', async t => {
  const f = createScenario('written'); t.after(f.dispose); const pending = f.start();
  await f.approval(); await until(() => f.stage('written'), 'written'); process.kill(f.supervisor.workerPid!, 'SIGKILL'); await pending;
  const path = join(f.cwd, 'report.md'); const text = '# SYNTHETIC third version\n'; writeFileSync(path, text); const mtime = statSync(path).mtimeMs;
  f.reopen(); assert.throws(() => f.supervisor.recover(), /side_effect_unresolved/);
  assert.equal(f.core.snapshot(f.thread).operations[0]!.state, 'unknown'); queueAnother(f.core, f.thread); assert.equal(f.core.dispatchNext(), undefined);
  assert.equal(readFileSync(path, 'utf8'), text); assert.equal(statSync(path).mtimeMs, mtime);
});
for (const mode of ['native-late','native-replace-late']) test(`${mode}: Pi file first persists after ready; SIGKILL recovery resumes exact native history`, async t => {
  const f = createScenario(mode); t.after(f.dispose); const pending = f.start();
  await until(() => f.stage('native-late'), 'native persisted after ready');
  const path = readFileSync(join(f.cwd, '.native-path'), 'utf8'); const native = f.core.nativeSessionReference(f.thread);
  assert.equal(native.reference, path); assert.equal(native.persisted, false); assert.equal(f.core.snapshot(f.thread).runs[0]!.state, 'running');
  const contents = readFileSync(path, 'utf8'); assert.ok(contents.includes('SYNTHETIC B-IPC native response'));
  process.kill(f.supervisor.workerPid!, 'SIGKILL'); await pending;
  f.reopen(); f.supervisor.recover(); assert.equal(readFileSync(path, 'utf8'), contents);
  assert.deepEqual(f.core.nativeSessionReference(f.thread), { reference: path, persisted: true });
  queueAnother(f.core, f.thread);
  f.entry.args = [JSON.stringify({ mode: 'restore', database: f.database, tool: 'write', args: f.args })];
  const next = f.start(); await f.approval(); await next;
  assert.equal(f.core.snapshot(f.thread).runs[1]!.state, 'completed'); assert.equal(f.core.nativeSessionReference(f.thread).reference, path);
});
test('host dies after reserving Pi path but before acknowledgement: no late creation; same empty reference is reusable', async t => {
  const { core, supervisor, m } = await killedHost(t, 'native-reserved');
  const native = core.nativeSessionReference(m.thread); assert.ok(native.reference); assert.equal(native.persisted, false);
  assert.equal(existsSync(native.reference), false); assert.equal(m.snapshot.runs[0]!.state, 'starting');
  supervisor.recover(); assert.equal(core.snapshot(m.thread).runs[0]!.state, 'failed');
  queueAnother(core, m.thread); const dispatch = core.dispatchNext(); assert.ok(dispatch);
  assert.equal(dispatch.nativeSessionRef, native.reference); assert.equal(dispatch.nativeSessionPersisted, false);
});
test('empty planned Session reopens via Pi public open without inventing a transcript', async t => {
  const f = createScenario('normal'); t.after(f.dispose); const first = f.start(); await f.approval('deny'); await first;
  const native = f.core.nativeSessionReference(f.thread); assert.ok(native.reference); assert.equal(native.persisted, false); assert.equal(existsSync(native.reference), false);
  f.reopen(); queueAnother(f.core, f.thread);
  f.entry.args = [JSON.stringify({ mode: 'restore-empty', database: f.database, tool: 'write', args: f.args })];
  const next = f.start(); await until(() => f.core.snapshot(f.thread).operations.length === 2, 'next approval');
  const op = f.core.snapshot(f.thread).operations[1]!;
  f.supervisor.command({ type: 'approvals.resolve', requestId: 'next-approval', operationId: op.id, parametersDigest: op.parametersDigest, decision: 'allow' }); await next;
  assert.equal(f.core.nativeSessionReference(f.thread).reference, native.reference); assert.equal(existsSync(native.reference), false);
  assert.equal(f.core.snapshot(f.thread).runs[1]!.state, 'completed');
});
test('known persisted Session deleted before next Worker is not silently recreated as empty history', async t => {
  const f = createScenario('normal', true); t.after(f.dispose); const first = f.start(); await f.approval(); await first;
  const native = f.core.nativeSessionReference(f.thread); assert.ok(native.reference); assert.equal(native.persisted, true); rmSync(native.reference);
  f.reopen(); queueAnother(f.core, f.thread); await f.start();
  const snap = f.core.snapshot(f.thread); assert.equal(snap.runs[1]!.state, 'failed'); assert.equal(snap.operations.length, 1);
  assert.equal(existsSync(native.reference), false); assert.deepEqual(f.core.nativeSessionReference(f.thread), native);
});
test('cold recovery with known native history missing remains unknown despite valid process cleanup', async t => {
  const f = createScenario('normal', true); t.after(f.dispose); const pending = f.start();
  await until(() => f.core.snapshot(f.thread).operations.length === 1, 'approval');
  const native = f.core.nativeSessionReference(f.thread); assert.ok(native.reference); assert.equal(native.persisted, true);
  process.kill(f.supervisor.workerPid!, 'SIGKILL'); await pending; rmSync(native.reference);
  f.reopen(); assert.throws(() => f.supervisor.recover(), /native_session_missing/);
  assert.equal(f.core.snapshot(f.thread).runs[0]!.state, 'unknown'); queueAnother(f.core, f.thread); assert.equal(f.core.dispatchNext(), undefined);
  assert.equal(existsSync(native.reference), false);
});
test('schema v2 migration preserves existing native reference as known persisted', async t => {
  const f = createScenario('normal', true); t.after(f.dispose); const first = f.start(); await f.approval(); await first;
  const native = f.core.nativeSessionReference(f.thread); f.core.close();
  const db = new DatabaseSync(f.database); db.exec('DROP TABLE run_display; ALTER TABLE threads DROP COLUMN native_persisted; PRAGMA user_version=2;'); db.close();
  f.reopen(); assert.deepEqual(f.core.nativeSessionReference(f.thread), native);
  const read = new DatabaseSync(f.database, { readOnly: true }); assert.equal(read.prepare('PRAGMA user_version').get()?.user_version, 4); read.close();
});
