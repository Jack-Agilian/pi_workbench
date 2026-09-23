// Minimal product host. SQLite contains product intents/indexes, never Pi messages or a Session tree.
import { randomUUID } from 'node:crypto';
import { chmodSync, realpathSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { identifier, parseCommand, sha256, type Ack, type ArtifactView, type Binding, type Dispatch,
  type OperationView, type ProductEvent, type RuntimeObservation, type RunView, type Snapshot, type ThreadView } from '../../packages/app-contracts/index.ts';
import { artifactPath, inspectMarkdown } from './artifact.ts';

type Run = RunView & { input: string; runtimeBindingId: string | null; workerEpoch: string | null; sessionGeneration: string | null };
type Operation = OperationView & { runtimeBindingId: string; contentDigest: string | null };
const active = "('starting','running','cancelling','unknown')";
const outstanding = "('pending','approved','executing','unknown')";
const terminal = new Set(['completed', 'failed', 'cancelled']);
const runColumns = 'id, thread_id AS threadId, state, input, binding_id AS runtimeBindingId, worker_epoch AS workerEpoch, session_generation AS sessionGeneration';
const operationColumns = 'id, run_id AS runId, tool_call_id AS toolCallId, tool, digest AS parametersDigest, artifact_path AS artifactPath, deadline, state, binding_id AS runtimeBindingId, content_digest AS contentDigest';
const artifactColumns = 'id, run_id AS runId, operation_id AS operationId, path, version, digest, bytes';
const eventColumns = 'seq, run_seq AS runSeq, thread_id AS threadId, run_id AS runId, kind, entity_id AS entityId, event_type AS eventType, source_type AS sourceType';
interface Subscription { active: boolean; draining: boolean; cursor: number; failed: boolean; threadId: string; listener: (event: ProductEvent) => void }

export class ProductCore {
  private readonly db: DatabaseSync;
  private readonly epoch = randomUUID();
  private readonly subscriptions = new Set<Subscription>();
  private closed = false;
  constructor(path: string, workspaces: readonly { id: string; path: string }[]) {
    this.db = new DatabaseSync(path, { allowExtension: false, enableForeignKeyConstraints: true, enableDoubleQuotedStringLiterals: false });
    try {
      if (path !== ':memory:') chmodSync(path, 0o600);
      this.db.exec('PRAGMA busy_timeout=1000; PRAGMA synchronous=FULL;');
      const version = this.one<{ user_version: number }>('PRAGMA user_version').user_version;
      if (version !== 0 && version !== 1 && version !== 2) throw new Error('unsupported_database_version');
      if (version === 0) {
        this.db.exec(`BEGIN IMMEDIATE;
          CREATE TABLE workspaces(id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE) STRICT;
          CREATE TABLE threads(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), title TEXT NOT NULL, native_ref TEXT) STRICT;
          CREATE TABLE runs(id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES threads(id), input TEXT NOT NULL,
            state TEXT NOT NULL CHECK(state IN ('queued','starting','running','cancelling','unknown','completed','failed','cancelled')),
            binding_id TEXT UNIQUE, worker_epoch TEXT, session_generation TEXT) STRICT;
          CREATE UNIQUE INDEX single_writer ON runs((1)) WHERE state IN ${active};
          CREATE TABLE operations(id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), binding_id TEXT NOT NULL,
            tool_call_id TEXT NOT NULL, tool TEXT NOT NULL, digest TEXT NOT NULL, deadline REAL NOT NULL,
            state TEXT NOT NULL CHECK(state IN ('pending','approved','executing','unknown','succeeded','failed','denied')), content_digest TEXT, artifact_path TEXT,
            UNIQUE(run_id,tool_call_id)) STRICT;
          CREATE UNIQUE INDEX one_operation ON operations(run_id) WHERE state IN ${outstanding};
          CREATE TABLE approvals(operation_id TEXT PRIMARY KEY REFERENCES operations(id), decision TEXT NOT NULL CHECK(decision IN ('pending','allow','deny','revoked'))) STRICT;
          CREATE TABLE artifacts(id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), operation_id TEXT NOT NULL REFERENCES operations(id),
            workspace_id TEXT NOT NULL REFERENCES workspaces(id), path TEXT NOT NULL, version INTEGER NOT NULL, digest TEXT NOT NULL, bytes INTEGER NOT NULL,
            UNIQUE(workspace_id,path,version), UNIQUE(operation_id,path,digest)) STRICT;
          CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT, run_seq INTEGER NOT NULL, thread_id TEXT NOT NULL REFERENCES threads(id),
            run_id TEXT NOT NULL, kind TEXT NOT NULL, entity_id TEXT NOT NULL, event_type TEXT, source_type TEXT) STRICT;
          CREATE TABLE requests(id TEXT PRIMARY KEY, command TEXT NOT NULL, response TEXT NOT NULL) STRICT;
          PRAGMA user_version=1; COMMIT;`);
      }
      if (version < 2) this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE worker_launches(run_id TEXT PRIMARY KEY REFERENCES runs(id), record TEXT NOT NULL, cancel_requested INTEGER NOT NULL DEFAULT 0) STRICT;
        PRAGMA user_version=2; COMMIT;`);
      this.transaction(() => {
        for (const workspace of workspaces) {
          identifier(workspace.id); const canonical = realpathSync(workspace.path);
          const prior = this.get<{ path: string }>('SELECT path FROM workspaces WHERE id=?', workspace.id);
          if (prior && prior.path !== canonical) throw new Error('workspace_mapping_changed');
          if (!prior) this.db.prepare('INSERT INTO workspaces VALUES (?,?)').run(workspace.id, canonical);
        }
      });
    } catch (error) { this.db.close(); throw error; }
  }
  // These row casts describe our own STRICT schema, not an external API compatibility escape.
  private get<T>(sql: string, ...values: SQLInputValue[]): T | undefined { return this.db.prepare(sql).get(...values) as T | undefined; }
  private all<T>(sql: string, ...values: SQLInputValue[]): T[] { return this.db.prepare(sql).all(...values) as T[]; }
  private one<T>(sql: string, ...values: SQLInputValue[]): T {
    const value = this.get<T>(sql, ...values); if (!value) throw new Error('not_found'); return value;
  }
  private transaction<T>(fn: () => T, write = true): T {
    if (this.closed) throw new Error('closed');
    this.db.exec(write ? 'BEGIN IMMEDIATE' : 'BEGIN');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private mutate<T>(fn: () => T): T {
    const result = this.transaction(fn);
    for (const subscription of this.subscriptions) this.drain(subscription);
    return result;
  }
  private run(id: string) { return this.one<Run>(`SELECT ${runColumns} FROM runs WHERE id=?`, id); }
  private operation(id: string) { return this.one<Operation>(`SELECT ${operationColumns} FROM operations WHERE id=?`, id); }
  private bound(binding: Binding): Run {
    const run = this.run(binding.runId);
    if (run.threadId !== binding.threadId || run.runtimeBindingId !== binding.runtimeBindingId ||
      run.workerEpoch !== binding.workerEpoch || run.sessionGeneration !== binding.sessionGeneration ||
      binding.workerEpoch !== this.epoch || terminal.has(run.state) || run.state === 'unknown') throw new Error('stale_binding');
    return run;
  }
  private event(threadId: string, runId: string, kind: string, entityId: string, origin?: RuntimeObservation): void {
    const runSeq = runId ? this.one<{ next: number }>('SELECT coalesce(max(run_seq),0)+1 AS next FROM events WHERE run_id=?', runId).next : 0;
    this.db.prepare('INSERT INTO events(run_seq,thread_id,run_id,kind,entity_id,event_type,source_type) VALUES (?,?,?,?,?,?,?)').run(runSeq, threadId, runId, kind, entityId, origin?.eventType ?? null, origin?.sourceType ?? null);
  }
  private setRun(run: Run, state: RunView['state']): void {
    this.db.prepare('UPDATE runs SET state=? WHERE id=?').run(state, run.id);
    this.event(run.threadId, run.id, 'run.' + state, run.id);
  }
  private revokePending(runId: string): void {
    this.db.prepare("UPDATE approvals SET decision='revoked' WHERE operation_id IN (SELECT id FROM operations WHERE run_id=? AND state IN ('pending','approved'))").run(runId);
    this.db.prepare("UPDATE operations SET state='denied' WHERE run_id=? AND state IN ('pending','approved')").run(runId);
  }

  /** UI command boundary. No worker bindings, paths, credentials or execute-anything command accepted. */
  handle(raw: unknown): Ack {
    const command = parseCommand(raw); const serialized = JSON.stringify(command);
    return this.mutate(() => {
      const previous = this.get<{ command: string; response: string }>('SELECT command,response FROM requests WHERE id=?', command.requestId);
      if (previous) {
        if (previous.command !== serialized) throw new Error('idempotency_conflict');
        return JSON.parse(previous.response) as Ack;
      }
      let id: string;
      switch (command.type) {
        case 'threads.create':
          this.one('SELECT id FROM workspaces WHERE id=?', command.workspaceId); id = randomUUID();
          this.db.prepare('INSERT INTO threads(id,workspace_id,title) VALUES (?,?,?)').run(id, command.workspaceId, command.title);
          this.event(id, '', 'thread.created', id); break;
        case 'runs.start':
          this.one('SELECT id FROM threads WHERE id=?', command.threadId); id = randomUUID();
          this.db.prepare("INSERT INTO runs(id,thread_id,input,state) VALUES (?,?,?,'queued')").run(id, command.threadId, command.input);
          this.event(command.threadId, id, 'run.queued', id); break;
        case 'runs.cancel': {
          const run = this.run(command.runId); id = run.id;
          if (terminal.has(run.state) || run.state === 'cancelling') break;
          if (run.state === 'unknown') throw new Error('reconciliation_required');
          this.db.prepare('UPDATE worker_launches SET cancel_requested=1 WHERE run_id=?').run(run.id);
          this.revokePending(run.id);
          this.setRun(run, run.state === 'queued' ? 'cancelled' : 'cancelling'); break;
        }
        case 'approvals.resolve': {
          const op = this.operation(command.operationId); const run = this.run(op.runId); id = op.id;
          if (op.parametersDigest !== command.parametersDigest) throw new Error('approval_digest_mismatch');
          if (run.state !== 'running' || run.runtimeBindingId !== op.runtimeBindingId || op.state !== 'pending' || Date.now() >= op.deadline) throw new Error('approval_not_pending');
          this.db.prepare('UPDATE approvals SET decision=? WHERE operation_id=?').run(command.decision, op.id);
          this.db.prepare('UPDATE operations SET state=? WHERE id=?').run(command.decision === 'allow' ? 'approved' : 'denied', op.id);
          this.event(run.threadId, run.id, 'approval.' + command.decision, op.id); break;
        }
      }
      const result: Ack = { accepted: true, id };
      this.db.prepare('INSERT INTO requests VALUES (?,?,?)').run(command.requestId, serialized, JSON.stringify(result));
      return result;
    });
  }

  /** Trusted host calls below. Persist dispatch before any Worker side effect. Never replay automatically. */
  dispatchNext(prepare?: (dispatch: Dispatch) => string): Dispatch | undefined {
    return this.mutate(() => {
      if (this.get(`SELECT id FROM runs WHERE state IN ${active}`)) return undefined;
      const run = this.get<Run>(`SELECT ${runColumns} FROM runs WHERE state='queued' ORDER BY rowid LIMIT 1`);
      if (!run) return undefined;
      const thread = this.one<{ workspaceId: string; nativeSessionRef: string | null }>('SELECT workspace_id AS workspaceId,native_ref AS nativeSessionRef FROM threads WHERE id=?', run.threadId);
      const binding: Binding = { runId: run.id, threadId: run.threadId, runtimeBindingId: randomUUID(), workerEpoch: this.epoch, sessionGeneration: randomUUID() };
      this.db.prepare("UPDATE runs SET state='starting',binding_id=?,worker_epoch=?,session_generation=? WHERE id=?").run(binding.runtimeBindingId, binding.workerEpoch, binding.sessionGeneration, run.id);
      this.event(run.threadId, run.id, 'run.starting', run.id);
      const dispatch = { ...binding, ...thread, input: run.input };
      if (prepare) this.db.prepare('INSERT INTO worker_launches(run_id,record) VALUES (?,?)').run(run.id, prepare(dispatch));
      return dispatch;
    });
  }
  /** Host-only recovery journal. Kept independently of the Worker writable Session tree. */
  workerLaunches(): { runId: string; record: string; cancelRequested: number }[] {
    return this.all('SELECT run_id AS runId,record,cancel_requested AS cancelRequested FROM worker_launches');
  }
  workspacePath(id: string): string { return this.one<{path:string}>('SELECT path FROM workspaces WHERE id=?', id).path; }
  markRunning(binding: Binding): void {
    this.mutate(() => { const run = this.bound(binding); if (run.state !== 'starting') throw new Error('not_starting'); this.setRun(run, 'running'); });
  }
  bindNativeSession(binding: Binding, reference: string): void {
    if (!reference || reference.length > 4096 || reference.includes('\0')) throw new Error('invalid_native_reference');
    this.mutate(() => { const run = this.bound(binding);
      this.db.prepare('UPDATE threads SET native_ref=? WHERE id=?').run(reference, run.threadId);
      this.event(run.threadId, run.id, 'session.bound', run.id);
    });
  }
  replaceBinding(binding: Binding, evidence: { piIdle: boolean; hostClean: boolean }): Binding {
    return this.mutate(() => {
      const run = this.bound(binding); this.requireSettled(run, evidence);
      if (run.state !== 'running') throw new Error('not_running');
      const next: Binding = { runId: run.id, threadId: run.threadId, workerEpoch: this.epoch,
        runtimeBindingId: randomUUID(), sessionGeneration: randomUUID() };
      this.db.prepare('UPDATE runs SET binding_id=?,session_generation=? WHERE id=?').run(next.runtimeBindingId, next.sessionGeneration, run.id);
      this.event(run.threadId, run.id, 'session.rebound', run.id); return next;
    });
  }
  observe(binding: Binding, observation: RuntimeObservation | RuntimeObservation['kind']): boolean {
    return this.mutate(() => {
      let run: Run;
      try { run = this.bound(binding); } catch (error) { if (error instanceof Error && error.message === 'stale_binding') return false; throw error; }
      const origin = typeof observation === 'string' ? undefined : observation;
      const kind = typeof observation === 'string' ? observation : observation.kind;
      if (!['activity', 'idle', 'diagnostic'].includes(kind)) throw new Error('invalid_observation');
      if (origin && (!/^[a-zA-Z0-9_:-]{1,64}$/.test(origin.eventType) || (origin.sourceType !== null && !/^[a-zA-Z0-9_:-]{1,64}$/.test(origin.sourceType)))) throw new Error('invalid_observation');
      this.event(run.threadId, run.id, 'observation.' + kind, run.id, origin); return true;
    });
  }
  requestOperation(binding: Binding, intent: { toolCallId: string; tool: string; parametersDigest: string; deadline: number; artifactPath?: string }): OperationView {
    identifier(intent.toolCallId); identifier(intent.tool); sha256(intent.parametersDigest);
    if (!Number.isFinite(intent.deadline) || intent.deadline <= Date.now() || intent.deadline > Date.now() + 86_400_000) throw new Error('invalid_deadline');
    return this.mutate(() => {
      const run = this.bound(binding); if (run.state !== 'running') throw new Error('not_running');
      const workspace = this.one<{ path: string }>('SELECT w.path FROM workspaces w JOIN threads t ON t.workspace_id=w.id WHERE t.id=?', run.threadId);
      const target = intent.artifactPath === undefined ? null : artifactPath(workspace.path, intent.artifactPath);
      const prior = this.get<Operation>(`SELECT ${operationColumns} FROM operations WHERE run_id=? AND tool_call_id=?`, run.id, intent.toolCallId);
      if (prior) {
        if (prior.runtimeBindingId !== binding.runtimeBindingId || prior.parametersDigest !== intent.parametersDigest || prior.tool !== intent.tool || prior.deadline !== intent.deadline || prior.artifactPath !== target) throw new Error('operation_conflict');
        return this.operationView(prior);
      }
      const id = randomUUID();
      this.db.prepare("INSERT INTO operations(id,run_id,binding_id,tool_call_id,tool,digest,deadline,artifact_path,state) VALUES (?,?,?,?,?,?,?,?,'pending')").run(id, run.id, binding.runtimeBindingId, intent.toolCallId, intent.tool, intent.parametersDigest, intent.deadline, target);
      this.db.prepare("INSERT INTO approvals VALUES (?,'pending')").run(id);
      this.event(run.threadId, run.id, 'approval.requested', id);
      return this.operationView(this.operation(id));
    });
  }
  claimOperation(binding: Binding, id: string, parametersDigest: string): void {
    this.mutate(() => {
      const run = this.bound(binding); const op = this.operation(id);
      if (run.state !== 'running' || op.runId !== run.id || op.runtimeBindingId !== binding.runtimeBindingId ||
        op.state !== 'approved' || op.parametersDigest !== parametersDigest || Date.now() >= op.deadline) throw new Error('operation_not_authorized');
      this.db.prepare("UPDATE operations SET state='executing' WHERE id=?").run(id);
      this.event(run.threadId, run.id, 'operation.executing', id);
    });
  }
  finishOperation(binding: Binding, id: string, result: 'succeeded' | 'failed' | 'unknown', contentDigest?: string): void {
    if (!['succeeded', 'failed', 'unknown'].includes(result)) throw new Error('invalid_operation_result');
    if (contentDigest !== undefined) sha256(contentDigest);
    this.mutate(() => {
      const op = this.operation(id); const run = this.run(op.runId);
      // Completion facts use the original operation identity even after that binding is fenced.
      if (op.runId !== binding.runId || run.threadId !== binding.threadId || op.runtimeBindingId !== binding.runtimeBindingId) throw new Error('operation_binding_mismatch');
      if (op.state === result) { if (op.contentDigest !== (contentDigest ?? null)) throw new Error('operation_result_conflict'); return; }
      if (op.state !== 'executing' && op.state !== 'unknown') throw new Error('operation_not_executing');
      this.db.prepare('UPDATE operations SET state=?,content_digest=? WHERE id=?').run(result, contentDigest ?? null, id);
      this.event(run.threadId, run.id, run.runtimeBindingId === binding.runtimeBindingId ? 'operation.' + result : 'operation.late_' + result, id);
      if (result === 'unknown' && run.state !== 'unknown') {
        this.db.prepare('UPDATE runs SET binding_id=NULL,worker_epoch=NULL,session_generation=NULL WHERE id=?').run(run.id);
        this.setRun(run, 'unknown');
      }
    });
  }
  private requireSettled(run: Run, evidence: { piIdle: boolean; hostClean: boolean }): void {
    if (evidence.piIdle !== true || evidence.hostClean !== true || this.get(`SELECT id FROM operations WHERE run_id=? AND state IN ${outstanding}`, run.id)) throw new Error('cleanup_unconfirmed');
  }
  settle(binding: Binding, result: 'completed' | 'failed' | 'cancelled', evidence: { piIdle: boolean; hostClean: boolean }): void {
    if (!['completed', 'failed', 'cancelled'].includes(result)) throw new Error('invalid_run_result');
    this.mutate(() => {
      const run = this.bound(binding); this.requireSettled(run, evidence);
      if (run.state === 'starting' || (run.state === 'cancelling') !== (result === 'cancelled')) throw new Error('invalid_terminal_transition');
      if (result === 'completed' && this.get("SELECT id FROM operations WHERE run_id=? AND state='failed'", run.id)) throw new Error('failed_operation');
      this.setRun(run, result);
    });
  }
  /** Explicit recovery only after the host has stopped/fenced the old Worker. Keeps global admission blocked. */
  recoverAfterCrash(): void {
    this.mutate(() => {
      for (const run of this.all<Run>(`SELECT ${runColumns} FROM runs WHERE state IN ('starting','running','cancelling')`)) {
        this.revokePending(run.id);
        this.db.prepare("UPDATE operations SET state='unknown' WHERE run_id=? AND state='executing'").run(run.id);
        this.db.prepare('UPDATE runs SET binding_id=NULL,worker_epoch=NULL,session_generation=NULL WHERE id=?').run(run.id);
        this.setRun(run, 'unknown');
      }
    });
  }
  reconcileOperation(id: string, result: 'succeeded' | 'failed', contentDigest?: string): void {
    if (!['succeeded', 'failed'].includes(result)) throw new Error('invalid_operation_result');
    if (contentDigest !== undefined) sha256(contentDigest);
    this.mutate(() => { const op = this.operation(id); const run = this.run(op.runId);
      if (run.state !== 'unknown' || op.state !== 'unknown') throw new Error('not_unknown');
      this.db.prepare('UPDATE operations SET state=?,content_digest=? WHERE id=?').run(result, contentDigest ?? null, id);
      this.event(run.threadId, run.id, 'operation.reconciled_' + result, id);
    });
  }
  reconcileRun(id: string, result: 'failed' | 'cancelled', evidence: { piIdle: boolean; hostClean: boolean }): void {
    if (!['failed', 'cancelled'].includes(result)) throw new Error('invalid_run_result');
    this.mutate(() => { const run = this.run(id); if (run.state !== 'unknown') throw new Error('not_unknown');
      this.requireSettled(run, evidence); this.setRun(run, result);
    });
  }
  recordArtifact(binding: Binding, operationId: string, path: string): ArtifactView {
    // Filesystem observation cannot be atomic with SQLite. The hash is rechecked on every preview.
    const run = this.run(binding.runId);
    const workspace = this.one<{ id: string; path: string }>('SELECT w.id,w.path FROM workspaces w JOIN threads t ON t.workspace_id=w.id WHERE t.id=?', run.threadId);
    const file = inspectMarkdown(workspace.path, path);
    return this.mutate(() => {
      const op = this.operation(operationId);
      if (op.runId !== run.id || op.runtimeBindingId !== binding.runtimeBindingId || run.threadId !== binding.threadId || op.state !== 'succeeded') throw new Error('artifact_origin_mismatch');
      if (op.artifactPath !== file.path) throw new Error('artifact_target_mismatch');
      if (op.contentDigest !== file.digest) throw new Error('artifact_content_mismatch');
      const prior = this.get<ArtifactView>(`SELECT ${artifactColumns} FROM artifacts WHERE operation_id=? AND path=? AND digest=?`, operationId, file.path, file.digest);
      if (prior) return prior;
      const version = this.one<{ next: number }>('SELECT coalesce(max(version),0)+1 AS next FROM artifacts WHERE workspace_id=? AND path=?', workspace.id, file.path).next;
      const id = randomUUID();
      this.db.prepare('INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?)').run(id, run.id, operationId, workspace.id, file.path, version, file.digest, file.bytes);
      this.event(run.threadId, run.id, 'artifact.recorded', id);
      return this.one<ArtifactView>(`SELECT ${artifactColumns} FROM artifacts WHERE id=?`, id);
    });
  }
  previewArtifact(id: string): { status: 'ready' | 'changed' | 'missing' | 'unavailable'; text?: string } {
    const artifact = this.one<ArtifactView & { workspaceId: string }>(`SELECT ${artifactColumns},workspace_id AS workspaceId FROM artifacts WHERE id=?`, id);
    const workspace = this.one<{ path: string }>('SELECT path FROM workspaces WHERE id=?', artifact.workspaceId);
    try { const file = inspectMarkdown(workspace.path, artifact.path);
      return file.digest === artifact.digest ? { status: 'ready', text: file.text } : { status: 'changed' };
    } catch (error) {
      return { status: error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 'missing' : 'unavailable' };
    }
  }
  private operationView(op: Operation): OperationView {
    const { id, runId, toolCallId, tool, parametersDigest, artifactPath, deadline, state } = op;
    return { id, runId, toolCallId, tool, parametersDigest, artifactPath, deadline, state };
  }
  snapshot(threadId: string): Snapshot {
    return this.transaction(() => ({
      cursor: this.one<{ cursor: number }>('SELECT coalesce(max(seq),0) AS cursor FROM events').cursor,
      thread: this.one<ThreadView>('SELECT id,workspace_id AS workspaceId,title FROM threads WHERE id=?', threadId),
      runs: this.all<RunView>('SELECT id,thread_id AS threadId,state FROM runs WHERE thread_id=? ORDER BY rowid', threadId),
      operations: this.all<Operation>(`SELECT ${operationColumns} FROM operations WHERE run_id IN (SELECT id FROM runs WHERE thread_id=?) ORDER BY rowid`, threadId).map(op => this.operationView(op)),
      artifacts: this.all<ArtifactView>(`SELECT ${artifactColumns} FROM artifacts WHERE run_id IN (SELECT id FROM runs WHERE thread_id=?) ORDER BY rowid`, threadId),
    }), false);
  }
  eventsAfter(threadId: string, cursor: number): ProductEvent[] {
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('invalid_cursor');
    if (cursor > this.one<{ cursor: number }>('SELECT coalesce(max(seq),0) AS cursor FROM events').cursor) throw new Error('future_cursor');
    return this.all<ProductEvent>(`SELECT ${eventColumns} FROM events WHERE thread_id=? AND seq>? ORDER BY seq LIMIT 128`, threadId, cursor);
  }
  /** Local commits wake subscribers; poll() also reads commits made by another connection. */
  subscribe(threadId: string, cursor: number, listener: (event: ProductEvent) => void) {
    this.eventsAfter(threadId, cursor);
    const subscription: Subscription = { threadId, cursor, listener, active: true, draining: false, failed: false };
    this.subscriptions.add(subscription); this.drain(subscription);
    return { unsubscribe: () => { subscription.active = false; this.subscriptions.delete(subscription); },
      poll: () => this.drain(subscription), status: () => ({ active: subscription.active, failed: subscription.failed, cursor: subscription.cursor }) };
  }
  private drain(subscription: Subscription): void {
    if (!subscription.active || subscription.draining || this.closed) return;
    subscription.draining = true;
    try {
      while (subscription.active) {
        const events = this.eventsAfter(subscription.threadId, subscription.cursor); if (!events.length) break;
        for (const event of events) {
          if (!subscription.active) break;
          subscription.listener(Object.freeze(event)); subscription.cursor = event.seq;
        }
      }
    } catch { subscription.failed = true; subscription.active = false; this.subscriptions.delete(subscription); }
    finally { subscription.draining = false; }
  }
  close(): void {
    if (this.closed) return;
    for (const subscription of this.subscriptions) subscription.active = false;
    this.subscriptions.clear(); this.db.close(); this.closed = true;
  }
}
