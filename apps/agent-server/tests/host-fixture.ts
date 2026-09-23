// Real App Server process killed by the integration test. No alternate product implementation.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScenario, until } from './scenario.ts';
const manifest = process.argv[2]!;
const mode = process.argv[3] ?? 'descendants';
const f = createScenario(mode);
const checkpoint = () => {
  writeFileSync(manifest, JSON.stringify({ root: f.root, database: f.database, cwd: f.cwd, thread: f.thread, run: f.run, resources: f.resources,
    workerPid: f.supervisor.workerPid, guardianPid: f.supervisor.guardianPid, snapshot: f.core.snapshot(f.thread) }), { mode: 0o600 });
};
const pauseAfterCommit = () => { checkpoint(); process.kill(process.pid, 'SIGSTOP'); };
if (['approved','artifact','unregistered','native-reserved'].includes(mode)) f.core.subscribe(f.thread, 0, event => {
  if (event.kind === (mode === 'approved' ? 'approval.allow' : mode === 'artifact' ? 'artifact.recorded' : mode === 'native-reserved' ? 'session.bound' : 'operation.succeeded')) pauseAfterCommit();
});
if (mode === 'descendants') {
  f.entry.allowFixedChildren = true;
  f.entry.extraRead!.push(join(import.meta.dirname, 'descendant-fixture.mjs'));
}
const pending = f.start(); void pending.catch(() => {});
if (mode === 'dispatched') {
  writeFileSync(manifest, JSON.stringify({ root: f.root, database: f.database, cwd: f.cwd, thread: f.thread, run: f.run, resources: f.resources, workerPid: null, guardianPid: f.supervisor.guardianPid }));
  process.kill(process.pid, 'SIGKILL');
}
await until(() => !!f.supervisor.workerPid, 'worker pid');
if (mode === 'pending') { await until(() => f.core.snapshot(f.thread).operations.length === 1, 'pending'); pauseAfterCommit(); }
else if (mode === 'claimed') { await f.approval(); await until(() => f.stage('claimed'), 'claimed'); pauseAfterCommit(); }
else if (['approved','artifact','unregistered'].includes(mode)) { await f.approval(); await new Promise<void>(() => {}); }
else if (mode === 'native-reserved') await new Promise<void>(() => {});
else if (mode === 'before-ready') await until(() => f.stage('before-ready'), 'before-ready');
else { await f.approval(); await until(() => f.stage('descendants'), 'descendants'); }
checkpoint();
// The test terminates THIS process with SIGKILL; no graceful cleanup or fabricated hostClean.
setInterval(() => {}, 1000);
