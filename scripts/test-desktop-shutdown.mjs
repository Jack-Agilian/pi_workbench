import './check-environment.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { repository, sterileEnvironment } from '../apps/agent-server/worker-launcher.ts';
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('desktop_shutdown_platform_not_verified');
await import('./build-desktop.mjs');
const binary = join(repository, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const out = join(repository, '.artifacts/desktop-shutdown'); mkdirSync(out, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const gone = pid => { try { process.kill(pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; } };
const wait = async (predicate, label) => {
  const end = Date.now() + 25000;
  while (!predicate()) { if (Date.now() > end) throw new Error('shutdown_timeout:' + label); await delay(25); }
};
const results = [];
for (const scenario of ['idle','starting','approval','executing','cancelling','completed','sigterm','sigint','sigkill','missing-proof','unresolved','recovery-close-race']) {
  const profile = realpathSync(mkdtempSync(join(tmpdir(), '工作台 退出-')));
  const child = spawn(binary, [join(repository, 'dist/desktop/main.mjs'), '--demo', `--host-node=${realpathSync(process.execPath)}`, `--demo-profile=${profile}`, `--shutdown-test=${scenario}`],
    { cwd: profile, env: { ...sterileEnvironment(join(profile, 'home')), LANG: 'zh_CN.UTF-8' }, stdio: ['ignore','pipe','pipe'] });
  let output = ''; let exit;
  const collect = bytes => { if (output.length < 1_000_000) output += String(bytes); };
  child.stdout.on('data', collect); child.stderr.on('data', collect);
  child.once('exit', (code, signal) => { exit = { code, signal }; });
  child.once('error', error => { exit = { error: error.code }; });
  const manifest = join(profile, 'shutdown.json'); const read = () => JSON.parse(readFileSync(manifest, 'utf8'));
  let verified = false;
  try {
    if (['sigterm','sigint','sigkill'].includes(scenario)) {
      await wait(() => exit || (existsSync(manifest) && read().readyForSignal), 'signal_ready');
      assert.equal(exit, undefined); child.kill(scenario === 'sigterm' ? 'SIGTERM' : scenario === 'sigint' ? 'SIGINT' : 'SIGKILL');
    }
    await wait(() => exit, scenario + '_exit');
    assert.deepEqual(exit, scenario === 'sigkill' ? { code: null, signal: 'SIGKILL' } : { code: 0, signal: null });
    const observed = read(); assert.equal(observed.willQuit, scenario !== 'sigkill');
    assert.equal(observed.warning, ['missing-proof','unresolved','recovery-close-race'].includes(scenario));
    if (observed.warning) assert.equal(observed.blockedState, 'unknown');
    if (scenario === 'recovery-close-race') assert.equal(observed.raceWaitVerified, true);
    await wait(() => observed.processPids.every(gone), 'owned_processes_gone');
    const leases = join(profile, 'state/leases');
    const paths = existsSync(leases) ? readdirSync(leases).map(lease => join(leases, lease, 'cleanup.json')) : [];
    await wait(() => paths.every(path => {
      if (!existsSync(path)) return false;
      const receipt = JSON.parse(readFileSync(path, 'utf8'));
      return receipt.exited && receipt.groupGone && (!receipt.workerPid || gone(-receipt.workerPid));
    }), 'verified_guardian_cleanup');
    // Read-only SQLite is opened only after all captured App Server processes have exited.
    const db = new DatabaseSync(join(profile, 'host/product.sqlite'), { readOnly: true });
    let states;
    try {
      const runs = db.prepare('SELECT state FROM runs').all(); states = runs.map(run => run.state);
      if (scenario === 'idle') assert.equal(runs.length, 0);
      else if (scenario === 'completed') assert.deepEqual(states, ['completed']);
      else { assert.equal(runs.length, scenario === 'cancelling' ? 1 : 2); assert.ok(states.every(state => state === 'cancelled')); }
      assert.equal(db.prepare('SELECT count(*) AS count FROM worker_launches').get().count, scenario === 'idle' ? 0 : 1);
      assert.equal(db.prepare('SELECT count(*) AS count FROM artifacts').get().count, scenario === 'completed' ? 1 : 0);
    } finally { db.close(); }
    if (observed.completedFile) {
      const { path, text, mtime } = observed.completedFile; const file = join(profile, 'workspace', path);
      assert.equal(readFileSync(file, 'utf8'), text); assert.equal(statSync(file, { bigint: true }).mtimeNs.toString(), mtime);
    } else assert.equal(readdirSync(join(profile, 'workspace')).filter(name => name.endsWith('.md')).length, 0);
    results.push({ scenario, exit, willQuit: observed.willQuit, warning: observed.warning, states, hostCount: observed.hostPids.length, capturedProcesses: observed.processPids.length, receipts: paths.length });
    verified = true; console.log(`desktop shutdown ${scenario}: passed`);
  } finally {
    writeFileSync(join(out, scenario + '.log'), output);
    if (!exit) { child.kill('SIGKILL'); await wait(() => exit, 'failed_test_process_exit').catch(() => {}); }
    // Preserve the managed test directory on failure; never delete unverified process evidence.
    if (verified) rmSync(profile, { recursive: true, force: true });
    else writeFileSync(join(out, scenario + '-failed-profile.txt'), profile + '\n');
  }
}
console.log(JSON.stringify({ desktopShutdown: 'passed', platform: process.platform, arch: process.arch, node: process.versions.node, synthetic: true, realModelCalls: 0, results }));
