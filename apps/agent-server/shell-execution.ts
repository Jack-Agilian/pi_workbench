// Guardian-owned single Bash process group. No Pi, product database or renderer API.
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, renameSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import type { ShellIntent, ShellOutcome } from '../../packages/app-contracts/shell.ts';
export interface ShellLaunch { intent: ShellIntent; profile: string; cwd: string; env: Record<string,string>; receipt: string }
export interface ShellReceipt { instanceId: string; runtimeBindingId: string; nonce: string; operationId: string | null; pid: number | null; groupGone: boolean; outcome: ShellOutcome }
const gone = (pid?: number) => { if (!pid) return true; try { process.kill(-pid, 0); return false; } catch (e) { return e instanceof Error && 'code' in e && e.code === 'ESRCH'; } };
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export class ShellExecution {
  private child?: ChildProcess; private started = false; private operationId: string | null = null;
  private finished?: Promise<void>; private stopResult?: Promise<void>; private timer?: ReturnType<typeof setTimeout>;
  private stdout = ''; private stderr = ''; private bytes = { stdout: 0, stderr: 0 };
  private decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
  private outcome: ShellOutcome = { exitCode: null, signal: null, timedOut: false, stdout: '', stderr: '', truncated: false, sideEffects: 'not-started' };
  private spec: ShellLaunch; private identity: { instanceId: string; runtimeBindingId: string; nonce: string }; private notify: () => void;
  constructor(spec: ShellLaunch, identity: { instanceId: string; runtimeBindingId: string; nonce: string }, notify: () => void) { this.spec = spec; this.identity = { instanceId: identity.instanceId, runtimeBindingId: identity.runtimeBindingId, nonce: identity.nonce }; this.notify = notify; }
  start(operationId: string, deadline: number): void {
    if (this.started || this.stopResult || Date.now() >= deadline) throw new Error('shell_start_not_admitted');
    this.started = true; this.operationId = operationId;
    // The guardian already owns this instance before spawn. No PID supplied by a Worker grants authority.
    const child = spawn('/usr/bin/sandbox-exec', ['-p', this.spec.profile, '/bin/bash', '--noprofile', '--norc', '-c', this.spec.intent.command],
      { cwd: this.spec.cwd, env: this.spec.env, detached: true, stdio: ['ignore','pipe','pipe'] });
    this.child = child;
    if (child.pid) this.outcome.sideEffects = 'possible';
    const collect = (name: 'stdout' | 'stderr', data: Buffer) => {
      const remaining = 4000 - this.bytes[name];
      if (data.length > remaining) this.outcome.truncated = true;
      const kept = data.subarray(0, Math.max(0, remaining)); this.bytes[name] += kept.length;
      this[name] += this.decoders[name].write(kept);
    };
    child.stdout!.on('data', data => collect('stdout', data)); child.stderr!.on('data', data => collect('stderr', data));
    this.finished = new Promise<void>((resolve, reject) => {
      let completing = false;
      const finish = (code: number | null, signal: NodeJS.Signals | null) => {
        if (completing) return; completing = true; clearTimeout(this.timer);
        this.outcome.exitCode = code; this.outcome.signal = signal;
        // Shell exit alone is insufficient: terminate remaining ordinary same-group children.
        void this.clearGroup().then(async () => {
          child.stdout?.destroy(); child.stderr?.destroy();
          this.stdout += this.decoders.stdout.end(); this.stderr += this.decoders.stderr.end();
          this.save(); this.notify(); resolve();
        }).catch(reject);
      };
      child.once('error', () => finish(null, null));
      // close drains output, while exit starts descendant cleanup to avoid inherited-pipe hangs.
      child.once('exit', () => { void this.clearGroup().catch(() => {}); });
      child.once('close', finish);
    });
    void this.finished.catch(() => {});
    this.timer = setTimeout(() => { this.outcome.timedOut = true; void this.stop().catch(() => {}); }, Math.min(this.spec.intent.timeoutMs, deadline - Date.now()));
  }
  private clearing?: Promise<void>;
  private clearGroup(): Promise<void> {
    if (!this.clearing) this.clearing = (async () => {
      const pid = this.child?.pid;
      for (const signal of ['SIGTERM','SIGKILL'] as const) {
        if (!gone(pid)) { try { process.kill(-pid!, signal); } catch { /* checked below */ } }
        for (let i = 0; i < (signal === 'SIGTERM' ? 12 : 160) && !gone(pid); i++) await delay(25);
      }
      if (!gone(pid)) throw new Error('shell_group_not_clean');
    })();
    return this.clearing;
  }
  private save() {
    const value: ShellReceipt = { ...this.identity, operationId: this.operationId, pid: this.child?.pid ?? null, groupGone: gone(this.child?.pid),
      outcome: { ...this.outcome, stdout: this.stdout, stderr: this.stderr } };
    writeFileSync(this.spec.receipt + '.tmp', JSON.stringify(value), { mode: 0o600 }); renameSync(this.spec.receipt + '.tmp', this.spec.receipt);
  }
  stop(): Promise<void> {
    if (!this.stopResult) this.stopResult = (async () => {
      clearTimeout(this.timer); await this.clearGroup();
      if (this.finished) await this.finished; else this.save();
    })();
    return this.stopResult;
  }
}
