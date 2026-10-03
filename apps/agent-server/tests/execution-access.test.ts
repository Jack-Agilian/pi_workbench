// SYNTHETIC policy integration; no product full-mode admission or real model is implied.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { createServer as createSocketServer, connect } from 'node:net';
import { fullMacProfile } from '../macos-access.ts';
import { repository, shellLaunch, sterileEnvironment } from '../worker-launcher.ts';
import { ShellExecution, type ShellReceipt } from '../shell-execution.ts';
import { until } from './scenario.ts';

const quote = (text: string) => "'" + text.replaceAll("'", "'\\''") + "'";
const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), '完全访问 policy-')));
  const workspace = join(root, 'workspace'), external = join(root, 'outside'), profile = join(root, 'profile');
  const lease = join(profile, 'state/lease'), home = join(lease, 'shell-home'), credentials = join(profile, 'credentials');
  const immutable = join(root, 'runtime-copy'), nested = join(home, 'nested-private');
  for (const path of [workspace, external, lease, home, credentials, immutable, nested]) mkdirSync(path, { recursive: true });
  const database = join(profile, 'product.sqlite');
  const db = new DatabaseSync(database); db.exec("CREATE TABLE canary(value TEXT); INSERT INTO canary VALUES ('SYNTHETIC_DATABASE_CANARY')"); db.close();
  const secret = join(credentials, 'auth.json'), nestedSecret = join(nested, 'auth.json');
  writeFileSync(secret, 'SYNTHETIC_CREDENTIAL_CANARY'); writeFileSync(nestedSecret, 'SYNTHETIC_NESTED_CANARY');
  writeFileSync(join(immutable, 'code.js'), 'SYNTHETIC_READ_ONLY');
  const access = { privateTrees: [{ root: profile, writableSubtrees: [home] }, { root: nested }], readOnlyRoots: [immutable, repository, resolve(dirname(realpathSync(process.execPath)), '..')], network: 'direct' as const };
  function launch(command: string, network: 'direct' | 'brokered' = 'direct', full = true) {
    const spec = shellLaunch({ command, cwd: '.', profile: 'restricted-bash-v1', environmentPolicy: 'sterile-v1', timeoutMs: 10000 }, workspace, lease);
    // Fixed trusted test composition. No production mode can select this profile yet.
    if (full) spec.profile = fullMacProfile({ ...access, network });
    let notify = 0;
    const execution = new ShellExecution(spec, { instanceId: 'synthetic-full', runtimeBindingId: 'synthetic-binding', nonce: 'synthetic-nonce' }, () => { notify++; });
    execution.start('synthetic-operation', Date.now() + 15000);
    const finished = async () => { await until(() => notify === 1, 'shell completion'); await execution.stop(); assert.equal(notify, 1); return JSON.parse(readFileSync(spec.receipt, 'utf8')) as ShellReceipt; };
    return { execution, finished };
  }
  return { root, workspace, external, profile, lease, home, credentials, nested, immutable, database, secret, nestedSecret, access, launch,
    dispose: () => rmSync(root, { recursive: true, force: true }) };
}

test('full profile rejects missing protection, aliases, and widening exceptions', () => {
  const f = fixture();
  try {
    assert.throws(() => fullMacProfile({ ...f.access, privateTrees: [] }), /incomplete/);
    assert.throws(() => fullMacProfile({ ...f.access, readOnlyRoots: [] }), /incomplete/);
    const alias = join(f.root, 'alias'); symlinkSync(f.profile, alias);
    assert.throws(() => fullMacProfile({ ...f.access, privateTrees: [{ root: alias }] }), /noncanonical/);
    for (const path of [f.profile, f.external, '/']) assert.throws(() => fullMacProfile({ ...f.access, privateTrees: [{ root: f.profile, writableSubtrees: [path] }] }));
    assert.throws(() => fullMacProfile({ ...f.access, readOnlyRoots: [f.home] }), /writable_immutable_overlap/);
  } finally { f.dispose(); }
});

test('real Bash: outside files work, private SQLite/credentials and immutable code stay inaccessible', async () => {
  const f = fixture();
  try {
    symlinkSync(f.credentials, join(f.external, 'alias'));
    const code = `const a=require('node:assert/strict'),f=require('node:fs'),{DatabaseSync}=require('node:sqlite');
      a.equal(process.env.OPENAI_API_KEY,undefined);a.equal(process.env.NODE_OPTIONS,undefined);
      a.throws(()=>process.kill(${process.pid},0),e=>e.code==='EPERM');
      f.writeFileSync(${JSON.stringify(join(f.external, 'output.md'))},'SYNTHETIC outside');
      a.equal(f.readFileSync(${JSON.stringify(join(f.external, 'output.md'))},'utf8'),'SYNTHETIC outside');
      f.writeFileSync(${JSON.stringify(join(f.home, 'scratch'))},'own home works');
      for(const p of ${JSON.stringify([f.secret, f.nestedSecret, f.database, join(f.external, 'alias/auth.json')])}) {a.throws(()=>f.readFileSync(p));a.throws(()=>f.writeFileSync(p,'must not change'));a.throws(()=>f.linkSync(p,${JSON.stringify(join(f.external, 'linked'))}));}
      for(const p of ${JSON.stringify([f.database, join(f.profile, 'new.sqlite')])}) a.throws(()=>new DatabaseSync(p));
      const db=new DatabaseSync(${JSON.stringify(join(f.external, 'allowed.sqlite'))});db.exec('CREATE TABLE permitted(n)');db.close();
      a.equal(f.readFileSync(${JSON.stringify(join(f.immutable, 'code.js'))},'utf8'),'SYNTHETIC_READ_ONLY');
      a.throws(()=>f.writeFileSync(${JSON.stringify(join(f.immutable, 'code.js'))},'modified'));
      for(const p of ${JSON.stringify([f.credentials, f.profile, f.home, f.immutable, f.root])}) a.throws(()=>f.renameSync(p,p+'-moved'));
      f.renameSync(${JSON.stringify(join(f.external, 'output.md'))},${JSON.stringify(join(f.external, 'renamed.md'))});
      console.log('SYNTHETIC outside access and private protections verified');`;
    const { finished } = f.launch(`${quote(process.execPath)} -e ${quote(code)}`);
    const receipt = await finished(); assert.equal(receipt.outcome.exitCode, 0, receipt.outcome.stderr); assert.equal(receipt.groupGone, true);
    assert.equal(readFileSync(f.secret, 'utf8'), 'SYNTHETIC_CREDENTIAL_CANARY');
    assert.equal(readFileSync(f.nestedSecret, 'utf8'), 'SYNTHETIC_NESTED_CANARY');
    assert.equal(readFileSync(join(f.external, 'renamed.md'), 'utf8'), 'SYNTHETIC outside');
    assert.equal(existsSync(join(f.profile, 'new.sqlite')), false);
    const db = new DatabaseSync(f.database, { readOnly: true }); assert.equal(db.prepare('SELECT value FROM canary').get()!.value, 'SYNTHETIC_DATABASE_CANARY'); db.close();
  } finally { f.dispose(); }
});

test('real IP loopback succeeds only with direct networking; old workspace policy remains restricted', async () => {
  const server = createServer((_req, res) => { requests++; res.end('SYNTHETIC_LOOPBACK'); }); let requests = 0;
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    for (const mode of ['full-direct', 'full-hostname', 'full-brokered', 'restricted'] as const) {
      const f = fixture();
      try {
        const allowed = mode === 'full-direct' || mode === 'full-hostname';
        const code = `const a=require('node:assert/strict'),h=require('node:http'),f=require('node:fs');
          const p=${JSON.stringify(join(f.external, 'network.txt'))};
          ${mode === 'restricted' ? "a.throws(()=>f.writeFileSync(p,'outside'));" : "f.writeFileSync(p,'outside');"}
          h.get({hostname:'${mode === 'full-hostname' ? 'localhost' : '127.0.0.1'}',port:${address.port},path:'/synthetic',family:4},r=>{let text='';r.on('data',b=>text+=b);r.on('end',()=>{a.equal(${allowed},true);a.equal(text,'SYNTHETIC_LOOPBACK')})}).on('error',e=>{a.equal(${allowed},false);a.ok(['EPERM','EACCES'].includes(e.code))});`;
        const { finished } = f.launch(`${quote(process.execPath)} -e ${quote(code)}`, mode === 'full-brokered' ? 'brokered' : 'direct', mode !== 'restricted');
        const receipt = await finished(); assert.equal(receipt.outcome.exitCode, 0, receipt.outcome.stderr); assert.equal(receipt.groupGone, true);
      } finally { f.dispose(); }
    }
    assert.equal(requests, 2);
  } finally { await new Promise<void>((r, reject) => server.close(e => e ? reject(e) : r())); }
});

test('full ShellExecution stop is shared and kills the fixed child; external heartbeat stops', async () => {
  const f = fixture(); let execution: ShellExecution | undefined;
  try {
    const heartbeat = join(f.external, 'heartbeat'), pid = join(f.external, 'child.pid');
    const launched = f.launch(`(while :; do printf . >> ${quote(heartbeat)}; sleep 0.05; done) & echo $! > ${quote(pid)}; wait`); execution = launched.execution;
    await until(() => existsSync(heartbeat) && existsSync(pid), 'full shell child');
    const stop = execution.stop(); assert.equal(execution.stop(), stop); await stop;
    const receipt = await launched.finished(); assert.equal(receipt.groupGone, true); assert.equal(receipt.outcome.sideEffects, 'possible');
    assert.throws(() => process.kill(-receipt.pid!, 0)); assert.throws(() => process.kill(Number(readFileSync(pid, 'utf8')), 0));
    const stamp = statSync(heartbeat, { bigint: true }).mtimeNs; await pause(120); assert.equal(statSync(heartbeat, { bigint: true }).mtimeNs, stamp);
  } finally { await execution?.stop(); f.dispose(); }
});

test('full brokered Node process denies actual SQLite read/create with Node FS permission wide open', async () => {
  const f = fixture();
  try {
    const entry = join(repository, 'apps/agent-server/tests/model-isolation-fixture.ts');
    const child = spawn('/usr/bin/sandbox-exec', ['-p', fullMacProfile({ ...f.access, network: 'brokered' }), process.execPath,
      '--permission', '--allow-fs-read=*', '--allow-fs-write=*', entry, f.database, '1'], { cwd: f.workspace, env: sterileEnvironment(f.home), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
    const exit = await new Promise<number | null>((r, reject) => { child.once('error', reject); child.once('close', r); });
    assert.equal(exit, 0, output); assert.equal(existsSync(f.database + '.worker-created'), false);
  } finally { f.dispose(); }
});

test('direct IP access does not permit connecting to an unrelated Unix service', async () => {
  const f = fixture(); let connected = false;
  const server = createSocketServer(socket => { connected = true; socket.end('SYNTHETIC_SERVICE_CANARY'); });
  // Darwin sockaddr_un has a short path limit; use a dedicated managed short temp root.
  const socketRoot = realpathSync(mkdtempSync('/tmp/pw-socket-')), path = join(socketRoot, 'service.sock');
  try {
    await new Promise<void>((r, reject) => { server.once('error', reject); server.listen(path, r); });
    const code = `const a=require('node:assert/strict'),n=require('node:net');const s=n.connect(${JSON.stringify(path)});s.on('connect',()=>{s.destroy();throw Error('unexpected connection')});s.on('error',e=>a.ok(['EPERM','EACCES'].includes(e.code)));`;
    const receipt = await f.launch(`${quote(process.execPath)} -e ${quote(code)}`).finished();
    assert.equal(receipt.outcome.exitCode, 0, receipt.outcome.stderr); assert.equal(connected, false);
  } finally { await new Promise<void>(r => server.close(() => r())); rmSync(socketRoot, { recursive: true, force: true }); f.dispose(); }
});

test('actual host SIGKILL: existing guardian closes full-access shell, fixed server child, and external heartbeat', async () => {
  const f = fixture(); let host: ReturnType<typeof spawn> | undefined; let hostExit: Promise<void> | undefined;
  let guardianPid: number | undefined;
  try {
    const manifest = join(f.root, 'fixture.json'), checkpoint = join(f.root, 'ready.json');
    writeFileSync(manifest, JSON.stringify({ workspace: f.workspace, external: f.external, lease: f.lease, profile: f.profile, access: f.access, checkpoint }));
    host = spawn(process.execPath, [join(repository, 'apps/agent-server/tests/execution-access-host.ts'), manifest], { cwd: f.workspace, env: sterileEnvironment(join(f.root, 'host-home')), stdio: 'ignore' });
    hostExit = new Promise<void>((r, reject) => { host!.once('error', reject); host!.once('close', () => r()); });
    await until(() => existsSync(checkpoint), 'full access host checkpoint');
    const ready = JSON.parse(readFileSync(checkpoint, 'utf8')) as { guardianPid: number; port: number; childPid: number };
    guardianPid = ready.guardianPid;
    const checkPort = () => new Promise<boolean>(r => {
      const socket = connect({ host: '127.0.0.1', port: ready.port });
      socket.setTimeout(500, () => { socket.destroy(); r(false); });
      socket.once('connect', () => { socket.destroy(); r(true); }); socket.once('error', () => r(false));
    });
    assert.equal(await checkPort(), true);
    host.kill('SIGKILL'); await hostExit;
    await until(() => existsSync(join(f.lease, 'cleanup.json')), 'guardian cleanup receipt');
    const cleanup = JSON.parse(readFileSync(join(f.lease, 'cleanup.json'), 'utf8')) as { groupGone: boolean; exited: boolean };
    const shell = JSON.parse(readFileSync(join(f.lease, 'shell.json'), 'utf8')) as ShellReceipt;
    assert.equal(cleanup.groupGone, true); assert.equal(cleanup.exited, true); assert.equal(shell.groupGone, true);
    assert.equal(shell.outcome.sideEffects, 'possible'); assert.throws(() => process.kill(-shell.pid!, 0));
    assert.throws(() => process.kill(ready.childPid, 0)); assert.equal(await checkPort(), false);
    const heartbeat = join(f.external, 'heartbeat'), before = statSync(heartbeat, { bigint: true }).mtimeNs;
    await pause(120); assert.equal(statSync(heartbeat, { bigint: true }).mtimeNs, before);
    await until(() => { try { process.kill(guardianPid!, 0); return false; } catch { return true; } }, 'guardian exit');
  } finally {
    host?.kill('SIGKILL'); await hostExit;
    if (guardianPid) { try { process.kill(guardianPid, 'SIGTERM'); } catch { /* already gone */ } }
    // Even a failed checkpoint must wait for the real guardian receipt before deleting files.
    if (existsSync(join(f.lease, 'launch.json'))) await until(() => existsSync(join(f.lease, 'cleanup.json')), 'fixture cleanup after host exit');
    f.dispose();
  }
});
