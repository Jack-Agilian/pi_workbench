import { modelShellIntent, parseBashParameters, type BashParameters } from '../../packages/app-contracts/model-shell.ts';
import { fileRunDuration, parseFileToolRequest, type FileToolRequest, type FileOperationPlan } from '../../packages/app-contracts/file-tools.ts';
import { plannedFileDigest } from '../../packages/pi-adapter/file-planning.ts';
import { validateModelPayload } from '../../packages/pi-adapter/model-catalog.ts';
import { ModelHttp } from './model-http.ts';
import { parseModelConfiguration, parseModelSelection, type ModelSelection, type ModelConfiguration } from '../../packages/app-contracts/model.ts';
import { parseShellIntent, parseShellOutcome, type ShellIntent, type ShellOutcome } from '../../packages/app-contracts/shell.ts';
import { parametersDigest } from '../../packages/pi-adapter/controlled-tools.ts';
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
import { ObservationOrder } from '../../packages/pi-adapter/observation-order.ts';
import { launchSpec, shellLaunch, spawnGuardian, type LaunchSpec, type TrustedWorkerEntry } from './worker-launcher.ts';

/** Host-approved one-operation intent. Not a Renderer command and not accepted from the Worker. */
export interface FileExecutionPlan { tool: 'write' | 'edit'; target: string; parametersDigest: string; fileVersion: string | null; expectedContentDigest: string; deadline: number }
export interface ShellExecutionPlan { tool: 'bash'; target: '.'; parametersDigest: string; shell: ShellIntent; deadline: number }
export interface ModelExecutionPlan { tool: 'none'; model: ModelSelection; deadline: number }
export interface ModelAccess { key: string; configuration: ModelConfiguration; requestUrl: string; reserveCostUsd: number; fetch?: typeof globalThis.fetch }
export type ExecutionPlan = FileExecutionPlan | ShellExecutionPlan | ModelExecutionPlan;
interface Journal { binding: Dispatch; config: WorkerInit; plan: ExecutionPlan; spec: LaunchSpec; lease: string }
interface Active {
  journal: Journal; child: ChildProcess; sender: IpcSender; done: Promise<void>; resolve: () => void; reject: (error: unknown) => void;
  pid?: number; armed: boolean; hello: boolean; ready: boolean; closed: boolean; stopping?: boolean; result?: boolean; nativeRef?: string;
  httpSequence?:number; modelAccess?: ModelAccess; http?: ModelHttp; httpClosing?:boolean; httpDeadline?:number; httpRequests?:number; preparingFile?:boolean; fileFailed?:boolean;
  shellRequest?: { id: string; operationId: string };
  requests: Map<string, string>; replies: Map<string, WireBody>; pending: Map<string, string>; startedAt: number;
  observations: ObservationOrder;
}
export interface SupervisorOptions { stateDirectory: string; databaseDirectory: string; resources: ResourceSelection; readyTimeoutMs?: number; validateWorkspace?: (workspaceId:string, path:string)=>void }
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
    const command = parseCommand(raw);
    if(command.type==='approvals.resolve'&&command.decision==='allow'&&this.active&&!this.core.hasRequest(command.requestId)){
      const {binding,config}=this.active.journal;this.options.validateWorkspace?.(binding.workspaceId,config.workspace);
    }
    const ack = this.core.handle(command);
    const active = this.active;
    if (active && command.type === 'approvals.resolve') this.deliverApproval(active, command.operationId);
    if (active && command.type === 'runs.cancel' && command.runId === active.journal.binding.runId) {
      void active.http?.close().catch(()=>{});
      if (active.journal.plan.tool === 'bash' || active.journal.spec.modelShell) void active.sender.send({ kind: 'shell-cancel' }).catch(() => this.stop(active));
      void this.send(active, { type: 'cancel' }).catch(() => this.stop(active));
      // Acknowledgement means request persisted. Hung SDK/driver is killed after bounded grace.
      const timer = setTimeout(() => this.stop(active), 400); void active.done.then(() => clearTimeout(timer), () => clearTimeout(timer));
    }
    return ack;
  }
  /** Only trusted host composition selects plans/entry. Product commands cannot set either. */
  startNext(plan: ExecutionPlan, entry?: TrustedWorkerEntry, modelAccess?: ModelAccess): Promise<void> | undefined {
    if (this.active) return this.active.done;
    plan = structuredClone(plan); if (plan.tool === 'bash') Object.freeze(plan.shell); if (plan.tool === 'none') Object.freeze(plan.model); Object.freeze(plan);
    if (plan.tool === 'none') {
      parseModelSelection(plan.model);
      if (plan.model.mode === 'live') {
        if (!modelAccess || !modelAccess.key || /[\r\n\0]/.test(modelAccess.key) || modelAccess.key.length > 8192) throw new Error('model_not_configured');
        const configuration = parseModelConfiguration(structuredClone(modelAccess.configuration));
        if (!configuration.approved || (['provider','model','endpoint','maxOutputTokens','timeoutMs'] as const).some(k => configuration[k] !== plan.model[k]) || JSON.stringify(configuration.openai)!==JSON.stringify(plan.model.openai) || JSON.stringify(configuration.fileTools)!==JSON.stringify(plan.model.fileTools) || JSON.stringify(configuration.shellTools)!==JSON.stringify(plan.model.shellTools)) throw new Error('model_policy_mismatch');
        const url = new URL(modelAccess.requestUrl); const endpoint = new URL(configuration.endpoint);
        if (url.origin !== endpoint.origin || url.username || url.password || url.hash || !Number.isFinite(modelAccess.reserveCostUsd) || modelAccess.reserveCostUsd < 0) throw new Error('model_access_not_admitted');
        modelAccess = Object.freeze({ ...modelAccess, configuration: Object.freeze(configuration) });
      } else if (modelAccess) throw new Error('offline_model_access');
    }
    else sha256(plan.parametersDigest);
    if (plan.tool === 'bash') { parseShellIntent(plan.shell); if (plan.target !== '.' || parametersDigest({ command: plan.shell.command, timeout: plan.shell.timeoutMs / 1000 }) !== plan.parametersDigest) throw new Error('shell_parameters_mismatch'); }
    else if (plan.tool !== 'none') { sha256(plan.expectedContentDigest); if (plan.fileVersion !== null) sha256(plan.fileVersion); }
    if (!['write','edit','bash','none'].includes(plan.tool) || plan.deadline <= Date.now() || plan.deadline > Date.now() + (plan.tool === 'none' ? plan.model.fileTools?fileRunDuration(plan.model.fileTools,plan.model.timeoutMs,modelAccess?{total:modelAccess.configuration.maxEstimatedCostUsd,perRequest:modelAccess.reserveCostUsd}:undefined):86_405_000 : 120_000)) throw new Error('invalid_execution_plan');
    let journal: Journal | undefined; let child: ChildProcess | undefined;
    let binding: Dispatch | undefined;
    try { binding = this.core.dispatchNext(dispatch => {
      const workspace = this.core.workspacePath(dispatch.workspaceId); if(realpathSync(workspace)!==workspace)throw new Error('workspace_mapping_changed'); if (plan.tool !== 'bash' && plan.tool !== 'none') artifactPath(workspace, plan.target);
      this.options.validateWorkspace?.(dispatch.workspaceId, workspace);
      const lease = join(this.options.stateDirectory, 'leases', randomUUID());
      const agentDir = join(this.options.stateDirectory, 'workers', randomUUID());
      const sessions = join(this.options.stateDirectory, 'sessions', dispatch.threadId);
      for (const dir of [lease, agentDir, sessions]) mkdirSync(dir, { recursive: true, mode: 0o700 });
      const config: WorkerInit = { binding: dispatch, workspace, agentDir, sessions, resources: structuredClone(this.options.resources), deadline: plan.deadline, ...(plan.tool === 'none' ? { model: plan.model } : {}) };
      const spec = launchSpec(config, { instanceId: randomUUID(), nonce: randomUUID() }, { lease, databaseDirectory: this.options.databaseDirectory }, entry);
      if (plan.tool === 'bash') spec.shell = shellLaunch(plan.shell, workspace, lease);
      if(plan.tool==='none'&&plan.model.shellTools)spec.modelShell={template:shellLaunch(modelShellIntent({command:':'},plan.model.shellTools),workspace,lease),maxCommands:plan.model.shellTools.maxCommands,index:join(lease,'shell-index.json')};
      journal = { binding: dispatch, config, plan: Object.freeze({ ...plan }), spec, lease };
      // Guardian exists before commit, but may not launch any Worker until the committed host arms it.
      child = spawnGuardian(spec, lease); return JSON.stringify(journal);
    }); } catch (error) { if (child?.connected) child.disconnect(); throw error; }
    if (!binding || !journal || !child) return;
    const guardian = child;
    let resolve!: () => void; let reject!: (error: unknown) => void; const done = new Promise<void>((r, e) => { resolve = r; reject = e; });
    this.closeResult = done;
    const sender = new IpcSender((message, callback) => guardian.send(message, callback));
    const active: Active = { journal, child: guardian, sender, done, resolve, reject, armed: false, hello: false, ready: false, closed: false, requests: new Map(), replies: new Map(), pending: new Map(), observations:new ObservationOrder(), startedAt: Date.now() };
    this.active = active;
    if(modelAccess)active.modelAccess=modelAccess;
    guardian.on('message', raw => { try { this.receive(active, raw); } catch { this.stop(active); } });
    guardian.on('error', () => this.stop(active));
    guardian.once('exit', () => { void this.finish(active); });
    guardian.once('close', () => { if (!guardian.pid) void this.finish(active); });
    const timer = setInterval(() => {
      if ((!active.ready && Date.now() - active.startedAt > (this.options.readyTimeoutMs ?? 5000)) || Date.now() >= plan.deadline || active.httpDeadline!==undefined&&Date.now()>=active.httpDeadline || this.core.snapshot(binding!.threadId).operations.some(o=>o.runId===binding!.runId&&['pending','approved','executing'].includes(o.state)&&Date.now()>=o.deadline)) this.stop(active);
    }, 50); void done.then(() => clearInterval(timer), () => clearInterval(timer));
    return done;
  }
  private send(active: Active, body: WireBody, requestId = `host-${++this.sequence}`): Promise<void> {
    if(active.stopping)return Promise.reject(new Error('worker_stopping'));
    const { spec } = active.journal;
    return active.sender.send({ version: 7, instanceId: spec.instanceId, runtimeBindingId: spec.runtimeBindingId, requestId, body } satisfies Envelope);
  }
  private receive(active: Active, raw: unknown) {
    if (this.active !== active || active.stopping) return; // owned channel, fenced synchronously before disconnect
    const outer = exact(raw, Object.hasOwn(Object(raw), 'message') ? ['kind','message'] : Object.hasOwn(Object(raw), 'pid') ? ['kind','pid'] : ['kind']);
    if (outer.kind === 'guardian-ready') {
      if (active.armed) throw new Error('duplicate_guardian_ready'); active.armed = true;
      void active.sender.send({ kind: 'arm' }).catch(() => this.stop(active)); return;
    }
    if (outer.kind === 'spawned') { if (active.pid || typeof outer.pid !== 'number' || !Number.isSafeInteger(outer.pid)) throw new Error('invalid_spawn'); active.pid = outer.pid; return; }
    if (outer.kind === 'cleanup') return;
    if (outer.kind === 'shell-complete') { this.shellCompleted(active); return; }
    if (outer.kind !== 'worker') throw new Error('unknown_guardian_message');
    const message = parseEnvelope(outer.message); const { body, requestId } = message; const { binding, config, plan, spec } = active.journal;
    if (message.instanceId !== spec.instanceId || message.runtimeBindingId !== binding.runtimeBindingId) throw new Error('stale_connection');
    if(['file-operation','shell-operation','operation','shell-exec','file-result','result'].includes(body.type))this.options.validateWorkspace?.(binding.workspaceId,config.workspace);
    if(body.type!=='observation'&&body.type!=='presentation')active.observations.assertControl(requestId);
    if (body.type==='model-http' || body.type==='model-http-read' || body.type==='model-http-finish') {
      if(plan.tool!=='none'||plan.model.mode!=='live'||!active.ready||active.closed||active.result!==undefined||Date.now()>=plan.deadline)throw new Error('model_http_not_admitted');
      const number=Number(requestId.replace(/^http-/,''));if(requestId!==`http-${number}`||number!==(active.httpSequence??0)+1||number>4096)throw new Error('model_http_sequence');active.httpSequence=number;
      if(body.type==='model-http-finish'){
        if(!plan.model.fileTools||!active.http||active.httpClosing)throw new Error('model_http_finish');
        const http=active.http;active.httpClosing=true;
        void http.close().then(()=>{active.http=undefined;active.httpDeadline=undefined;active.httpClosing=false;return this.send(active,{type:'model-http-finished'},requestId);}).catch(()=>this.stop(active));return;
      }
      if(this.core.snapshot(binding.threadId).runs.find(r=>r.id===binding.runId)?.state!=='running'||active.httpClosing)throw new Error('model_http_not_running');
      if(body.type==='model-http'){
        if(active.http)throw new Error('model_http_not_finished');
        const access=active.modelAccess;if(!access)throw new Error('model_transport_missing');
        active.httpDeadline=Date.now()+plan.model.timeoutMs;
        active.http=new ModelHttp(access.requestUrl,(bytes,payload)=>{
          if(active.fileFailed||active.preparingFile||active.pending.size||bytes>24000)throw new Error('model_input_not_admitted');
          validateModelPayload(plan.model,access.requestUrl,payload);
          const sequence=(active.httpRequests??0)+1;
          if(!this.core.reserveConfiguredModelRequest(binding,access.configuration,access.reserveCostUsd,{id:randomUUID(),sequence}))throw new Error('model_request_replayed');
          active.httpRequests=sequence;
        },access.fetch,access.configuration.httpIdleTimeoutMs??access.configuration.timeoutMs);
      }
      if(!active.http)throw new Error('model_transport_missing');
      active.http.receive(body,reply=>this.send(active,reply,requestId));return;
    }
    if(body.type==='observation'||body.type==='presentation'){
      if(!active.observations.accept(body.type,requestId))return;
      if(body.type==='observation'){if(active.ready&&!active.closed)this.core.observe(binding,body);}
      else {if(!active.ready||active.closed)throw new Error('unexpected_presentation');this.core.projectSession(binding,body.projection);}
      return;
    }
    // Control facts are never evicted. At most 16 admitted operations per Run;
    // this independent defensive cap cannot be consumed by display/stream updates.
    const serialized = JSON.stringify(body); const prior = active.requests.get(requestId);
    if (prior) {
      if (prior !== serialized) throw new Error('request_id_conflict');
      const reply = active.replies.get(requestId); if (reply) void this.send(active, reply, requestId).catch(() => this.stop(active)); return;
    }
    if (active.requests.size >= 128) throw new Error('request_limit'); active.requests.set(requestId, serialized);
    switch (body.type) {
      case 'hello':
        if (active.hello || body.pid !== active.pid) throw new Error('unexpected_worker'); active.hello = true;
        void (async()=>{if(plan.tool==='none')await this.send(active,{type:'model-key',key:active.modelAccess?.key ?? 'SYNTHETIC_OFFLINE_KEY'});await this.send(active,{type:'init',config});})().catch(() => this.stop(active)); break;
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
      case 'shell-operation': { this.prepareShellOperation(active,body.toolCallId,body.parameters,body.resourceLock,requestId); break; }
      case 'file-operation': {
        if(plan.tool!=='none'||!plan.model.fileTools||!active.ready||active.closed||active.fileFailed||active.preparingFile||active.pending.size||body.resourceLock!==config.resources.id)throw new Error('file_operation_not_admitted');
        active.preparingFile=true;
        void this.prepareFileOperation(active,body.toolCallId,body.request,requestId).catch(()=>this.stop(active)).finally(()=>{active.preparingFile=false;});break;
      }
      case 'file-result': {
        if(plan.tool!=='none'||!plan.model.fileTools||!active.pending.has(body.operationId))throw new Error('file_result_not_admitted');
        const op=this.core.snapshot(binding.threadId).operations.find(o=>o.id===body.operationId);const file=this.core.fileOperation(body.operationId);
        if(!op||op.state!=='executing'||!file)throw new Error('file_result_before_claim');
        const version=this.markdownVersion(config.workspace,file.request.parameters.path);
        if(body.ok&&file.expectedDigest!==null&&version===file.expectedDigest){
          this.core.finishOperation(binding,op.id,'succeeded',version);
          if(file.request.tool!=='read')this.core.recordArtifact(binding,op.id,file.request.parameters.path);
        }else if(version===file.fileVersion)this.core.finishOperation(binding,op.id,'failed');
        else this.core.finishOperation(binding,op.id,'unknown');
        const current=this.core.snapshot(binding.threadId).operations.find(o=>o.id===op.id)!;
        if(current.state!=='succeeded')active.fileFailed=true;
        active.pending.delete(op.id);
        const reply:WireBody={type:'file-settled',operationId:op.id};active.replies.set(requestId,reply);
        void this.send(active,reply,requestId).catch(()=>this.stop(active));break;
      }
      case 'operation': {
        if (plan.tool === 'none' || !active.ready || body.tool !== plan.tool || body.target !== plan.target || body.parametersDigest !== plan.parametersDigest || body.resourceLock !== config.resources.id) throw new Error('operation_not_in_host_plan');
        verifyContent(config.resources);
        if (active.pending.size) throw new Error('one_operation_per_run');
        const op = this.core.requestOperation(binding, { toolCallId: body.toolCallId, tool: plan.tool, parametersDigest: this.approvalDigest(active.journal), deadline: plan.deadline, ...(plan.tool === 'bash' ? { shell: plan.shell } : { artifactPath: plan.target }) });
        active.pending.set(op.id, requestId); this.deliverApproval(active, op.id); break;
      }
      case 'shell-exec': {
        const dynamic = this.core.modelShellOperation(body.operationId);
        const digest = plan.tool === 'bash' ? plan.parametersDigest : dynamic ? parametersDigest(dynamic.parameters) : null;
        if ((plan.tool !== 'bash' && !(plan.tool === 'none' && plan.model.shellTools && dynamic)) || !active.ready || active.closed || active.shellRequest || !active.pending.has(body.operationId) || body.parametersDigest !== digest || Date.now() >= (dynamic?.deadline ?? plan.deadline)) throw new Error('shell_not_authorized');
        const snap = this.core.snapshot(binding.threadId); const op = snap.operations.find(o => o.id === body.operationId);
        if (op?.state !== 'executing' || snap.runs.find(r => r.id === binding.runId)?.state !== 'running') throw new Error('shell_not_authorized');
        verifyContent(config.resources); active.shellRequest = { id: requestId, operationId: op.id };
        if(dynamic){
          // Durable launch precedes dispatch. A lost response is reconciled, never replayed.
          this.core.recordShellLaunch(binding,op.id);
          void active.sender.send({kind:'model-shell-start',operationId:op.id,deadline:dynamic.deadline,intent:dynamic.intent}).catch(()=>this.stop(active));
        }else void active.sender.send({ kind: 'shell-start', operationId: op.id, deadline: plan.deadline }).catch(() => this.stop(active)); break;
      }
      case 'result': {
        if (plan.tool === 'none' || !active.pending.has(body.operationId)) throw new Error('unowned_operation');
        const operation = this.core.snapshot(binding.threadId).operations.find(op => op.id === body.operationId);
        if (plan.tool === 'bash') { if (!operation) throw new Error('missing_shell_operation'); this.shellCompleted(active); break; }
        if (operation?.state !== 'executing') throw new Error('result_before_claim');
        const version = this.fileVersion(active.journal);
        if (body.ok && version === plan.expectedContentDigest) {
          this.core.finishOperation(binding, operation.id, 'succeeded', version); this.core.recordArtifact(binding, operation.id, plan.target);
        } else if (version === plan.fileVersion) this.core.finishOperation(binding, operation.id, 'failed');
        else this.core.finishOperation(binding, operation.id, 'unknown'); break;
      }
      case 'model-outcome': if(plan.tool!=='none'||!active.ready||active.closed||body.outcome.synthetic!==(plan.model.mode==='offline'))throw new Error('model_outcome_not_admitted'); this.core.recordModelOutcome(binding,body.outcome);break;
      case 'done': if (!active.ready || active.result !== undefined) throw new Error('unexpected_done'); active.result = body.ok; void this.send(active, { type: 'close' }).catch(() => this.stop(active)); break;
      case 'closed': active.closed = true; this.nativeReference(active, body.nativeRef); break;
      case 'fault': this.stop(active); break;
      default: throw new Error('unexpected_worker_message');
    }
  }
  private prepareShellOperation(active: Active, toolCallId: string, raw: BashParameters, resourceLock: string, requestId: string): void {
    const {plan,config,binding}=active.journal;
    if(plan.tool!=='none'||!plan.model.shellTools||!plan.model.fileTools||!active.ready||active.closed||active.fileFailed||active.preparingFile||active.pending.size||resourceLock!==config.resources.id)throw new Error('model_shell_not_admitted');
    const operations=this.core.snapshot(binding.threadId).operations.filter(o=>o.runId===binding.runId);
    if(operations.length>=plan.model.fileTools.maxOperations||operations.filter(o=>o.tool==='bash').length>=plan.model.shellTools.maxCommands)throw new Error('model_shell_limit');
    verifyContent(config.resources);const parameters=parseBashParameters(raw);const intent=modelShellIntent(parameters,plan.model.shellTools);
    const deadline=Math.min(plan.deadline,Date.now()+plan.model.fileTools.operationTimeoutMs);
    const approvalDigest=parametersDigest({parameters,intent,workspace:config.workspace,resourceLock,binding,deadline});
    const modelShell={parameters,intent,resourceLock,deadline,approvalDigest};
    const op=this.core.requestOperation(binding,{toolCallId,tool:'bash',parametersDigest:approvalDigest,deadline,shell:intent,modelShell});
    active.pending.set(op.id,requestId);this.deliverApproval(active,op.id);
  }
  private deliverShellApproval(active: Active, operationId: string, requestId: string): void {
    const {binding,config}=active.journal;const intent=this.core.modelShellOperation(operationId);
    const op=this.core.snapshot(binding.threadId).operations.find(o=>o.id===operationId);
    if(!op||!intent)throw new Error('model_shell_intent_missing');
    let reply:WireBody={type:'deny'};
    if(op.state==='approved'){
      try{
        verifyContent(config.resources);if(intent.resourceLock!==config.resources.id)throw new Error('resource_lock_mismatch');
        this.core.claimOperation(binding,operationId,intent.approvalDigest);
        reply={type:'grant',operationId,parametersDigest:parametersDigest(intent.parameters),expiresAt:intent.deadline,fileVersion:null};
      }catch{this.stop(active);return;}
    }else if(op.state==='denied'){active.pending.delete(operationId);active.fileFailed=true;}else return;
    active.replies.set(requestId,reply);void this.send(active,reply,requestId).catch(()=>this.stop(active));
  }
  private markdownVersion(workspace:string,path:string):string|null {
    try{const f=inspectMarkdown(workspace,path);if(f.bytes>16000)throw new Error('file_size_limit');return f.digest;}
    catch(error){if(error instanceof Error&&'code' in error&&error.code==='ENOENT')return null;throw error;}
  }
  private async prepareFileOperation(active:Active,toolCallId:string,raw:FileToolRequest,requestId:string){
    const {plan,config,binding}=active.journal;if(plan.tool!=='none'||!plan.model.fileTools)throw new Error('file_tools_missing');
    const count=this.core.snapshot(binding.threadId).operations.filter(o=>o.runId===binding.runId).length;
    if(count>=plan.model.fileTools.maxOperations)throw new Error('file_operation_limit');
    verifyContent(config.resources);const request=parseFileToolRequest(raw);
    const target=artifactPath(config.workspace,request.parameters.path);if(target!==request.parameters.path)throw new Error('noncanonical_file_target');
    const fileVersion=this.markdownVersion(config.workspace,target);
    const before=fileVersion===null?null:inspectMarkdown(config.workspace,target).text;
    const expectedDigest=await plannedFileDigest(config.workspace,request,before);
    if(this.active!==active||active.closed||active.stopping||Date.now()>=plan.deadline)throw new Error('stale_file_preparation');
    verifyContent(config.resources);if(this.markdownVersion(config.workspace,target)!==fileVersion)throw new Error('file_changed_during_plan');
    const deadline=Math.min(plan.deadline,Date.now()+plan.model.fileTools.operationTimeoutMs);
    const approvalDigest=parametersDigest({request,fileVersion,expectedDigest,resourceLock:config.resources.id,binding,deadline});
    const file:FileOperationPlan={request,fileVersion,expectedDigest,resourceLock:config.resources.id,deadline,approvalDigest};
    const op=this.core.requestOperation(binding,{toolCallId,tool:request.tool,parametersDigest:approvalDigest,deadline,artifactPath:target,file});
    active.pending.set(op.id,requestId);this.deliverApproval(active,op.id);
  }
  private deliverFileApproval(active:Active,operationId:string,requestId:string){
    const {binding,config}=active.journal;const file=this.core.fileOperation(operationId);
    const op=this.core.snapshot(binding.threadId).operations.find(o=>o.id===operationId);if(!file||!op)throw new Error('file_intent_missing');
    let reply:WireBody={type:'deny'};
    if(op.state==='approved'){
      try{
        verifyContent(config.resources);if(this.markdownVersion(config.workspace,file.request.parameters.path)!==file.fileVersion)throw new Error('file_version_changed');
        this.core.claimOperation(binding,operationId,file.approvalDigest);
        reply={type:'grant',operationId,parametersDigest:parametersDigest(file.request.parameters),expiresAt:file.deadline,fileVersion:file.fileVersion};
      }catch{this.stop(active);return;}
    }else if(op.state==='denied'){active.pending.delete(operationId);active.fileFailed=true;}else return;
    active.replies.set(requestId,reply);void this.send(active,reply,requestId).catch(()=>this.stop(active));
  }
  private approvalDigest(journal: Journal): string {
    const { plan, binding, config } = journal;
    if(plan.tool==='none')throw new Error('model_has_no_operation');
    return plan.tool === 'bash' ? parametersDigest({ intent: plan.shell, toolParametersDigest: plan.parametersDigest, workspace: config.workspace, binding, deadline: plan.deadline }) : plan.parametersDigest;
  }
  private shellReceipt(journal: Journal, operationId: string): ShellOutcome | undefined {
    const dynamic = this.core.modelShellOperation(operationId);
    const path = dynamic && journal.spec.modelShell ? join(journal.lease,operationId+'.json') : journal.spec.shell?.receipt;
    if (!path) return;
    try {
      const r = exact(JSON.parse(readFileSync(path, 'utf8')), ['instanceId','runtimeBindingId','nonce','operationId','pid','groupGone','outcome']);
      if (r.instanceId !== journal.spec.instanceId || r.runtimeBindingId !== journal.binding.runtimeBindingId || r.nonce !== journal.spec.nonce || r.groupGone !== true || (r.operationId !== operationId && (dynamic || r.operationId !== null))) return;
      if (r.pid !== null && (typeof r.pid !== 'number' || !Number.isSafeInteger(r.pid) || r.pid <= 0)) return;
      const outcome = parseShellOutcome(r.outcome);
      if(dynamic&&r.operationId!==operationId)return;
      if (r.operationId === null && (r.pid !== null || outcome.sideEffects !== 'not-started')) return;
      return outcome;
    } catch { return; }
  }
  private shellCompleted(active: Active): void {
    if (!active.shellRequest) return;
    const { journal, shellRequest } = active; const outcome = this.shellReceipt(journal, shellRequest.operationId); if (!outcome) return;
    const op = this.core.snapshot(journal.binding.threadId).operations.find(o => o.id === shellRequest.operationId);
    if (op?.state === 'executing') {
      this.core.recordShellOutcome(journal.binding, op.id, outcome);
      const run = this.core.snapshot(journal.binding.threadId).runs.find(r => r.id === journal.binding.runId);
      const interrupted = outcome.signal !== null && !outcome.timedOut && run?.state !== 'cancelling';
      this.core.finishOperation(journal.binding, op.id, interrupted ? 'unknown' : outcome.exitCode === 0 && !outcome.timedOut ? 'succeeded' : 'failed');
    }
    if(journal.spec.modelShell){
      active.pending.delete(shellRequest.operationId);active.shellRequest=undefined;
      // A known ordinary exit (including nonzero) may return to Pi. Cancellation,
      // timeout, failed spawn or ambiguous signal must not authorize another request.
      if(outcome.timedOut||outcome.signal!==null||outcome.exitCode===null)active.fileFailed=true;
    }
    if (!active.replies.has(shellRequest.id)) {
      const reply: WireBody = { type: 'shell-result', outcome }; active.replies.set(shellRequest.id, reply);
      void this.send(active, reply, shellRequest.id).catch(() => this.stop(active));
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
    if (journal.plan.tool === 'bash' || journal.plan.tool === 'none') throw new Error('shell_has_no_file_precondition');
    const path = join(journal.config.workspace, artifactPath(journal.config.workspace, journal.plan.target));
    if (!existsSync(path)) return null;
    return inspectMarkdown(journal.config.workspace, journal.plan.target).digest;
  }
  private deliverApproval(active: Active, operationId: string) {
    if(active.stopping)return;
    const requestId = active.pending.get(operationId); if (!requestId || active.replies.has(requestId)) return;
    const { binding, plan, config } = active.journal;
    if(plan.tool==='none'){if(this.core.modelShellOperation(operationId))this.deliverShellApproval(active,operationId,requestId);else this.deliverFileApproval(active,operationId,requestId);return;}
    const op = this.core.snapshot(binding.threadId).operations.find(o => o.id === operationId); if (!op) return;
    let reply: WireBody = { type: 'deny' };
    if (op.state === 'approved') {
      try {
        verifyContent(config.resources); if (plan.tool !== 'bash' && this.fileVersion(active.journal) !== plan.fileVersion) throw new Error('file_version_changed');
        this.core.claimOperation(binding, operationId, this.approvalDigest(active.journal));
        reply = { type: 'grant', operationId, parametersDigest: plan.parametersDigest, expiresAt: plan.deadline, fileVersion: plan.tool === 'bash' ? null : plan.fileVersion };
      } catch { this.stop(active); return; }
    } else if (op.state !== 'denied') return;
    active.replies.set(requestId, reply); void this.send(active, reply, requestId).catch(() => this.stop(active));
  }
  private stop(active: Active) { active.stopping=true; void active.http?.close().catch(()=>{}); if (active.child.connected) active.child.disconnect(); }
  close(): Promise<void> { const active = this.active; if (!active) return this.closeResult ?? Promise.resolve(); this.stop(active); return active.done; }
  /** Closed guardian inventory proves whether a committed dispatch ever reached it. */
  private shellInventory(journal: Journal): string[] | undefined {
    if(!journal.spec.modelShell)return;
    try{
      const r=exact(JSON.parse(readFileSync(journal.spec.modelShell.index,'utf8')),['instanceId','runtimeBindingId','nonce','operations','closed']);
      if(r.instanceId!==journal.spec.instanceId||r.runtimeBindingId!==journal.binding.runtimeBindingId||r.nonce!==journal.spec.nonce||r.closed!==true||!Array.isArray(r.operations)||r.operations.length>journal.spec.modelShell.maxCommands||new Set(r.operations).size!==r.operations.length||r.operations.some(id=>typeof id!=='string'||!this.core.modelShellOperation(id)?.launched))return;
      return r.operations as string[];
    }catch{return;}
  }
  private clean(journal: Journal): boolean {
    try {
      const r = exact(JSON.parse(readFileSync(journal.spec.receipt, 'utf8')), ['instanceId','runtimeBindingId','nonce','workerPid','exited','groupGone']);
      if (journal.plan.tool === 'bash' && !this.shellReceipt(journal, this.core.snapshot(journal.binding.threadId).operations.find(o => o.runId === journal.binding.runId)?.id ?? 'not-requested')) return false;
      if(journal.spec.modelShell){const inventory=this.shellInventory(journal);if(!inventory||inventory.some(id=>!this.shellReceipt(journal,id)))return false;}
      return r.instanceId === journal.spec.instanceId && r.runtimeBindingId === journal.binding.runtimeBindingId && r.nonce === journal.spec.nonce && r.exited === true && r.groupGone === true;
    } catch { return false; }
  }
  private async finish(active: Active): Promise<void> {
    active.stopping=true;
    active.sender.close();
    try {
      const { binding, spec } = active.journal;
      if (!active.armed && !existsSync(spec.receipt)) {
        // Owned guardian has exited and was never armed: protocol forbids it from spawning a Worker.
        if(spec.modelShell)writeFileSync(spec.modelShell.index,JSON.stringify({instanceId:spec.instanceId,runtimeBindingId:binding.runtimeBindingId,nonce:spec.nonce,operations:[],closed:true}),{flag:'wx',mode:0o600});
        writeFileSync(spec.receipt, JSON.stringify({ instanceId: spec.instanceId, runtimeBindingId: binding.runtimeBindingId,
          nonce: spec.nonce, workerPid: null, exited: true, groupGone: true }), { flag: 'wx', mode: 0o600 });
      }
      await active.http?.close();
      const clean = this.clean(active.journal);
      if (clean) {
        const snap = this.core.snapshot(binding.threadId); const run = snap.runs.find(r => r.id === binding.runId)!;
        const outstanding = snap.operations.some(o => o.runId === run.id && ['pending','approved','executing','unknown'].includes(o.state));
        if (active.closed && active.result !== undefined && run.state !== 'unknown' && !outstanding) {
          this.core.settle(binding, run.state === 'cancelling' ? 'cancelled' : active.result && (active.journal.plan.tool === 'none' ? ['stop','length'].includes(this.core.modelOutcome(run.id)?.reason ?? '') && !active.fileFailed && snap.operations.filter(o=>o.runId===run.id).every(o=>this.core.operationAllowsCompletion(o.id)) : snap.operations.filter(o => o.runId === run.id).length === 1 && snap.operations.some(o => o.runId === run.id && o.state === 'succeeded')) ? 'completed' : 'failed', { piIdle: true, hostClean: true });
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
      this.options.validateWorkspace?.(binding.workspaceId,journal.config.workspace);
      const native = this.core.nativeSessionReference(binding.threadId);
      if (native.reference) {
        if (this.nativeFile(journal, native.reference)) this.core.reconcileNativeSession(binding.runId, native.reference);
        else if (native.persisted) throw new Error('native_session_missing');
      }
      for (const op of this.core.snapshot(binding.threadId).operations.filter(o => o.runId === binding.runId)) {
        if(op.state==='unknown'&&plan.tool==='none'&&this.core.modelShellOperation(op.id)){
          const inventory=this.shellInventory(journal);if(!inventory)throw new Error('shell_evidence_missing');
          if(!inventory.includes(op.id)){
            this.core.recordShellOutcome(binding,op.id,{exitCode:null,signal:null,timedOut:false,stdout:'',stderr:'',truncated:false,sideEffects:'not-started'});
            this.core.reconcileOperation(op.id,'failed');
          }else{
            const outcome=this.shellReceipt(journal,op.id);if(!outcome)throw new Error('shell_evidence_missing');
            this.core.recordShellOutcome(binding,op.id,outcome);
            if(outcome.signal!==null&&!outcome.timedOut&&!cancelRequested)throw new Error('shell_side_effect_unresolved');
            this.core.reconcileOperation(op.id,outcome.exitCode===0&&!outcome.timedOut?'succeeded':'failed');
          }
        } else if(op.state==='unknown'&&plan.tool==='none'&&plan.model.fileTools){
          const file=this.core.fileOperation(op.id);if(!file)throw new Error('file_intent_missing');
          if(file.request.tool==='read') {
            // Cleanup is already proven. An interrupted read has no file mutation to
            // reconcile; today's file bytes cannot prove yesterday's read result.
            this.core.reconcileOperation(op.id,'failed');
          } else {
            const version=this.markdownVersion(journal.config.workspace,file.request.parameters.path);
            if(file.expectedDigest!==null&&version===file.expectedDigest)this.core.reconcileOperation(op.id,'succeeded',version);
            else if(version===file.fileVersion)this.core.reconcileOperation(op.id,'failed');
            else throw new Error('file_side_effect_unresolved');
          }
        } else if (op.state === 'unknown' && plan.tool === 'bash') {
          const outcome = this.shellReceipt(journal, op.id);
          if (!outcome) throw new Error('shell_evidence_missing');
          this.core.recordShellOutcome(binding, op.id, outcome);
          if (outcome.signal !== null && !outcome.timedOut && !cancelRequested) throw new Error('shell_side_effect_unresolved');
          this.core.reconcileOperation(op.id, outcome.exitCode === 0 && !outcome.timedOut ? 'succeeded' : 'failed');
        } else if (op.state === 'unknown' && plan.tool !== 'bash' && plan.tool !== 'none') {
          const version = this.fileVersion(journal);
          if (version === plan.expectedContentDigest) this.core.reconcileOperation(op.id, 'succeeded', version);
          else if (version === plan.fileVersion) this.core.reconcileOperation(op.id, 'failed');
          else throw new Error('side_effect_unresolved');
        }
        const current = this.core.snapshot(binding.threadId).operations.find(o => o.id === op.id)!;
        if(plan.tool==='none'&&plan.model.fileTools&&current.tool!=='bash'&&current.state==='succeeded'){const file=this.core.fileOperation(op.id)!;if(file.request.tool!=='read')this.core.reconcileArtifact(binding,op.id,file.request.parameters.path);}
        if (plan.tool !== 'bash' && plan.tool !== 'none' && current.state === 'succeeded') this.core.reconcileArtifact(binding, op.id, plan.target);
      }
      this.core.reconcileRun(binding.runId, cancelRequested ? 'cancelled' : 'failed', { piIdle: true, hostClean: true });
    }
  }
}
