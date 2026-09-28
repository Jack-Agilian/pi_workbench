// Small host-owned lifetime guardian. Survives App Server SIGKILL; never imports ProductCore/Pi/SQLite.
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { CleanupReceipt, LaunchSpec } from './worker-launcher.ts';
import { IpcSender } from '../../packages/pi-adapter/ipc-channel.ts';
import { ShellExecution } from './shell-execution.ts';
import { identifier } from '../../packages/app-contracts/index.ts';
import { exact, parseEnvelope } from '../../packages/app-contracts/worker-ipc.ts';
const spec = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as LaunchSpec;
let worker: ChildProcess | undefined;
let exited = false;
let closing: Promise<void> | undefined;
const parent = new IpcSender((message, callback) => process.send!(message, callback));
const shell = spec.shell ? new ShellExecution(spec.shell, spec, () => { if (process.connected) void parent.send({ kind: 'shell-complete' }).catch(() => close()); }) : undefined;
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function groupGone(): boolean {
  if (!worker?.pid) return true;
  try { process.kill(-worker.pid, 0); return false; }
  catch (error) { return error instanceof Error && 'code' in error && error.code === 'ESRCH'; }
}
function signalGroup(signal: NodeJS.Signals) {
  if (worker?.pid && !groupGone()) { try { process.kill(-worker.pid, signal); } catch { /* absence is verified below */ } }
}
function close(): Promise<void> {
  if (closing) return closing;
  closing = (async () => {
    const shellStopped = shell?.stop(); let shellClean = true;
    void shellStopped?.catch(() => { shellClean = false; });
    signalGroup('SIGTERM');
    for (let i = 0; i < 20 && ((worker?.pid && !exited) || !groupGone()); i++) await delay(25);
    signalGroup('SIGKILL');
    for (let i = 0; i < 160 && ((worker?.pid && !exited) || !groupGone()); i++) await delay(25);
    await shellStopped?.catch(() => { shellClean = false; });
    const receipt: CleanupReceipt = { instanceId: spec.instanceId, runtimeBindingId: spec.runtimeBindingId, nonce: spec.nonce,
      workerPid: worker?.pid ?? null, exited: !worker?.pid || exited, groupGone: groupGone() && shellClean };
    // Only the host-owned directory is writable here; the Worker profile denies it.
    writeFileSync(spec.receipt + '.tmp', JSON.stringify(receipt), { flag: 'wx', mode: 0o600 }); renameSync(spec.receipt + '.tmp', spec.receipt);
    if (process.connected) await parent.send({ kind: 'cleanup' }).catch(() => {});
    parent.close(); if (process.connected) process.disconnect(); clearTimeout(lifetime);
  })();
  return closing;
}
process.on('disconnect', () => { void close(); });
process.on('SIGTERM', () => { void close(); });
const lifetime = setTimeout(() => { void close(); }, Math.max(1, spec.deadline - Date.now() + 3000));
function startWorker() {
  if (worker || closing || !process.connected) { void close(); return; }
  worker = spawn(spec.executable, spec.args, { cwd: spec.cwd, env: spec.env, detached: true, stdio: ['ignore','ignore','ignore','ipc'], serialization: 'json' });
  worker.on('error', () => { exited = true; void close(); });
  worker.on('close', () => { exited = true; toWorker.close(); void close(); });
  worker.on('disconnect', () => { void close(); });
  worker.on('spawn', () => { void parent.send({ kind: 'spawned', pid: worker!.pid }).catch(() => close()); });
  worker.on('message', raw => {
    try { const message = parseEnvelope(raw);
      if (message.instanceId !== spec.instanceId || message.runtimeBindingId !== spec.runtimeBindingId) throw new Error('stale_worker');
      void parent.send({ kind: 'worker', message }).catch(() => close());
    } catch { void close(); }
  });
}
const toWorker = new IpcSender((message, callback) => worker!.send(message, callback));
process.on('message', raw => {
  try {
    if (raw && typeof raw === 'object' && 'kind' in raw && raw.kind === 'arm' && Object.keys(raw).length === 1) {
      startWorker(); return;
    }
    if (raw && typeof raw === 'object' && 'kind' in raw && raw.kind === 'shell-start') {
      const r = exact(raw, ['kind','operationId','deadline']); identifier(r.operationId);
      if (!shell || closing || !worker || typeof r.deadline !== 'number' || r.deadline !== spec.deadline || Date.now() >= r.deadline) throw new Error('shell_not_admitted');
      shell.start(r.operationId as string, r.deadline); return;
    }
    if (raw && typeof raw === 'object' && 'kind' in raw && raw.kind === 'shell-cancel') {
      exact(raw, ['kind']); void shell?.stop().catch(() => close()); return;
    }
    const message = parseEnvelope(raw);
    if (!worker || message.instanceId !== spec.instanceId || message.runtimeBindingId !== spec.runtimeBindingId || closing) throw new Error('stale_host');
    void toWorker.send(message).catch(() => close());
  } catch { void close(); }
});
if (!process.connected) await close();
else await parent.send({ kind: 'guardian-ready' }).catch(() => close());
