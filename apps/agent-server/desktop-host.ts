import type { ModelShellPolicy } from '../../packages/app-contracts/model-shell.ts';
import { fileRunDuration, type FileToolPolicy } from '../../packages/app-contracts/file-tools.ts';
import { parseModelConfiguration, type ModelConfiguration } from '../../packages/app-contracts/model.ts';
import type { ModelAccess, ModelExecutionPlan } from './worker-supervisor.ts';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseDesktopRequest, type DesktopHome, type DesktopValue } from '../../packages/app-contracts/desktop.ts';
import { displayText } from '../../packages/app-contracts/presentation.ts';
import { contentId, inspectContent } from '../../packages/pi-adapter/approved-resources.ts';
import { digest, parametersDigest } from '../../packages/pi-adapter/controlled-tools.ts';
import { demoIntent } from '../../packages/pi-adapter/demo-intent.ts';
import { ProductCore } from './core.ts';
import { shellDemo } from './shell-demo.ts';
import { WorkerSupervisor } from './worker-supervisor.ts';
import { WorkspaceAdmission } from './workspace-admission.ts';
import { repository } from './worker-launcher.ts';

/** Trusted --demo App Server composition. The entire profile is owned by this launch, not chosen by a Renderer. */
export class DesktopHost {
  readonly core: ProductCore;
  readonly supervisor: WorkerSupervisor;
  private blocked = false;
  private closing = false;
  private closeResult?: Promise<void>;
  private running = false;
  private readonly modelMode?: {mode:'offline'|'live';fileTools?:FileToolPolicy;shellTools?:ModelShellPolicy;configuration?:ModelConfiguration;requestUrl?:string;reserveCostUsd?:number};
  private modelKey?:string;
  private readonly admission: WorkspaceAdmission;
  private readonly credentialRootsFile:string;
  private readonly credentialRoots:string[];
  constructor(profile: string, model?: {mode:'offline'|'live';fileTools?:FileToolPolicy;shellTools?:ModelShellPolicy;configuration?:ModelConfiguration;requestUrl?:string;reserveCostUsd?:number}, protectedDirectories:readonly string[]=[]) {
    this.modelMode=model;
    if(model?.configuration)parseModelConfiguration(model.configuration);
    mkdirSync(profile, { recursive: true, mode: 0o700 }); const root = realpathSync(profile);
    this.credentialRootsFile=join(root,'host','credential-directories.json');
    const saved:unknown=existsSync(this.credentialRootsFile)?JSON.parse(readFileSync(this.credentialRootsFile,'utf8')):[];
    if(!Array.isArray(saved)||saved.length>16||saved.some(p=>typeof p!=='string'||p.length>4096))throw new Error('credential_roots_invalid');
    this.credentialRoots=saved;
    this.admission=new WorkspaceAdmission(root,[...protectedDirectories,...this.credentialRoots]);
    const workspace = join(root, 'workspace'); const database = join(root, 'host'); const state = join(root, 'state'); const resourcesRoot = join(root, 'resources');
    for (const dir of [workspace, database, state, resourcesRoot]) mkdirSync(dir, { recursive: true, mode: 0o700 });
    const manifest = join(resourcesRoot, 'package.json'); const content = JSON.stringify({ name: 'synthetic-desktop-resources', version: '1.0.0', pi: { skills: [] } });
    if (!existsSync(manifest)) writeFileSync(manifest, content, { flag: 'wx', mode: 0o600 });
    if (readFileSync(manifest, 'utf8') !== content) throw new Error('demo_resource_changed');
    const files = inspectContent(resourcesRoot);
    if (files.length !== 1) throw new Error('unapproved_demo_resources');
    this.core = new ProductCore(join(database, 'product.sqlite'), [{ id: 'demo-workspace', path: workspace }]);
    this.supervisor = new WorkerSupervisor(this.core, { stateDirectory: state, databaseDirectory: database,
      validateWorkspace:(id,path)=>{this.admission.check(path,id==='demo-workspace');},
      resources: { root: resourcesRoot, id: contentId(files), files, expectedSkillNames: [] } });
    this.recover();
  }
  selectWorkspace(path: string): void {
    if(this.closing||this.running||this.blocked)throw new Error('workspace_busy');
    const canonical=realpathSync(path);
    try { this.admission.check(canonical); } catch { throw new Error('workspace_overlaps_host'); }
    this.core.selectWorkspace(canonical);
  }
  private checkThreadWorkspace(threadId:string): void {
    const workspace=this.core.threadWorkspace(threadId);this.admission.check(workspace.path,workspace.id==='demo-workspace');
  }
  /** Called by the trusted native credential bridge before it reads any bytes. */
  protectCredentialDirectory(path:string):void {
    if(this.closing||this.running)throw new Error('workspace_busy');
    const canonical=realpathSync(path);
    if(this.credentialRoots.includes(canonical))return;
    if(this.credentialRoots.length>=16)throw new Error('credential_roots_limit');
    this.admission.protect(canonical,this.core.workspaceSelection().items);
    this.credentialRoots.push(canonical);
    writeFileSync(this.credentialRootsFile,JSON.stringify(this.credentialRoots),{mode:0o600});
  }
  private recover() { try { this.supervisor.recover(); this.blocked = false; } catch { this.blocked = true; } }
  private home(): DesktopHome {
    const threads = this.core.listThreads();
    const config = this.modelMode?.configuration;
    const model: DesktopHome['model'] = !this.modelMode ? undefined : {
      status: this.modelMode.mode === 'offline' ? 'ready' : !config?.approved ? 'not_configured' : this.modelKey ? this.core.modelAdmission(config,this.modelMode.reserveCostUsd ?? 0).status : 'key_required',
      provider: config?.provider ?? (this.modelMode.mode === 'offline' ? 'workbench-synthetic' : ''),
      model: config?.model ?? (this.modelMode.mode === 'offline' ? 'synthetic-text' : ''),
      ...(!config&&this.modelMode.fileTools?{limits:{endpoint:'synthetic://no-network',requests:0,estimatedUsd:0,outputTokens:1024,fileTools:this.modelMode.fileTools,...(this.modelMode.shellTools?{shellTools:this.modelMode.shellTools}:{})}}:{}),
      ...(config ? { limits: { endpoint: config.endpoint, requests: config.maxRequests??null, estimatedUsd: config.maxEstimatedCostUsd, outputTokens: config.maxOutputTokens, timeoutMs:config.timeoutMs, httpIdleTimeoutMs:config.httpIdleTimeoutMs??config.timeoutMs,...(config.fileTools?{fileTools:config.fileTools}:{}),...(config.shellTools?{shellTools:config.shellTools}:{}) } } : {}),
    };
    return {
      workspaces:{...this.core.workspaceSelection(),items:this.core.workspaceSelection().items.map(w=>{
        try{this.admission.check(w.path,w.id==='demo-workspace');return {...w,status:'ready' as const};}
        catch{return {...w,status:'invalid' as const};}
      })},
      mode: this.modelMode ? this.modelMode.mode === 'offline' ? 'model-offline' : 'model' : 'synthetic',
      ...(model ? { model } : {}), threads: threads.map(t => ({ ...t, title: displayText(t.title, 160) })),
      recovery: this.blocked ? 'blocked' : 'ready',
      activeRuns: this.core.activeRuns(),
    };
  }
  request(raw: unknown): DesktopValue {
    if (this.closing) throw new Error('host_closing');
    const request = parseDesktopRequest(raw);
    switch (request.type) {
      case 'history-entry':return this.core.historyEntry(request.threadId,request.runId);
      case 'history-page':return this.core.historyPage(request.threadId,request.page);
      case 'operation-page':return this.core.operationPage(request.runId,request.page);
      case 'artifact-page':return this.core.artifactPage(request.threadId,request.page);
      case 'thread-activity':{
        let workspaceStatus:'ready'|'invalid'='ready';try{this.checkThreadWorkspace(request.threadId);}catch{workspaceStatus='invalid';}
        return {...this.core.threadActivity(request.threadId),workspaceStatus};
      }
      case 'home': return this.home();
      case 'thread': {
        const snapshot = this.core.snapshot(request.threadId);
        return { ...snapshot, modelOutcomes: snapshot.runs.map(r=>({runId:r.id,value:this.core.modelOutcome(r.id)})), operations: snapshot.operations.map(op => op.shell ? { ...op, shell: { ...op.shell, outcome: op.shell.outcome ? { ...op.shell.outcome, stdout: displayText(op.shell.outcome.stdout, 8192), stderr: displayText(op.shell.outcome.stderr, 8192) } : null } } : op), thread: { ...snapshot.thread, title: displayText(snapshot.thread.title, 160) },
          inputs: this.core.runInputs(request.threadId).map(r => ({ id: r.id, text: displayText(r.input, 16384) })),
          presentations: snapshot.runs.map(r => ({ runId: r.id, value: this.core.presentation(r.id) })) };
      }
      case 'events': return this.core.eventsAfter(request.threadId, request.cursor);
      case 'preview': {
        const workspace=this.core.artifactWorkspace(request.artifactId);this.admission.check(workspace.path,workspace.id==='demo-workspace');
        const preview = this.core.previewArtifact(request.artifactId);
        return preview.text === undefined ? preview : { status: preview.status, text: displayText(preview.text, 1_048_576) };
      }
      case 'recover': this.recover(); this.pump(); return this.home();
      case 'command': {
        if(request.command.type==='runs.start'&&!this.core.hasRequest(request.command.requestId))this.checkThreadWorkspace(request.command.threadId);
        if(request.command.type==='runs.start' && this.modelMode?.mode==='live' && (!this.modelMode.configuration?.approved||!this.modelKey))throw new Error('model_not_configured');
        if(request.command.type==='runs.start' && this.modelMode?.mode==='live' && this.modelMode.configuration && !this.core.hasRequest(request.command.requestId) && this.core.modelAdmission(this.modelMode.configuration,this.modelMode.reserveCostUsd ?? 0).status!=='ready')throw new Error('model_policy_or_budget');
        const ack = this.supervisor.command(request.command); this.pump(); return ack;
      }
    }
  }
  setModelKey(key:string):void {
    if(this.closing||this.running||this.modelMode?.mode!=='live'||!this.modelMode.configuration?.approved||typeof key!=='string'||!key||key.length>8192||/[\r\n\0]/.test(key))throw new Error('model_key_not_admitted');
    this.modelKey=key;
  }
  /** Only this trusted driver selects the registered write, exact bytes, target and deadline. */
  pump(): void {
    if (this.closing || this.blocked || this.running || (this.modelMode?.mode==='live' && (!this.modelMode.configuration?.approved || !this.modelKey))) return;
    const next = this.core.nextQueuedIntent(); if (!next) return;
    try{this.checkThreadWorkspace(next.threadId);}catch{
      this.core.rejectQueuedWorkspace(next.id);queueMicrotask(()=>this.pump());return;
    }
    const shell = shellDemo(next.input);
    const args = demoIntent(next.id, next.input);
    const entry = join(repository, 'packages/pi-adapter/desktop-demo-worker.ts');
    try {
      const config=this.modelMode?.configuration;const fileTools=config?.fileTools??this.modelMode?.fileTools;const shellTools=config?.shellTools??this.modelMode?.shellTools;
      const modelPlan:ModelExecutionPlan|undefined=this.modelMode?{tool:'none',deadline:Date.now()+(fileTools?fileRunDuration(fileTools,config?.timeoutMs??30000,config?{total:config.maxEstimatedCostUsd,perRequest:this.modelMode.reserveCostUsd??0}:undefined):(config?.timeoutMs??30000)+5000),model:{mode:this.modelMode.mode,provider:config?.provider??'workbench-synthetic',model:config?.model??'synthetic-text',endpoint:config?.endpoint??'synthetic://no-network',maxOutputTokens:config?.maxOutputTokens??1024,timeoutMs:config?.timeoutMs??30000,...(config?.openai?{openai:config.openai}:{}),...(fileTools?{fileTools}:{}),...(shellTools?{shellTools}:{})}}:undefined;
      const access:ModelAccess|undefined=config && this.modelKey && this.modelMode?.requestUrl && this.modelMode.reserveCostUsd!==undefined?{key:this.modelKey,configuration:config,requestUrl:this.modelMode.requestUrl,reserveCostUsd:this.modelMode.reserveCostUsd}:undefined;
      const completion = modelPlan?this.supervisor.startNext(modelPlan,{path:join(repository, this.modelMode?.mode==='offline'?'packages/pi-adapter/model-test-worker.ts':'packages/pi-adapter/model-worker.ts')},access):this.supervisor.startNext(shell ? { tool: 'bash', target: '.', shell, parametersDigest: parametersDigest({ command: shell.command, timeout: shell.timeoutMs / 1000 }), deadline: Date.now() + 120_000 } : { tool: 'write', target: args.path, parametersDigest: parametersDigest(args),
        fileVersion: null, expectedContentDigest: digest(args.content), deadline: Date.now() + 120_000 },
      shell ? { path: join(repository, 'packages/pi-adapter/shell-demo-worker.ts'), args: [JSON.stringify({ command: shell.command, timeout: shell.timeoutMs / 1000 })] } : { path: entry, args: [JSON.stringify({ runId: next.id, input: next.input })] });
      if (!completion) return;
      this.running = true;
      void completion.catch(() => { this.blocked = true; }).finally(() => {
        this.running = false;
        if (this.closing) return;
        if (this.home().activeRuns.some(r => r.state === 'unknown')) this.blocked = true;
        this.pump();
      });
    } catch { this.blocked = true; }
  }
  close(): Promise<void> {
    if (!this.closeResult) {
      this.closing = true; this.modelKey=undefined;
      this.closeResult = (async () => {
        try {
          // Closing the owned host ends its queued/active work. Keep every intent and
          // cancellation in the existing product audit; unknown needs reconciliation.
          try {
            for (const thread of this.core.listThreads()) for (const run of this.core.snapshot(thread.id).runs) {
              if (['queued','starting','running'].includes(run.state)) this.supervisor.command({ type: 'runs.cancel', requestId: randomUUID(), runId: run.id });
            }
          } finally { await this.supervisor.close(); }
          // A stopped process is insufficient: use the original guardian receipts,
          // Operation/file checks and native references before closing SQLite.
          this.supervisor.recover();
        } finally { this.core.close(); }
      })();
    }
    return this.closeResult;
  }
}
