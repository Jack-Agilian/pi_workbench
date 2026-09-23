// Trusted host launch policy. No renderer-supplied executable, environment or database path.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inside } from '../../packages/pi-adapter/approved-resources.ts';
import type { WorkerInit } from '../../packages/app-contracts/worker-ipc.ts';
export const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export interface LaunchSpec {
  instanceId: string; runtimeBindingId: string; nonce: string; receipt: string;
  executable: string; args: string[]; cwd: string; env: Record<string, string>; deadline: number;
}
export interface CleanupReceipt { instanceId: string; runtimeBindingId: string; nonce: string; workerPid: number | null; exited: boolean; groupGone: boolean }
export interface TrustedWorkerEntry { path: string; extraRead?: string[]; args?: string[]; allowFixedChildren?: boolean }
export function sterileEnvironment(home: string): Record<string, string> {
  const temp = join(home, 'tmp'); mkdirSync(temp, { recursive: true });
  return { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, '.config'), TMPDIR: temp, TMP: temp, TEMP: temp,
    PATH: dirname(process.execPath), PI_CODING_AGENT_DIR: join(home, 'agent'), PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', NO_COLOR: '1' };
}
export function launchSpec(config: WorkerInit, identity: { instanceId: string; nonce: string }, host: { lease: string; databaseDirectory: string }, entry?: TrustedWorkerEntry): LaunchSpec {
  if (process.platform !== 'darwin' || process.version !== 'v24.21.0') throw new Error('restricted_worker_platform_unsupported');
  const node = realpathSync(process.execPath);
  const writeRoots = [config.workspace, config.agentDir, config.sessions];
  const readRoots = [join(repository, 'node_modules'), join(repository, 'packages/pi-adapter'), join(repository, 'packages/app-contracts'),
    join(repository, 'package.json'), join(repository, 'scripts/probe-no-network.mjs'), config.resources.root, ...writeRoots, ...(entry?.extraRead ?? [])].map(p => realpathSync(p));
  const denied = [realpathSync(host.databaseDirectory), realpathSync(host.lease)];
  for (const root of readRoots) if (denied.some(d => inside(root, d) || inside(d, root))) throw new Error('host_worker_roots_overlap');
  for (const root of writeRoots) if (inside(root, config.resources.root)) throw new Error('writable_resource_snapshot');
  const home = config.agentDir; const env = sterileEnvironment(home); env.PI_CODING_AGENT_DIR = config.agentDir;
  const literals = (paths: string[]) => paths.map(p => `(subpath ${JSON.stringify(p)})`).join(' ');
  const profile = ['(version 1)', '(allow default)', '(deny network*)', '(deny file-read*)', '(allow file-read-metadata)', '(deny file-write*)',
    `(allow file-read* ${literals([...readRoots, resolve(dirname(node), '..')])})`,
    '(allow file-read* (subpath "/System") (subpath "/usr/lib") (subpath "/usr/bin") (subpath "/bin") (literal "/") (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random") (subpath "/dev/fd"))',
    `(allow file-write* ${literals(writeRoots)})`, '(allow file-write* (literal "/dev/null"))',
    `(deny file-read-data file-write* ${literals(denied)})`].join(' ');
  const flags = ['--permission', '--allow-fs-read=*', ...writeRoots.map(p => `--allow-fs-write=${p}`),
    '--import', join(repository, 'scripts/probe-no-network.mjs'), ...(entry?.allowFixedChildren ? ['--allow-child-process'] : [])];
  return { ...identity, runtimeBindingId: config.binding.runtimeBindingId, receipt: join(host.lease, 'cleanup.json'),
    executable: '/usr/bin/sandbox-exec', args: ['-p', profile, node, ...flags, entry?.path ?? join(repository, 'packages/pi-adapter/worker-entry.ts'), identity.instanceId, config.binding.runtimeBindingId, ...(entry?.args ?? [])],
    cwd: config.workspace, env, deadline: config.deadline };
}
export function spawnGuardian(spec: LaunchSpec, lease: string): ChildProcess {
  const path = join(lease, 'launch.json'); writeFileSync(path, JSON.stringify(spec), { mode: 0o600, flag: 'wx' });
  return spawn(process.execPath, [join(repository, 'apps/agent-server/worker-guardian.ts'), path], {
    cwd: lease, env: sterileEnvironment(join(lease, 'home')), stdio: ['ignore','ignore','ignore','ipc'], serialization: 'json',
  });
}
