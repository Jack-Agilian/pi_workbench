// Fixed SYNTHETIC host-death checkpoint, not a new product host or Renderer entry.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fullMacProfile, type FullMacAccess } from '../macos-access.ts';
import { shellLaunch, spawnGuardian, sterileEnvironment, type LaunchSpec } from '../worker-launcher.ts';
import { until } from './scenario.ts';
const f = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as { workspace: string; external: string; lease: string; profile: string; access: FullMacAccess; checkpoint: string };
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
const workerHome = join(f.profile, 'worker-home'); mkdirSync(workerHome);
const childCode = `const n=require('node:net'),f=require('node:fs');const server=n.createServer(s=>s.end('SYNTHETIC_SERVER'));server.listen(0,'127.0.0.1',()=>{f.writeFileSync(${JSON.stringify(join(f.external, 'port.json'))},JSON.stringify({port:server.address().port,childPid:process.pid}));setInterval(()=>f.appendFileSync(${JSON.stringify(join(f.external, 'heartbeat'))},'.'),20)});`;
const command = `${quote(process.execPath)} -e ${quote(childCode)} & wait`;
const shell = shellLaunch({ command, cwd: '.', profile: 'restricted-bash-v1', environmentPolicy: 'sterile-v1', timeoutMs: 20000 }, f.workspace, f.lease);
shell.profile = fullMacProfile(f.access);
const workerProfile = fullMacProfile({ ...f.access, network: 'brokered', privateTrees: [{ root: f.profile, writableSubtrees: [workerHome] }] });
const spec: LaunchSpec = { instanceId: 'synthetic-full', runtimeBindingId: 'synthetic-binding', nonce: 'synthetic-nonce', receipt: join(f.lease, 'cleanup.json'),
  executable: '/usr/bin/sandbox-exec', args: ['-p', workerProfile, process.execPath, '--permission', '--allow-fs-read=*', '--allow-fs-write=*', '-e', 'setInterval(()=>{},1000)'],
  cwd: f.workspace, env: sterileEnvironment(workerHome), deadline: Date.now() + 25000, shell };
const guardian = spawnGuardian(spec, f.lease);
guardian.on('message', raw => {
  if (raw && typeof raw === 'object' && 'kind' in raw) {
    if (raw.kind === 'guardian-ready') guardian.send({ kind: 'arm' });
    if (raw.kind === 'spawned') guardian.send({ kind: 'shell-start', operationId: 'synthetic-operation', deadline: spec.deadline });
  }
});
await until(() => existsSync(join(f.external, 'port.json')) && existsSync(join(f.external, 'heartbeat')), 'fixed server child');
const { port, childPid } = JSON.parse(readFileSync(join(f.external, 'port.json'), 'utf8')) as { port: number; childPid: number };
writeFileSync(f.checkpoint, JSON.stringify({ guardianPid: guardian.pid, port, childPid }));
setInterval(() => {}, 1000);
