import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { parseCommand, sha256, type Dispatch } from '../../packages/app-contracts/index.ts';
import { exact, parseEnvelope, type Envelope, type ResourceSelection, type WireBody, type WorkerInit } from '../../packages/app-contracts/worker-ipc.ts';
import { IpcSender } from '../../packages/pi-adapter/ipc-channel.ts';
import { inside, verifyContent } from '../../packages/pi-adapter/approved-resources.ts';
import { ProductCore } from './core.ts';
import { artifactPath, inspectMarkdown } from './artifact.ts';
import { launchSpec, spawnGuardian, type LaunchSpec, type TrustedWorkerEntry } from './worker-launcher.ts';

/** Host-approved one-operation intent. Not a Renderer command and not accepted from the Worker. */
export interface ExecutionPlan { tool: 'write' | 'edit'; target: string; parametersDigest: string; fileVersion: string | null; expectedContentDigest: string; deadline: number }
interface Journal { binding: Dispatch; config: WorkerInit; plan: ExecutionPlan; spec: LaunchSpec; lease: string }
interface Active {
  journal: Journal; child: ChildProcess; sender: IpcSender; done: Promise<void>; resolve: () => void; reject: (error: unknown) => void;
  pid?: number; armed: boolean; hello: boolean; ready: boolean; closed: boolean; result?: boolean; nativeRef?: string;
  requests: Map<string, string>; replies: Map<string, WireBody>; pending: Map<string, string>; startedAt: number;
}
export interface SupervisorOptions { stateDirectory: string; databaseDirectory: string; resources: ResourceSelection; readyTimeoutMs?: number }
export class WorkerSupervisor {
  private readonly core: ProductCore;
  private readonly options: SupervisorOptions;
  private active?: Active;
  private sequence = 0;
  private closeResult?: Promise<void>;
  constructor(core: ProductCore, options: SupervisorOptions) { this.core = core; this.options = options; }
  get workerPid() { return this.active?.pid; }
  get guardianPid() { return this.active?.child.pid; }
  get completion() { return this.active?.done; }
  command(raw: unknown) {
    const command = parseCommand(raw); const ack = this.core.handle(command);
    const active = this.active;
    if (active && command.type === 'approvals.resolve') this.deliverApproval(active, command.operationId);
    if (active && command.type === 'runs.cancel' && command.runId === active.journal.binding.runId) {
      void this.send(active, { type: 'cancel' }).catch(() => this.stop(active));
      // Acknowledgement means request persisted. Hung SDK/driver is killed after bounded grace.
      const timer = setTimeout(() => this.stop(active), 400); void active.done.then(() => clearTimeout(timer), () => clearTimeout(timer));
    }
    return ack;
  }
  /** Only trusted host composition selects plans/entry. Product commands cannot set either. */
  startNext(plan: ExecutionPlan, entry?: TrustedWorkerEntry): Promise<void> | undefined {
    if (this.active) return this.active.done;
    sha256(plan.parametersDigest); sha256(plan.expectedContentDigest); if (plan.fileVersion !== null) sha256(plan.fileVersion);
    if (!['write','edit'].includes(plan.tool) || plan.deadline <= Date.now() || plan.deadline > Date.now() + 120_000) throw new Error('invalid_execution_plan');
    let journal: Journal | undefined; let child: ChildProcess | undefined;
    let binding: Dispatch | undefined;
    try { binding = this.core.dispatchNext(dispatch => {
      const workspace = this.core.workspacePath(dispatch.workspaceId); artifactPath(workspace, plan.target);
      const lease = join(this.options.stateDirectory, 'leases', randomUUID());
      const agentDir = join(this.options.stateDirectory, 'workers', randomUUID());
      const sessions = join(this.options.stateDirectory, 'sessions', dispatch.threadId);
      for (const dir of [lease, agentDir, sessions]) mkdirSync(dir, { recursive: true, mode: 0o700 });
      const config: WorkerInit = { binding: dispatch, workspace, agentDir, sessions, resources: structuredClone(this.options.resources), deadline: plan.deadline };
      const spec = launchSpec(config, { instanceId: randomUUID(), nonce: randomUUID() }, { lease, databaseDirectory: this.options.databaseDirectory }, entry);
      journal = { binding: dispatch, config, plan: Object.freeze({ ...plan }), spec, lease };
      // Guardian exists before commit, but may not launch any Worker until the committed host arms it.
      child = spawnGuardian(spec, lease); return JSON.stringify(journal);
    }); } catch (error) { if (child?.connected) child.disconnect(); throw error; }
    if (!binding || !journal || !child) return;
    const guardian = child;
    let resolve!: () => void; let reject!: (error: unknown) => void; const done = new Promise<void>((r, e) => { resolve = r; reject = e; });
    this.closeResult = done;
    const sender = new IpcSender((message, callback) => guardian.send(message, callback));
    const active: Active = { journal, child: guardian, sender, done, resolve, reject, armed: false, hello: false, ready: false, closed: false, requests: new Map(), replies: new Map(), pending: new Map(), startedAt: Date.now() };
    this.active = active;
    guardian.on('message', raw => { try { this.receive(active, raw); } catch { this.stop(active); } });
    guardian.on('error', () => this.stop(active));
    guardian.once('exit', () => { void this.finish(active); });
    guardian.once('close', () => { if (!guardian.pid) void this.finish(active); });
    const timer = setInterval(() => {
      if ((!active.ready && Date.now() - active.startedAt > (this.options.readyTimeoutMs ?? 5000)) || Date.now() >= plan.deadline) this.stop(active);
    }, 50); void done.then(() => clearInterval(timer), () => clearInterval(timer));
    return done;
  }
  private send(active: Active, body: WireBody, requestId = `host-${++this.sequence}`): Promise<void> {
    const { spec } = active.journal;
    return active.sender.send({ version: 3, instanceId: spec.instanceId, runtimeBindingId: spec.runtimeBindingId, requestId, body } satisfies Envelope);
  }
  private receive(active: Active, raw: unknown) {
    if (this.active !== active) return; // closure bound to actual child handle, never routable by message strings
    const outer = exact(raw, Object.hasOwn(Object(raw), 'message') ? ['kind','message'] : Object.hasOwn(Object(raw), 'pid') ? ['kind','pid'] : ['kind']);
    if (outer.kind === 'guardian-ready') {
      if (active.armed) throw new Error('duplicate_guardian_ready'); active.armed = true;
      void active.sender.send({ kind: 'arm' }).catch(() => this.stop(active)); return;
    }
    if (outer.kind === 'spawned') { if (active.pid || typeof outer.pid !== 'number' || !Number.isSafeInteger(outer.pid)) throw new Error('invalid_spawn'); active.pid = outer.pid; return; }
    if (outer.kind === 'cleanup') return;
    if (outer.kind !== 'worker') throw new Error('unknown_guardian_message');
    const message = parseEnvelope(outer.message); const { body, requestId } = message; const { binding, config, plan, spec } = active.journal;
    if (message.instanceId !== spec.instanceId || message.runtimeBindingId !== binding.runtimeBindingId) throw new Error('stale_connection');
    const serialized = JSON.stringify(body); const prior = active.requests.get(requestId);
    if (prior) {
      if (prior !== serialized) throw new Error('request_id_conflict');
      const reply = active.replies.get(requestId); if (reply) void this.send(active, reply, requestId).catch(() => this.stop(active)); return;
    }
    if (active.requests.size >= 128) throw new Error('request_limit'); active.requests.set(requestId, serialized);
    switch (body.type) {
      case 'hello':
        if (active.hello || body.pid !== active.pid) throw new Error('unexpected_worker'); active.hello = true;
        void this.send(active, { type: 'init', config }).catch(() => this.stop(active)); break;
      case 'session-reference': {
        if (!active.hello || active.closed) throw new Error('unexpected_native_reference');
        this.nativeReference(active, body.nativeRef, true);
        const reply: WireBody = { type: 'session-reference-accepted' }; active.replies.set(requestId, reply);
        void this.send(active, reply, requestId).catch(() => this.stop(active)); break;
      }
      case 'ready':
        if (!active.hello || active.ready || body.resourceLock !== config.resources.id) throw new Error('resource_lock_mismatch');
        verifyContent(config.resources); this.nativeReference(active, body.nativeRef);
        this.core.markRunning(binding); active.ready = true; void this.send(active, { type: 'start' }).catch(() => this.stop(active)); break;
      case 'operation': {
        if (!active.ready || body.tool !== plan.tool || body.target !== plan.target || body.parametersDigest !== plan.parametersDigest || body.resourceLock !== config.resources.id) throw new Error('operation_not_in_host_plan');
        verifyContent(config.resources);
        if (active.pending.size) throw new Error('one_operation_per_run');
        const op = this.core.requestOperation(binding, { toolCallId: body.toolCallId, tool: plan.tool, parametersDigest: plan.parametersDigest, deadline: plan.deadline, artifactPath: plan.target });
        active.pending.set(op.id, requestId); this.deliverApproval(active, op.id); break;
      }
      case 'result': {
        if (!active.pending.has(body.operationId)) throw new Error('unowned_operation');
        const operation = this.core.snapshot(binding.threadId).operations.find(op => op.id === body.operationId);
        if (operation?.state !== 'executing') throw new Error('result_before_claim');
        const version = this.fileVersion(active.journal);
        if (body.ok && version === plan.expectedContentDigest) {
          this.core.finishOperation(binding, operation.id, 'succeeded', version); this.core.recordArtifact(binding, operation.id, plan.target);
        } else if (version === plan.fileVersion) this.core.finishOperation(binding, operation.id, 'failed');
        else this.core.finishOperation(binding, operation.id, 'unknown'); break;
      }
      case 'observation': if (active.ready && !active.closed) this.core.observe(binding, body); break;
      case 'presentation': if (!active.ready || active.closed) throw new Error('unexpected_presentation'); this.core.projectSession(binding, body.projection); break;
      case 'done': if (!active.ready || active.result !== undefined) throw new Error('unexpected_done'); active.result = body.ok; void this.send(active, { type: 'close' }).catch(() => this.stop(active)); break;
      case 'closed': active.closed = true; this.nativeReference(active, body.nativeRef); break;
      case 'fault': this.stop(active); break;
      default: throw new Error('unexpected_worker_message');
    }
  }
  private nativeFile(journal: Journal, reference: string): boolean {
    if (!inside(journal.config.sessions, reference) || dirname(reference) !== realpathSync(journal.config.sessions) || !reference.endsWith('.jsonl')) throw new Error('invalid_native_reference');
    try {
      const stat = lstatSync(reference);
      if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(reference) !== reference) throw new Error('invalid_native_reference');
      return true;
    } catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false; throw error; }
  }
  private nativeReference(active: Active, reference: string | null, reserve = false) {
    if (reference === null) return;
    if (!reserve && reference !== active.nativeRef) throw new Error('unreserved_native_reference');
    const persisted = this.nativeFile(active.journal, reference);
    const prior = this.core.nativeSessionReference(active.journal.binding.threadId);
    if (reference === prior.reference && prior.persisted && !persisted) throw new Error('native_session_missing');
    this.core.bindNativeSession(active.journal.binding, reference, persisted); active.nativeRef = reference;
  }
  private fileVersion(journal: Journal): string | null {
    const path = join(journal.config.workspace, artifactPath(journal.config.workspace, journal.plan.target));
    if (!existsSync(path)) return null;
    return inspectMarkdown(journal.config.workspace, journal.plan.target).digest;
  }
  private deliverApproval(active: Active, operationId: string) {
    const requestId = active.pending.get(operationId); if (!requestId || active.replies.has(requestId)) return;
    const { binding, plan, config } = active.journal;
    const op = this.core.snapshot(binding.threadId).operations.find(o => o.id === operationId); if (!op) return;
    let reply: WireBody = { type: 'deny' };
    if (op.state === 'approved') {
      try {
        verifyContent(config.resources); if (this.fileVersion(active.journal) !== plan.fileVersion) throw new Error('file_version_changed');
        this.core.claimOperation(binding, operationId, plan.parametersDigest);
        reply = { type: 'grant', operationId, parametersDigest: plan.parametersDigest, expiresAt: plan.deadline, fileVersion: plan.fileVersion };
      } catch { this.stop(active); return; }
    } else if (op.state !== 'denied') return;
    active.replies.set(requestId, reply); void this.send(active, reply, requestId).catch(() => this.stop(active));
  }
  private stop(active: Active) { if (active.child.connected) active.child.disconnect(); }
  close(): Promise<void> { const active = this.active; if (!active) return this.closeResult ?? Promise.resolve(); this.stop(active); return active.done; }
  private clean(journal: Journal): boolean {
    try {
      const r = exact(JSON.parse(readFileSync(journal.spec.receipt, 'utf8')), ['instanceId','runtimeBindingId','nonce','workerPid','exited','groupGone']);
      return r.instanceId === journal.spec.instanceId && r.runtimeBindingId === journal.binding.runtimeBindingId && r.nonce === journal.spec.nonce && r.exited === true && r.groupGone === true;
    } catch { return false; }
  }
  private async finish(active: Active): Promise<void> {
    active.sender.close();
    try {
      const { binding, spec } = active.journal;
      if (!active.armed && !existsSync(spec.receipt)) {
        // Owned guardian has exited and was never armed: protocol forbids it from spawning a Worker.
        writeFileSync(spec.receipt, JSON.stringify({ instanceId: spec.instanceId, runtimeBindingId: binding.runtimeBindingId,
          nonce: spec.nonce, workerPid: null, exited: true, groupGone: true }), { flag: 'wx', mode: 0o600 });
      }
      const clean = this.clean(active.journal);
      if (clean) {
        const snap = this.core.snapshot(binding.threadId); const run = snap.runs.find(r => r.id === binding.runId)!;
        const outstanding = snap.operations.some(o => o.runId === run.id && ['pending','approved','executing','unknown'].includes(o.state));
        if (active.closed && active.result !== undefined && run.state !== 'unknown' && !outstanding) {
          this.core.settle(binding, run.state === 'cancelling' ? 'cancelled' : active.result && snap.operations.filter(o => o.runId === run.id).length === 1 && snap.operations.some(o => o.runId === run.id && o.state === 'succeeded') ? 'completed' : 'failed', { piIdle: true, hostClean: true });
        } else {
          this.core.recoverAfterCrash();
          if (run.state === 'starting' && !outstanding) this.core.reconcileRun(run.id, 'failed', { piIdle: true, hostClean: true });
        }
      }
      // Missing proof keeps admission blocked, and close callers share the failure.
      if (!clean) { this.core.workerDisconnected(binding); throw new Error('cleanup_evidence_missing'); }
      active.resolve();
    } catch (error) { active.reject(error); }
    finally { if (this.active === active) this.active = undefined; }
  }
  /** Explicit reconciliation after actual guardian cleanup. Reads files; NEVER replays tools. */
  recover(): void {
    if (this.active) throw new Error('worker_still_owned');
    // Cold takeover revokes old logical authority even when physical cleanup cannot be proven.
    this.core.fencePreviousHost();
    const journals = this.core.workerLaunches().map(row => ({ ...row, journal: JSON.parse(row.record) as Journal }));
    const pending = journals.filter(({ journal }) => this.core.snapshot(journal.binding.threadId).runs.some(r => r.id === journal.binding.runId && ['starting','running','cancelling','unknown'].includes(r.state)));
    if (pending.some(({ journal }) => !this.clean(journal))) throw new Error('cleanup_evidence_missing');
    this.core.recoverAfterCrash();
    for (const { journal, cancelRequested } of pending) {
      const { binding, plan } = journal;
      const native = this.core.nativeSessionReference(binding.threadId);
      if (native.reference) {
        if (this.nativeFile(journal, native.reference)) this.core.reconcileNativeSession(binding.runId, native.reference);
        else if (native.persisted) throw new Error('native_session_missing');
      }
      for (const op of this.core.snapshot(binding.threadId).operations.filter(o => o.runId === binding.runId)) {
        if (op.state === 'unknown') {
          const version = this.fileVersion(journal);
          if (version === plan.expectedContentDigest) this.core.reconcileOperation(op.id, 'succeeded', version);
          else if (version === plan.fileVersion) this.core.reconcileOperation(op.id, 'failed');
          else throw new Error('side_effect_unresolved');
        }
        const current = this.core.snapshot(binding.threadId).operations.find(o => o.id === op.id)!;
        if (current.state === 'succeeded') this.core.reconcileArtifact(binding, op.id, plan.target);
      }
      this.core.reconcileRun(binding.runId, cancelRequested ? 'cancelled' : 'failed', { piIdle: true, hostClean: true });
    }
  }
}
