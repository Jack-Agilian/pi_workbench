import { readDesktopPage, row, runRow, artifactRow, displayOperation } from './desktop-pages.ts';
import { DESKTOP_PAGE_BYTES, type HistoryEntry, type HistoryItem, type PageOptions, type HistoryPage, type OperationPage, type ArtifactPage } from '../../packages/app-contracts/desktop-pages.ts';
import type { ModelShellOperation } from '../../packages/app-contracts/model-shell.ts';
import { parseFileToolRequest, type FileOperationPlan } from '../../packages/app-contracts/file-tools.ts';
import { policyDigest, policyText, legacyPolicyDigest, assertTimeoutRevision, assertRequestCountRevision, assertToolScopeRevision, assertCostRevision, assertUsageDefaultsRevision } from './model-policy.ts';
import { type ModelConfiguration, parseModelOutcome, type ModelOutcome } from '../../packages/app-contracts/model.ts';
import { parseShellIntent, parseShellOutcome, type ShellIntent, type ShellOutcome, type ShellView } from '../../packages/app-contracts/shell.ts';
// Product intents/indexes and disposable display projections; Pi owns authoritative messages and the Session tree.
import { randomUUID } from 'node:crypto';
import { chmodSync, realpathSync, statSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { identifier, toolCallIdentity, parseCommand, sha256, type Ack, type ArtifactView, type Binding, type Dispatch,
  type OperationView, type ProductEvent, type RuntimeObservation, type RunView, type Snapshot, type ThreadView } from '../../packages/app-contracts/index.ts';
import { artifactPath, inspectMarkdown } from './artifact.ts';
import { displayText, parsePresentation, type Presentation } from '../../packages/app-contracts/presentation.ts';

type Run = RunView & { input: string; runtimeBindingId: string | null; workerEpoch: string | null; sessionGeneration: string | null };
type Operation = Omit<OperationView, 'approvalSource'> & { runtimeBindingId: string; contentDigest: string | null };
const active = "('starting','running','cancelling','unknown')";
const outstanding = "('pending','approved','executing','unknown')";
const terminal = new Set(['completed', 'failed', 'cancelled']);
const permissionColumns = 'permission_mode AS permissionMode,permission_revision AS permissionRevision';
const runColumns = 'id, thread_id AS threadId, state, permission_mode AS permissionMode,permission_revision AS permissionRevision, input, binding_id AS runtimeBindingId, worker_epoch AS workerEpoch, session_generation AS sessionGeneration';
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
      if (![0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].includes(version)) throw new Error('unsupported_database_version');
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
      if (version < 3) this.db.exec(`BEGIN IMMEDIATE;
        ALTER TABLE threads ADD COLUMN native_persisted INTEGER NOT NULL DEFAULT 1 CHECK(native_persisted IN (0,1));
        PRAGMA user_version=3; COMMIT;`);
      if (version < 4) this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE run_display(run_id TEXT PRIMARY KEY REFERENCES runs(id), projection TEXT NOT NULL) STRICT;
        PRAGMA user_version=4; COMMIT;`);
      if (version < 5) this.db.exec(`BEGIN IMMEDIATE; CREATE TABLE shell_display(operation_id TEXT PRIMARY KEY REFERENCES operations(id), intent TEXT NOT NULL, outcome TEXT) STRICT; PRAGMA user_version=5; COMMIT;`);
      if (version < 6) this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE model_outcomes(run_id TEXT PRIMARY KEY REFERENCES runs(id), outcome TEXT NOT NULL) STRICT;
        CREATE TABLE model_requests(run_id TEXT PRIMARY KEY REFERENCES runs(id), authorization_id TEXT NOT NULL, policy_digest TEXT NOT NULL, reserved_cost REAL NOT NULL) STRICT;
        PRAGMA user_version=6; COMMIT;`);
      if (version < 7) this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE model_policy_revisions(seq INTEGER PRIMARY KEY AUTOINCREMENT, revision_id TEXT NOT NULL UNIQUE,
          authorization_id TEXT NOT NULL, previous_digest TEXT NOT NULL, digest TEXT NOT NULL, configuration TEXT NOT NULL,
          legacy_digest TEXT NOT NULL, recorded_at TEXT NOT NULL) STRICT;
        PRAGMA user_version=7; COMMIT;`);
      if (version < 8) this.db.exec(`BEGIN IMMEDIATE;
        ALTER TABLE model_requests RENAME TO model_requests_v7;
        CREATE TABLE model_requests(run_id TEXT NOT NULL REFERENCES runs(id), authorization_id TEXT NOT NULL,
          policy_digest TEXT NOT NULL, reserved_cost REAL NOT NULL, request_id TEXT NOT NULL UNIQUE,
          request_seq INTEGER NOT NULL CHECK(request_seq>0), PRIMARY KEY(run_id,request_seq)) STRICT;
        INSERT INTO model_requests SELECT run_id,authorization_id,policy_digest,reserved_cost,'legacy:'||run_id,1 FROM model_requests_v7;
        DROP TABLE model_requests_v7;
        CREATE TABLE file_operations(operation_id TEXT PRIMARY KEY REFERENCES operations(id), plan TEXT NOT NULL) STRICT;
        PRAGMA user_version=8; COMMIT;`);
      if (version < 9) this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE model_shell_operations(operation_id TEXT PRIMARY KEY REFERENCES operations(id), plan TEXT NOT NULL, launched INTEGER NOT NULL DEFAULT 0 CHECK(launched IN (0,1))) STRICT;
        CREATE TABLE desktop_workspace(singleton INTEGER PRIMARY KEY CHECK(singleton=1), workspace_id TEXT NOT NULL REFERENCES workspaces(id)) STRICT;
        PRAGMA user_version=9; COMMIT;`);
      if (version < 10) this.db.exec(`BEGIN IMMEDIATE;
        ALTER TABLE threads ADD COLUMN permission_mode TEXT NOT NULL DEFAULT 'manual' CHECK(permission_mode IN ('manual','auto'));
        ALTER TABLE threads ADD COLUMN permission_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE runs ADD COLUMN permission_mode TEXT NOT NULL DEFAULT 'manual' CHECK(permission_mode IN ('manual','auto'));
        ALTER TABLE runs ADD COLUMN permission_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE approvals ADD COLUMN source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','workspace-tools-v1'));
        PRAGMA user_version=10; COMMIT;`);
      if (version < 11) this.db.exec(`BEGIN IMMEDIATE;
        ALTER TABLE threads ADD COLUMN permission_mode_v11 TEXT NOT NULL DEFAULT 'manual' CHECK(permission_mode_v11 IN ('manual','auto','full'));
        UPDATE threads SET permission_mode_v11=permission_mode;
        ALTER TABLE threads DROP COLUMN permission_mode;
        ALTER TABLE threads RENAME COLUMN permission_mode_v11 TO permission_mode;
        ALTER TABLE runs ADD COLUMN permission_mode_v11 TEXT NOT NULL DEFAULT 'manual' CHECK(permission_mode_v11 IN ('manual','auto','full'));
        UPDATE runs SET permission_mode_v11=permission_mode;
        ALTER TABLE runs DROP COLUMN permission_mode;
        ALTER TABLE runs RENAME COLUMN permission_mode_v11 TO permission_mode;
        ALTER TABLE approvals ADD COLUMN source_v11 TEXT NOT NULL DEFAULT 'manual' CHECK(source_v11 IN ('manual','workspace-tools-v1','full-tools-v1'));
        UPDATE approvals SET source_v11=source;
        ALTER TABLE approvals DROP COLUMN source;
        ALTER TABLE approvals RENAME COLUMN source_v11 TO source;
        PRAGMA user_version=11; COMMIT;`);
      this.transaction(() => {
        for (const workspace of workspaces) {
          identifier(workspace.id); const canonical = realpathSync(workspace.path);
          const prior = this.get<{ path: string }>('SELECT path FROM workspaces WHERE id=?', workspace.id);
          if (prior && prior.path !== canonical) throw new Error('workspace_mapping_changed');
          if (!prior) this.db.prepare('INSERT INTO workspaces VALUES (?,?)').run(workspace.id, canonical);
          this.db.prepare('INSERT OR IGNORE INTO desktop_workspace VALUES (1,?)').run(workspace.id);
        }
      });
    } catch (error) { this.db.close(); throw error; }
  }
  hasRequest(id:string):boolean { return Boolean(this.get('SELECT 1 FROM requests WHERE id=?',identifier(id))); }
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
        case 'threads.permissions': {
          const thread = this.one<Pick<ThreadView, 'id' | 'permissionMode' | 'permissionRevision'>>(`SELECT id,${permissionColumns} FROM threads WHERE id=?`, command.threadId);
          if (thread.permissionRevision !== command.expectedRevision) throw new Error('permission_changed');
          id = thread.id;
          this.db.prepare('UPDATE threads SET permission_mode=?,permission_revision=permission_revision+1 WHERE id=?').run(command.mode, id);
          this.event(id, '', 'permission.' + command.mode, id); break;
        }
        case 'runs.start': {
          const thread = this.one<Pick<ThreadView, 'id' | 'permissionMode' | 'permissionRevision'>>(`SELECT id,${permissionColumns} FROM threads WHERE id=?`, command.threadId);
          if (command.permissionRevision !== undefined && command.permissionRevision !== thread.permissionRevision) throw new Error('permission_changed');
          // Old callers cannot accidentally inherit a more permissive desktop choice.
          const mode = command.permissionRevision === undefined ? 'manual' : thread.permissionMode;
          const revision = command.permissionRevision === undefined ? 0 : thread.permissionRevision;
          id = randomUUID();
          this.db.prepare("INSERT INTO runs(id,thread_id,input,state,permission_mode,permission_revision) VALUES (?,?,?,'queued',?,?)").run(id, command.threadId, command.input, mode, revision);
          this.event(command.threadId, id, 'run.queued', id); break;
        }
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
      const dispatch = { ...binding, ...thread, nativeSessionPersisted: this.nativeSessionReference(run.threadId).persisted, input: run.input };
      if (prepare) this.db.prepare('INSERT INTO worker_launches(run_id,record) VALUES (?,?)').run(run.id, prepare(dispatch));
      return dispatch;
    });
  }
  /** Host-only recovery journal. Kept independently of the Worker writable Session tree. */
  workerLaunches(): { runId: string; record: string; cancelRequested: number }[] {
    return this.all('SELECT run_id AS runId,record,cancel_requested AS cancelRequested FROM worker_launches');
  }
  /** Trusted host-only selection; no product/Renderer command accepts filesystem paths. */
  selectWorkspace(path: string): void {
    const canonical=realpathSync(path);if(!statSync(canonical).isDirectory())throw new Error('workspace_not_directory');
    this.mutate(()=>{
      if(this.get("SELECT id FROM runs WHERE state IN ('queued','starting','running','cancelling','unknown')"))throw new Error('workspace_busy');
      const id=this.get<{id:string}>('SELECT id FROM workspaces WHERE path=?',canonical)?.id??randomUUID();
      this.db.prepare('INSERT OR IGNORE INTO workspaces VALUES (?,?)').run(id,canonical);
      this.db.prepare('INSERT INTO desktop_workspace VALUES (1,?) ON CONFLICT(singleton) DO UPDATE SET workspace_id=excluded.workspace_id').run(id);
    });
  }
  workspaceSelection(): {selectedId:string;items:{id:string;path:string}[]} {
    return {selectedId:this.one<{id:string}>('SELECT workspace_id AS id FROM desktop_workspace WHERE singleton=1').id,items:this.all('SELECT id,path FROM workspaces ORDER BY rowid')};
  }
  workspacePath(id: string): string { return this.one<{path:string}>('SELECT path FROM workspaces WHERE id=?', id).path; }
  runPermission(runId:string): RunView['permissionMode'] { return this.run(runId).permissionMode; }
  activeRuns():RunView[] { return this.all(`SELECT id,thread_id AS threadId,state,permission_mode AS permissionMode,permission_revision AS permissionRevision FROM runs WHERE state IN ${active} ORDER BY rowid`); }
  listThreads(): ThreadView[] { return this.all('SELECT id,workspace_id AS workspaceId,title,permission_mode AS permissionMode,permission_revision AS permissionRevision FROM threads ORDER BY rowid DESC'); }
  /** Trusted host scheduling only. Renderer cannot select an executable or plan. */
  nextQueuedIntent(): { id: string; input: string; threadId:string } | undefined { return this.get("SELECT id,input,thread_id AS threadId FROM runs WHERE state='queued' ORDER BY rowid LIMIT 1"); }
  threadWorkspace(threadId:string): {id:string;path:string} { return this.one('SELECT w.id,w.path FROM workspaces w JOIN threads t ON t.workspace_id=w.id WHERE t.id=?',threadId); }
  /** No dispatch/Worker exists: retain the intent and explicit admission failure in the audit. */
  rejectQueuedWorkspace(runId:string): void {
    this.mutate(()=>{const run=this.run(runId);if(run.state!=='queued')throw new Error('run_not_queued');
      this.event(run.threadId,run.id,'workspace.invalid',run.id);this.setRun(run,'failed');});
  }
  runInputs(threadId: string): { id: string; input: string }[] { return this.all('SELECT id,input FROM runs WHERE thread_id=? ORDER BY rowid', threadId); }
  recordModelOutcome(binding: Binding, raw: unknown): void {
    const value = parseModelOutcome(raw);
    this.mutate(() => { const run=this.bound(binding); if(this.get('SELECT 1 FROM model_outcomes WHERE run_id=?',run.id))throw new Error('model_outcome_duplicate');
      this.db.prepare('INSERT INTO model_outcomes VALUES (?,?)').run(run.id,JSON.stringify(value));this.event(run.threadId,run.id,'model.'+value.reason,run.id); });
  }
  modelOutcome(runId:string):ModelOutcome|null { const row=this.get<{outcome:string}>('SELECT outcome FROM model_outcomes WHERE run_id=?',runId);return row?parseModelOutcome(JSON.parse(row.outcome)):null; }
  /** Host-only admission; old reservations remain immutable and count across all revisions. */
  modelAdmission(config:ModelConfiguration, cost:number): {status:'ready'|'policy_required'|'budget_exhausted';used:number;reserved:number} {
    const digest=policyDigest(config);
    if (!Number.isFinite(cost)||cost<0) throw new Error('model_budget_invalid');
    const prior=this.all<{policy_digest:string;reserved_cost:number}>('SELECT policy_digest,reserved_cost FROM model_requests WHERE authorization_id=?',config.authorizationId);
    const revisions=this.all<{digest:string;legacy_digest:string}>('SELECT digest,legacy_digest FROM model_policy_revisions WHERE authorization_id=? ORDER BY seq',config.authorizationId);
    const latest=revisions.at(-1);
    const known=new Set(revisions.flatMap(r=>[r.digest,r.legacy_digest]));
    known.add(digest);known.add(legacyPolicyDigest(config));
    const used=prior.length,reserved=prior.reduce((n,r)=>n+r.reserved_cost,0);
    const status=latest && latest.digest!==digest || prior.some(r=>!known.has(r.policy_digest)) ? 'policy_required'
      : (config.maxRequests!=null && used>=config.maxRequests) || (config.maxEstimatedCostUsd!=null && reserved+cost>config.maxEstimatedCostUsd) ? 'budget_exhausted' : 'ready';
    return {status,used,reserved};
  }
  /** Explicit local maintenance, never a Renderer/Worker command. Only the explicitly selected policy scope may change. */
  reviseModelPolicy(previous:ModelConfiguration, candidate:ModelConfiguration, revisionId:string,scope:'timeout'|'request-count'|'tools'|'cost'|'usage-defaults'='timeout'):void {
    identifier(revisionId);
    if(scope==='usage-defaults')assertUsageDefaultsRevision(previous,candidate);else if(scope==='cost')assertCostRevision(previous,candidate);else if(scope==='tools')assertToolScopeRevision(previous,candidate);else if(scope==='request-count')assertRequestCountRevision(previous,candidate);else if(scope==='timeout')assertTimeoutRevision(previous,candidate);else throw new Error('model_revision_scope');
    this.mutate(()=>{
      const digest=policyDigest(candidate),old=policyDigest(previous),legacy=legacyPolicyDigest(previous);
      const existing=this.get<{previous_digest:string;digest:string;legacy_digest:string}>('SELECT previous_digest,digest,legacy_digest FROM model_policy_revisions WHERE revision_id=?',revisionId);
      if(existing){if(existing.previous_digest!==old||existing.digest!==digest||existing.legacy_digest!==legacy)throw new Error('model_revision_id_conflict');return;}
      if(this.get("SELECT 1 FROM runs WHERE state IN ('queued','starting','running','cancelling','unknown')"))throw new Error('model_revision_busy');
      // A complete original configuration must account for every otherwise unknown old digest.
      if(this.modelAdmission(previous,0).status==='policy_required')throw new Error('model_previous_policy_unproven');
      this.db.prepare('INSERT INTO model_policy_revisions(revision_id,authorization_id,previous_digest,digest,configuration,legacy_digest,recorded_at) VALUES (?,?,?,?,?,?,?)')
        .run(revisionId,candidate.authorizationId,old,digest,policyText(candidate),legacy,new Date().toISOString());
    });
  }
  reserveConfiguredModelRequest(binding:Binding, config:ModelConfiguration, cost:number, request?:{id:string;sequence:number}):boolean {
    return this.mutate(()=>{
      const id=identifier(request?.id??binding.runId),sequence=request?.sequence??1;
      const cap=config.fileTools ? config.fileTools.maxModelRequests : 1;
      if(!Number.isSafeInteger(sequence)||sequence<1||(cap!=null && sequence>cap))throw new Error('model_request_sequence');
      const prior=this.get<{run_id:string;policy_digest:string;reserved_cost:number;request_seq:number}>('SELECT run_id,policy_digest,reserved_cost,request_seq FROM model_requests WHERE request_id=?',id);
      if(prior){if(!request||prior.run_id!==binding.runId||prior.policy_digest!==policyDigest(config)||prior.reserved_cost!==cost||prior.request_seq!==sequence)throw new Error('model_request_conflict');this.bound(binding);return false;}
      const next=this.one<{n:number}>('SELECT coalesce(max(request_seq),0)+1 n FROM model_requests WHERE run_id=?',binding.runId).n;
      if(sequence!==next)throw new Error('model_request_sequence');
      if(this.modelAdmission(config,cost).status!=='ready')throw new Error('model_policy_or_budget');
      const run=this.bound(binding);if(run.state!=='running')throw new Error('model_run_not_running');
      // Preserve an exact legacy proof before the first canonical reservation, without rewriting old rows.
      if(!this.get('SELECT 1 FROM model_policy_revisions WHERE authorization_id=?',config.authorizationId))
        this.db.prepare('INSERT INTO model_policy_revisions(revision_id,authorization_id,previous_digest,digest,configuration,legacy_digest,recorded_at) VALUES (?,?,?,?,?,?,?)')
          .run(randomUUID(),config.authorizationId,policyDigest(config),policyDigest(config),policyText(config),legacyPolicyDigest(config),new Date().toISOString());
      this.db.prepare('INSERT INTO model_requests VALUES (?,?,?,?,?,?)').run(run.id,config.authorizationId,policyDigest(config),cost,id,sequence);
      this.event(run.threadId,run.id,'model.request_reserved',id);return true;
    });
  }
  projectSession(binding: Binding, raw: unknown): void {
    const projection = parsePresentation(raw);
    this.mutate(() => {
      const run = this.bound(binding);
      this.db.prepare('INSERT INTO run_display VALUES (?,?) ON CONFLICT(run_id) DO UPDATE SET projection=excluded.projection').run(run.id, JSON.stringify(projection));
      this.event(run.threadId, run.id, 'display.replaced', run.id);
    });
  }
  presentation(runId: string): Presentation {
    const row = this.get<{ projection: string }>('SELECT projection FROM run_display WHERE run_id=?', runId);
    return row ? parsePresentation(JSON.parse(row.projection)) : { messages: [], omitted: false };
  }
  markRunning(binding: Binding): void {
    this.mutate(() => { const run = this.bound(binding); if (run.state !== 'starting') throw new Error('not_starting'); this.setRun(run, 'running'); });
  }
  /** Host-only reference metadata, never a message/tree or a Renderer path. */
  nativeSessionReference(threadId: string): { reference: string | null; persisted: boolean } {
    const row = this.one<{ reference: string | null; persisted: number }>('SELECT native_ref AS reference,native_persisted AS persisted FROM threads WHERE id=?', threadId);
    return { reference: row.reference, persisted: row.reference !== null && row.persisted === 1 };
  }
  bindNativeSession(binding: Binding, reference: string, persisted = true): void {
    if (!reference || reference.length > 4096 || reference.includes('\0')) throw new Error('invalid_native_reference');
    this.mutate(() => { const run = this.bound(binding);
      const prior = this.nativeSessionReference(run.threadId);
      const observed = persisted || (prior.reference === reference && prior.persisted);
      if (prior.reference === reference && prior.persisted === observed) return;
      if (prior.reference !== reference && (!['starting','running'].includes(run.state) || this.get(`SELECT id FROM operations WHERE run_id=? AND state IN ${outstanding}`, run.id))) throw new Error('native_binding_busy');
      this.db.prepare('UPDATE threads SET native_ref=?,native_persisted=? WHERE id=?').run(reference, Number(observed), run.threadId);
      this.event(run.threadId, run.id, 'session.bound', run.id);
    });
  }
  /** Cleanup has completed; host inspected the exact reserved path. Never selects a file by recency. */
  reconcileNativeSession(runId: string, reference: string): void {
    this.mutate(() => {
      const run = this.run(runId); const prior = this.nativeSessionReference(run.threadId);
      if (run.state !== 'unknown' || prior.reference !== reference) throw new Error('native_reconciliation_mismatch');
      if (prior.persisted) return;
      this.db.prepare('UPDATE threads SET native_persisted=1 WHERE id=?').run(run.threadId);
      this.event(run.threadId, run.id, 'session.persisted', run.id);
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
  requestOperation(binding: Binding, intent: { toolCallId: string; tool: string; parametersDigest: string; deadline: number; artifactPath?: string; shell?: ShellIntent; file?: FileOperationPlan; modelShell?: ModelShellOperation }): OperationView {
    if (intent.shell) { parseShellIntent(intent.shell); if (intent.tool !== 'bash' || intent.artifactPath !== undefined) throw new Error('shell_file_conflict'); }
    toolCallIdentity(intent.toolCallId); identifier(intent.tool); sha256(intent.parametersDigest);
    if (!Number.isFinite(intent.deadline) || intent.deadline <= Date.now() || intent.deadline > Date.now() + 86_400_000) throw new Error('invalid_deadline');
    return this.mutate(() => {
      const run = this.bound(binding); if (run.state !== 'running') throw new Error('not_running');
      const workspace = this.one<{ path: string }>('SELECT w.path FROM workspaces w JOIN threads t ON t.workspace_id=w.id WHERE t.id=?', run.threadId);
      const target = intent.artifactPath === undefined ? null : run.permissionMode === 'full' && intent.file ? parseFileToolRequest(intent.file.request, 'full').parameters.path : artifactPath(workspace.path, intent.artifactPath);
      if (run.permissionMode === 'full' && intent.file && target !== intent.artifactPath) throw new Error('noncanonical_operation_target');
      if (intent.shell?.profile === 'full-bash-v1' && run.permissionMode !== 'full') throw new Error('shell_permission_mismatch');
      const prior = this.get<Operation>(`SELECT ${operationColumns} FROM operations WHERE run_id=? AND tool_call_id=?`, run.id, intent.toolCallId);
      if (prior) {
        if (prior.runtimeBindingId !== binding.runtimeBindingId || prior.parametersDigest !== intent.parametersDigest || prior.tool !== intent.tool || prior.deadline !== intent.deadline || prior.artifactPath !== target) throw new Error('operation_conflict');
        return this.operationView(prior);
      }
      const id = randomUUID();
      this.db.prepare("INSERT INTO operations(id,run_id,binding_id,tool_call_id,tool,digest,deadline,artifact_path,state) VALUES (?,?,?,?,?,?,?,?,'pending')").run(id, run.id, binding.runtimeBindingId, intent.toolCallId, intent.tool, intent.parametersDigest, intent.deadline, target);
      if (intent.modelShell) this.db.prepare('INSERT INTO model_shell_operations(operation_id,plan) VALUES (?,?)').run(id,JSON.stringify(intent.modelShell));
      if (intent.file) this.db.prepare('INSERT INTO file_operations VALUES (?,?)').run(id,JSON.stringify(intent.file));
      if (intent.shell) this.db.prepare('INSERT INTO shell_display VALUES (?,?,NULL)').run(id, JSON.stringify(intent.shell));
      // A fixed host rule covers only existing admitted tools. No command parsing or model classifier.
      // Native file/version/resource checks and the guardian still gate actual execution.
      const automatic = (run.permissionMode === 'auto' || run.permissionMode === 'full') &&
        (['read','write','edit'].includes(intent.tool) && target !== null || intent.tool === 'bash' && intent.shell !== undefined);
      this.db.prepare('INSERT INTO approvals(operation_id,decision,source) VALUES (?,?,?)').run(id, automatic ? 'allow' : 'pending', automatic ? run.permissionMode === 'full' ? 'full-tools-v1' : 'workspace-tools-v1' : 'manual');
      if (automatic) this.db.prepare("UPDATE operations SET state='approved' WHERE id=?").run(id);
      this.event(run.threadId, run.id, automatic ? 'approval.automatic' : 'approval.requested', id);
      return this.operationView(this.operation(id));
    });
  }
  modelShellOperation(id: string): (ModelShellOperation & { launched: boolean }) | undefined {
    const row = this.get<{plan:string;launched:number}>('SELECT plan,launched FROM model_shell_operations WHERE operation_id=?', id);
    return row ? {...JSON.parse(row.plan) as ModelShellOperation, launched: row.launched === 1} : undefined;
  }
  recordShellLaunch(binding: Binding, id: string): void {
    this.mutate(() => {
      const run = this.bound(binding); const op = this.operation(id); const plan = this.modelShellOperation(id);
      if (run.state !== 'running' || op.runId !== run.id || op.runtimeBindingId !== binding.runtimeBindingId || op.state !== 'executing' || !plan || plan.launched || Date.now() >= op.deadline) throw new Error('shell_launch_not_admitted');
      this.db.prepare('UPDATE model_shell_operations SET launched=1 WHERE operation_id=?').run(id);
      this.event(run.threadId,run.id,'shell.launch',id);
    });
  }
  fileOperation(id:string):FileOperationPlan|undefined {
    const row=this.get<{plan:string}>('SELECT plan FROM file_operations WHERE operation_id=?',id);
    return row?JSON.parse(row.plan) as FileOperationPlan:undefined;
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
  operationAllowsCompletion(id: string): boolean {
    const op=this.operationView(this.operation(id));const outcome=op.shell?.outcome;
    return op.state==='succeeded'||op.state==='failed'&&Boolean(this.modelShellOperation(id)?.launched)&&Boolean(outcome&&outcome.exitCode!==null&&outcome.signal===null&&!outcome.timedOut&&outcome.sideEffects==='possible');
  }
  settle(binding: Binding, result: 'completed' | 'failed' | 'cancelled', evidence: { piIdle: boolean; hostClean: boolean }): void {
    if (!['completed', 'failed', 'cancelled'].includes(result)) throw new Error('invalid_run_result');
    this.mutate(() => {
      const run = this.bound(binding); this.requireSettled(run, evidence);
      if (run.state === 'starting' || (run.state === 'cancelling') !== (result === 'cancelled')) throw new Error('invalid_terminal_transition');
      if (result === 'completed' && this.all<{id:string}>("SELECT id FROM operations WHERE run_id=? AND state='failed'", run.id).some(op=>!this.operationAllowsCompletion(op.id))) throw new Error('failed_operation');
      this.setRun(run, result);
    });
  }
  private fenceRun(run: Run): void {
    this.revokePending(run.id);
    this.db.prepare("UPDATE operations SET state='unknown' WHERE run_id=? AND state='executing'").run(run.id);
    this.db.prepare('UPDATE runs SET binding_id=NULL,worker_epoch=NULL,session_generation=NULL WHERE id=?').run(run.id);
    this.setRun(run, 'unknown');
  }
  /** Actual host channel loss fences authority immediately, but makes NO cleanup/termination claim. */
  workerDisconnected(binding: Binding): void {
    this.mutate(() => {
      let run: Run;
      try { run = this.bound(binding); } catch (error) { if (error instanceof Error && error.message === 'stale_binding') return; throw error; }
      this.fenceRun(run);
    });
  }
  /** Exclusive new host takes logical ownership. No assertion about old processes or side effects. */
  fencePreviousHost(): void {
    this.mutate(() => {
      for (const run of this.all<Run>(`SELECT ${runColumns} FROM runs WHERE state IN ('starting','running','cancelling') AND worker_epoch != ?`, this.epoch)) this.fenceRun(run);
    });
  }
  /** Explicit recovery only after the host has stopped/fenced the old Worker. Keeps global admission blocked. */
  recoverAfterCrash(): void {
    this.mutate(() => {
      for (const run of this.all<Run>(`SELECT ${runColumns} FROM runs WHERE state IN ('starting','running','cancelling')`)) this.fenceRun(run);
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
  /** Recovery reuses a committed historical fact; unregistered results still require actual bytes. */
  reconcileArtifact(binding: Binding, operationId: string, path: string): ArtifactView {
    const run = this.run(binding.runId); const op = this.operation(operationId);
    if (run.state !== 'unknown' || run.threadId !== binding.threadId || op.runId !== run.id || op.runtimeBindingId !== binding.runtimeBindingId || op.state !== 'succeeded') throw new Error('artifact_origin_mismatch');
    const workspace = this.one<{ path: string }>('SELECT w.path FROM workspaces w JOIN threads t ON t.workspace_id=w.id WHERE t.id=?', run.threadId);
    const target = artifactPath(workspace.path, path);
    if (op.artifactPath !== target) throw new Error('artifact_target_mismatch');
    const prior = this.get<ArtifactView>(`SELECT ${artifactColumns} FROM artifacts WHERE operation_id=? AND path=? AND digest=?`, operationId, target, op.contentDigest);
    return prior ?? this.recordArtifact(binding, operationId, target);
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
    const row = this.get<{ intent: string; outcome: string | null }>('SELECT intent,outcome FROM shell_display WHERE operation_id=?', id);
    const shell: ShellView | undefined = row ? { intent: parseShellIntent(JSON.parse(row.intent)), outcome: row.outcome ? parseShellOutcome(JSON.parse(row.outcome)) : null } : undefined;
    const file=this.fileOperation(id);
    const {source} = this.one<{source: NonNullable<OperationView['approvalSource']>}>('SELECT source FROM approvals WHERE operation_id=?', id);
    return { id, runId, toolCallId, tool, parametersDigest, artifactPath, deadline, state, approvalSource: source, ...(shell ? { shell } : {}), ...(file?{file:{fileVersion:file.fileVersion,resourceLock:file.resourceLock,preview:displayText(file.request.tool==='write'?file.request.parameters.content:file.request.tool==='edit'?file.request.parameters.edits.map(e=>`${e.oldText}\n→\n${e.newText}`).join('\n\n'):`从第 ${file.request.parameters.offset??1} 行读取，${file.request.parameters.limit===undefined?'使用 Pi 默认截断':'最多 '+file.request.parameters.limit+' 行'}`,2048),summary:tool==='read'?'读取批准版本的 Markdown':tool==='write'?'写入 Markdown（内容与摘要绑定）':'使用 Pi 原生 edit 修改 Markdown'}}:{}) };
  }
  recordShellOutcome(binding: Binding, id: string, value: ShellOutcome): void {
    const outcome = parseShellOutcome(value);
    this.mutate(() => { const op = this.operation(id); if (op.runId !== binding.runId || op.runtimeBindingId !== binding.runtimeBindingId || op.tool !== 'bash') throw new Error('shell_binding_mismatch');
      const prior = this.one<{ outcome: string | null }>('SELECT outcome FROM shell_display WHERE operation_id=?', id); const serialized = JSON.stringify(outcome);
      if (prior.outcome) { if (prior.outcome !== serialized) throw new Error('shell_result_conflict'); return; }
      this.db.prepare('UPDATE shell_display SET outcome=? WHERE operation_id=?').run(serialized, id); this.event(binding.threadId, binding.runId, 'shell.outcome', id);
    });
  }
  snapshot(threadId: string): Snapshot {
    return this.transaction(() => ({
      cursor: this.one<{ cursor: number }>('SELECT coalesce(max(seq),0) AS cursor FROM events').cursor,
      thread: this.one<ThreadView>('SELECT id,workspace_id AS workspaceId,title,permission_mode AS permissionMode,permission_revision AS permissionRevision FROM threads WHERE id=?', threadId),
      runs: this.all<RunView>('SELECT id,thread_id AS threadId,state,permission_mode AS permissionMode,permission_revision AS permissionRevision FROM runs WHERE thread_id=? ORDER BY rowid', threadId),
      operations: this.all<Operation>(`SELECT ${operationColumns} FROM operations WHERE run_id IN (SELECT id FROM runs WHERE thread_id=?) ORDER BY rowid`, threadId).map(op => this.operationView(op)),
      artifacts: this.all<ArtifactView>(`SELECT ${artifactColumns} FROM artifacts WHERE run_id IN (SELECT id FROM runs WHERE thread_id=?) ORDER BY rowid`, threadId),
    }), false);
  }
  private historyItem(id:string):HistoryItem {
    return {run:runRow(this.db,id),input:displayText(row<{input:string}>(this.db,'SELECT input FROM runs WHERE id=?',id).input,16384),
      presentation:this.presentation(id),modelOutcome:this.modelOutcome(id)};
  }
  /** Product display lookup, never a native Session or execution input. */
  historyEntry(threadId:string,runId:string):HistoryEntry {
    identifier(threadId);identifier(runId);
    return this.transaction(()=>{
      const run=this.run(runId);if(run.threadId!==threadId)throw new Error('not_found');
      const value={item:this.historyItem(runId),snapshotSeq:this.one<{n:number}>('SELECT coalesce(max(seq),0) n FROM events').n};
      if(Buffer.byteLength(JSON.stringify(value))+2048>DESKTOP_PAGE_BYTES)throw new Error('page_item_too_large');
      return value;
    },false);
  }
  historyPage(threadId:string,page:PageOptions={}):HistoryPage {
    return this.transaction(()=>{
      this.threadWorkspace(threadId);
      return readDesktopPage(this.db,'history',threadId,page,id=>this.historyItem(id));
    },false);
  }
  operationPage(runId:string,page:PageOptions={}):OperationPage {
    return this.transaction(()=>{this.run(runId);return readDesktopPage(this.db,'operations',runId,page,id=>displayOperation(this.operationView(this.operation(id))));},false);
  }
  artifactPage(threadId:string,page:PageOptions={}):ArtifactPage {
    return this.transaction(()=>{this.threadWorkspace(threadId);return readDesktopPage(this.db,'artifacts',threadId,page,id=>artifactRow(this.db,id));},false);
  }
  threadActivity(threadId:string) {
    return this.transaction(()=>{
      const thread=this.one<ThreadView>('SELECT id,workspace_id AS workspaceId,title,permission_mode AS permissionMode,permission_revision AS permissionRevision FROM threads WHERE id=?',threadId);
      const run=this.get<RunView>(`SELECT id,thread_id AS threadId,state,permission_mode AS permissionMode,permission_revision AS permissionRevision FROM runs WHERE thread_id=? AND state IN ${active} LIMIT 1`,threadId);
      // At most 16 operations are admitted; expose current actions independently of history pages.
      const operations=run?this.all<Operation>(`SELECT ${operationColumns} FROM operations WHERE run_id=? AND state IN ('pending','approved','executing') ORDER BY rowid LIMIT 16`,run.id).map(op=>this.operationView(op)):[];
      return {thread:{...thread,title:displayText(thread.title,160)},activeRun:run??null,operations,
        snapshotSeq:this.one<{n:number}>('SELECT coalesce(max(seq),0) n FROM events').n};
    },false);
  }
  artifactWorkspace(id:string):{id:string;path:string} {
    return this.one('SELECT w.id,w.path FROM workspaces w JOIN threads t ON t.workspace_id=w.id JOIN runs r ON r.thread_id=t.id JOIN artifacts a ON a.run_id=r.id WHERE a.id=?',id);
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
