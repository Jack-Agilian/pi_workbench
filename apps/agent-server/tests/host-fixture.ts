// Real App Server process killed by the integration test. No alternate product implementation.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScenario, until } from './scenario.ts';
const manifest = process.argv[2]!;
const f = createScenario(process.argv[3] ?? 'descendants');
if (process.argv[3] !== 'before-ready') {
  f.entry.allowFixedChildren = true;
  f.entry.extraRead!.push(join(import.meta.dirname, 'descendant-fixture.mjs'));
}
const pending = f.start(); void pending.catch(() => {});
if (process.argv[3] === 'dispatched') {
  writeFileSync(manifest, JSON.stringify({ root: f.root, database: f.database, cwd: f.cwd, thread: f.thread, run: f.run, resources: f.resources, workerPid: null, guardianPid: f.supervisor.guardianPid }));
  process.kill(process.pid, 'SIGKILL');
}
await until(() => !!f.supervisor.workerPid, 'worker pid');
if (process.argv[3] !== 'before-ready') { await f.approval(); await until(() => f.stage('descendants'), 'descendants'); }
else await until(() => f.stage('before-ready'), 'before-ready');
writeFileSync(manifest, JSON.stringify({ root: f.root, database: f.database, cwd: f.cwd, thread: f.thread, run: f.run, resources: f.resources,
  workerPid: f.supervisor.workerPid, guardianPid: f.supervisor.guardianPid }), { mode: 0o600 });
// The test terminates THIS process with SIGKILL; no graceful cleanup or fabricated hostClean.
setInterval(() => {}, 1000);
