import { parseBashParameters } from '../app-contracts/model-shell.ts';
import { parseFileToolRequest } from '../app-contracts/file-tools.ts';
import { modelFetch } from './model-fetch.ts';
import { modelStream } from './model-stream.ts';
import { modelServices, modelOutcome } from './model-services.ts';
import type { ModelSelection } from '../app-contracts/model.ts';
// A single approved Pi Runtime in a real Worker; no ProductCore/database imports.
import type { BashOperations } from '@earendil-works/pi-coding-agent';
import type { ShellOutcome } from '../app-contracts/shell.ts';
import { constants as osConstants } from 'node:os';
import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { createAgentSession, createAgentSessionRuntime, defineTool, SessionManager, type AgentSessionRuntime, type CreateAgentSessionRuntimeFactory } from '@earendil-works/pi-coding-agent';
import { parseEnvelope, type Envelope, type WireBody, type WorkerInit } from '../app-contracts/worker-ipc.ts';
import { createIsolatedServices } from './session-services.ts';
import { contentLoader, inside, verifyContent } from './approved-resources.ts';
import { createControlledTools, type ToolApproval } from './controlled-tools.ts';
import { bindProductSession } from './product-binding.ts';
import { IpcSender } from './ipc-channel.ts';
import { projectMessages } from './presentation.ts';

/** Trusted composition seam only; never serialized on product commands or IPC. */
interface WorkerDriver {
  // Lifecycle checkpoints belong only to the trusted no-model test driver; no wire fields enable them.
  testOnly?: { afterSessionCreated?: (close: () => Promise<void>) => Promise<void>; beforeBind?: (close: () => Promise<void>) => Promise<void>; beforeFileResult?:()=>Promise<void> };
  beforeReady?(runtime: AgentSessionRuntime, close: () => Promise<void>): Promise<void>;
  afterGrant?(signal: AbortSignal): Promise<void>;
  model?: (options: {cwd:string;agentDir:string;fullAccess?:boolean}, selection: ModelSelection, key: string, fetch: typeof globalThis.fetch) => ReturnType<typeof modelServices>;
  execute?(runtime: AgentSessionRuntime, signal: AbortSignal): Promise<void>;
}
export function serveWorker(driver?: WorkerDriver): { close(): Promise<void> } {
  const instanceId = process.argv[2]!; const runtimeBindingId = process.argv[3]!;
  const sender = new IpcSender((message, callback) => process.send!(message, callback));
  let sequence = 0; let config: WorkerInit | undefined; let runtime: AgentSessionRuntime | undefined;
  let tools: ReturnType<typeof createControlledTools> | undefined;
  let creating: Promise<void> | undefined; let executing: Promise<void> | undefined; let closing: Promise<void> | undefined;
  let closed = false; let started = false; let unbind = () => {}; let subscriptionGeneration = 0;
  const abort = new AbortController();
  const grants = new Map<string, { resolve: (value: ToolApproval | undefined) => void; localId: string; tool: string }>();
  let shellGrant: { operationId: string; parametersDigest: string } | undefined;
  let shellPending: { requestId: string; resolve(outcome: ShellOutcome): void; reject(error: Error): void } | undefined;
  const claimed = new Set<string>();
  const fileClaims=new Map<string,string>();
  const settlements=new Map<string,{id:string;resolve():void;reject(error:Error):void}>();
  const seen = new Map<string,string>();
  const references = new Map<string, { resolve(): void; reject(error: Error): void }>();
  let reservedReference: string | null = null;
  let priorEntries = new Set<string>();
  const send = (body: WireBody, requestId = `${body.type === 'observation' || body.type === 'presentation' ? body.type : 'worker'}-${++sequence}`) => sender.send({ version: 11, instanceId, runtimeBindingId, requestId, body } satisfies Envelope);
  const publish = () => runtime && started && !closed ? send({ type: 'presentation', projection: projectMessages(runtime.session.sessionManager.getBranch().filter(entry => !priorEntries.has(entry.id))) }) : Promise.resolve();
  function close(): Promise<void> {
    if (closing) return closing;
    closed = true; transport.close(); stream?.close(); subscriptionGeneration++; unbind(); abort.abort(new Error('worker_closed')); tools?.revoke();
    shellPending?.reject(new Error('worker_closed')); shellPending = undefined;
    for (const grant of grants.values()) grant.resolve(undefined); grants.clear();
    for(const p of settlements.values())p.reject(new Error('worker_closed'));settlements.clear();
    for (const reference of references.values()) reference.reject(new Error('worker_closed')); references.clear();
    closing = Promise.resolve().then(async () => {
      await creating?.catch(() => {}); await executing?.catch(() => {});
      unbind(); if (runtime) await runtime.dispose();
      await send({ type: 'closed', nativeRef: reservedReference });
      sender.close(); if (process.connected) process.disconnect();
    });
    return closing;
  }
  const transport = modelFetch(send,()=>Boolean(config?.model?.fileTools));
  let key: string | undefined;
  let stream: ReturnType<typeof modelStream> | undefined;
  const fail = () => { void close().catch(() => { sender.close(); if (process.connected) process.disconnect(); process.exitCode = 1; }); };
  const shellBackend: BashOperations = { exec: async (_command, _cwd, execution) => {
    if (!shellGrant || shellPending || closed || abort.signal.aborted) throw new Error('shell_not_admitted');
    const requestId = `shell-${++sequence}`;
    const response = new Promise<ShellOutcome>((resolve, reject) => { shellPending = { requestId, resolve, reject }; });
    const onAbort = () => shellPending?.reject(new Error('shell_cancelled'));
    execution.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      await send({ type: 'shell-exec', ...shellGrant }, requestId); const outcome = await response;
      execution.onData(Buffer.from(outcome.stdout)); execution.onData(Buffer.from(outcome.stderr));
      if (outcome.truncated) execution.onData(Buffer.from('\n[Workbench transport output limit reached]\n'));
      if (outcome.timedOut) throw new Error(`timeout:${execution.timeout}`);
      return { exitCode: outcome.exitCode ?? (outcome.signal ? 128 + (osConstants.signals[outcome.signal as keyof typeof osConstants.signals] ?? 0) : 1) };
    } finally { execution.signal?.removeEventListener('abort', onAbort); shellPending = undefined; shellGrant = undefined; }
  } };
  async function initialize(c: WorkerInit) {
    if (c.binding.runtimeBindingId !== runtimeBindingId) throw new Error('binding_mismatch');
    config = c;
    const resources = contentLoader({ cwd: c.workspace, agentDir: c.agentDir }); resources.select(c.resources); await resources.loader.reload();
    if (closed || resources.loaded?.id !== c.resources.id) throw new Error('resource_admission_blocked'); verifyContent(c.resources);
    tools = createControlledTools({ fileAccess:c.fileAccess, binding: { runId: c.binding.runId, runtimeBindingId, runtimeEpoch: 1, workspaceRef: c.workspace },
      deadline: () => c.model?.fileTools?Math.min(c.deadline??Infinity,Date.now()+c.model.fileTools.operationTimeoutMs):(c.deadline??Date.now()), bash: shellBackend, observe: () => {},
      ...(c.model?.fileTools?{relativeFilePaths:true,fileLimitBytes:16000,settle:async(operation:import('./controlled-tools.ts').ToolOperation,ok:boolean)=>{
        const operationId=fileClaims.get(operation.operationId);if(!operationId)return;
        await driver?.testOnly?.beforeFileResult?.();
        if(closed)throw new Error('worker_closed');
        const id=`settle-${++sequence}`;
        const accepted=new Promise<void>((resolve,reject)=>settlements.set(id,{id:operationId,resolve,reject}));
        try{await send({type:'file-result',operationId,ok},id);await accepted;}finally{settlements.delete(id);fileClaims.delete(operation.operationId);}
      }}:{}),
      authorize: async operation => {
        if (closed || !(c.model?.fileTools?['read','write','edit',...(c.model.shellTools?['bash']:[])]:['write','edit','bash']).includes(operation.tool) || (operation.tool !== 'bash' && !operation.target)) throw new Error('tool_not_admitted');
        verifyContent(c.resources);
        await publish();
        const requestId = `operation-${++sequence}`;
        const promise = new Promise<ToolApproval | undefined>(resolve => { grants.set(requestId, { resolve, localId: operation.operationId, tool: operation.tool }); });
        if(c.model?.shellTools&&operation.tool==='bash')await send({type:'shell-operation',toolCallId:operation.toolCallId,parameters:parseBashParameters(operation.parameters),resourceLock:c.resources.id},requestId);
        else if(c.model?.fileTools)await send({type:'file-operation',toolCallId:operation.toolCallId,request:parseFileToolRequest({tool:operation.tool,parameters:operation.parameters},c.fileAccess?'full':'workspace'),resourceLock:c.resources.id},requestId);
        else await send({ type: 'operation', toolCallId: operation.toolCallId, tool: operation.tool as 'write' | 'edit' | 'bash', parametersDigest: operation.parametersDigest,
          target: operation.target ? relative(c.workspace, operation.target) : '.', resourceLock: c.resources.id }, requestId);
        try { const approval = await promise; if (approval) await driver?.afterGrant?.(abort.signal); return approval; } finally { grants.delete(requestId); }
      } });
    const definitions = c.model?.fileTools ? [defineTool({...tools.read,executionMode:'sequential'}),defineTool({...tools.write,executionMode:'sequential'}),defineTool({...tools.edit,executionMode:'sequential'}),...(c.model.shellTools?[defineTool({...tools.bash,executionMode:'sequential'})]:[])] : c.model ? [] : [defineTool(tools.write), defineTool(tools.edit), defineTool(tools.bash)];
    const factory: CreateAgentSessionRuntimeFactory = async options => {
      if (closed) throw new Error('worker_closed');
      const reference = options.sessionManager.getSessionFile();
      if (!reference || !inside(c.sessions, reference)) throw new Error('invalid_native_reference');
      const requestId = `native-${++sequence}`;
      const accepted = new Promise<void>((resolve, reject) => { references.set(requestId, { resolve, reject }); });
      // Persist Pi's preallocated path in the host before Session creation or synthetic/real input.
      void send({ type: 'session-reference', nativeRef: reference }, requestId).catch(() => references.get(requestId)?.reject(new Error('native_reference_failed')));
      try { await accepted; } finally { references.delete(requestId); }
      if (closed) throw new Error('worker_closed'); reservedReference = reference;
      if (Boolean(c.model) !== Boolean(driver?.model)) throw new Error('model_composition_mismatch');
      const configured = c.model && driver?.model ? await driver.model({...options,fullAccess:!!c.fileAccess}, c.model, key ?? '', transport.fetch) : undefined; key = undefined;
      const services = configured?.services ?? await createIsolatedServices(options); if (!c.model) services.resourceLoader = resources.loader;
      const result = await createAgentSession({ ...services, sessionManager: options.sessionManager, sessionStartEvent: options.sessionStartEvent,
        ...(configured ? { model: configured.model } : {}), tools: c.model?.fileTools?['read','write','edit',...(c.model.shellTools?['bash']:[])]:c.model ? [] : ['write','edit','bash'], customTools: definitions, noTools: c.model&&!c.model.fileTools ? 'all' : 'builtin', thinkingLevel: 'off' });
      try { await driver?.testOnly?.afterSessionCreated?.(close); } catch (error) { result.session.dispose(); throw error; }
      if (closed) { result.session.dispose(); throw new Error('worker_closed'); }
      return { ...result, services, diagnostics: services.diagnostics };
    };
    if (c.binding.nativeSessionRef && !inside(c.sessions, c.binding.nativeSessionRef)) throw new Error('native_reference_outside_session_root');
    if (c.binding.nativeSessionRef && c.binding.nativeSessionPersisted && !existsSync(c.binding.nativeSessionRef)) throw new Error('native_session_missing');
    const manager = c.binding.nativeSessionRef ? SessionManager.open(c.binding.nativeSessionRef, c.sessions) : SessionManager.create(c.workspace, c.sessions);
    runtime = await createAgentSessionRuntime(factory, { cwd: c.workspace, agentDir: c.agentDir, sessionManager: manager });
    const bind = async () => {
      if (closed) throw new Error('worker_closed');
      const generation = ++subscriptionGeneration; const session = runtime!.session;
      await session.bindExtensions({});
      await driver?.testOnly?.beforeBind?.(close);
      if (closed || generation !== subscriptionGeneration) throw new Error('worker_closed');
      unbind = bindProductSession(session, c.binding, (_binding, event) => {
        if (!closed && generation === subscriptionGeneration && !(c.model && ['message_update','message_start','message_end'].includes(event.eventType))) void send({ type: 'observation', ...event }).catch(fail);
      });
    };
    runtime.setBeforeSessionInvalidate(() => { subscriptionGeneration++; unbind(); });
    runtime.setRebindSession(bind); await bind();
    await driver?.beforeReady?.(runtime, close);
    if (closed) return;
    await send({ type: 'ready', resourceLock: resources.loaded.id, nativeRef: reservedReference });
  }
  async function receive(raw: unknown) {
    const message = parseEnvelope(raw);
    if (message.instanceId !== instanceId || message.runtimeBindingId !== runtimeBindingId) throw new Error('stale_host');
    const { body, requestId } = message;
    if (['model-http-head','model-http-chunk','model-http-error','model-http-finished'].includes(body.type)) { if(!transport.receive(requestId,body))throw new Error('unexpected_http_response');return; }
    if (body.type === 'model-key') { if(creating || key !== undefined || !driver?.model)throw new Error('unexpected_model_key'); key=body.key;return; }
    if (body.type === 'cancel') { abort.abort(new Error('cancel_requested')); tools?.revoke(); transport.close(); if (config?.model) void runtime?.session.abort().catch(fail); for (const g of grants.values()) g.resolve(undefined); return; }
    if (body.type === 'close') { fail(); return; }
    if (closed) return;
    const serialized=JSON.stringify(body),prior=seen.get(requestId);
    if(prior!==undefined){if(prior!==serialized)throw new Error('request_id_conflict');return;}
    // Only host lifecycle/control replies reach this map. Cancellation/close above
    // always work, even on a saturated or failing connection.
    seen.set(requestId,serialized); // Released on Worker disposal, not a tool-count gate.
    if(body.type==='file-settled'){const p=settlements.get(requestId);if(!p||p.id!==body.operationId)throw new Error('file_settlement_mismatch');p.resolve();return;}
    if (body.type === 'shell-result') { if (shellPending?.requestId === requestId) shellPending.resolve(body.outcome); return; }
    if (body.type === 'session-reference-accepted') { references.get(requestId)?.resolve(); return; }
    if (body.type === 'init') {
      if (creating) throw new Error('already_initialized');
      creating = Promise.resolve().then(() => initialize(body.config));
      void creating.catch(async () => { await send({ type: 'fault', code: 'initialization_failed' }).catch(() => {}); fail(); }); return;
    }
    if (body.type === 'grant' || body.type === 'deny') {
      const pending = grants.get(requestId); if (!pending) return;
      if (body.type === 'grant') {
        if (abort.signal.aborted || (config!.deadline!==null && body.expiresAt > config!.deadline) || Date.now() >= body.expiresAt) { pending.resolve(undefined); return; }
        if(pending.tool==='bash')shellGrant = { operationId: body.operationId, parametersDigest: body.parametersDigest };
        if(config!.model?.fileTools){if(pending.tool!=='bash')fileClaims.set(pending.localId,body.operationId);}else claimed.add(body.operationId); pending.resolve({ ...body, operationId: pending.localId });
      } else pending.resolve(undefined); return;
    }
    if (body.type === 'start') {
      if (started) return;
      if (!runtime || !config || !driver) throw new Error('worker_driver_not_configured'); started = true;
      executing = (async () => {
        priorEntries = new Set(runtime!.session.sessionManager.getBranch().map(entry => entry.id));
        let ok = false;const firstMessage=runtime!.session.messages.length;
        try {
          abort.signal.throwIfAborted(); verifyContent(config!.resources);
          if (config!.model) {
            if (JSON.stringify(runtime!.session.getActiveToolNames().sort())!==JSON.stringify(config!.model.fileTools?[...(config!.model.shellTools?['bash']:[]),'edit','read','write']:[])) throw new Error('model_tool_set_mismatch');
            stream = modelStream(runtime!.session, priorEntries, projection => send({type:'presentation',projection}));
            const unsubscribe = runtime!.session.subscribe(event => stream?.observe(event));
            try { await runtime!.session.prompt(config!.binding.input); } finally { unsubscribe(); await stream.finish(); stream.close(); }
            const outcome = modelOutcome(runtime!.session, config!.model.mode === 'offline', abort.signal.aborted,firstMessage);
            await send({type:'model-outcome',outcome}); ok = outcome.reason === 'stop' || outcome.reason === 'length';
          } else { await driver.execute!(runtime!, abort.signal); ok = !abort.signal.aborted; }
        }
        catch { ok = false; }
        await publish();
        for (const operationId of claimed) await send({ type: 'result', operationId, ok });
        await send({ type: 'done', ok });
      })(); void executing.catch(fail); return;
    }
    throw new Error('unexpected_host_message');
  }
  process.on('message', raw => { void receive(raw).catch(fail); });
  process.on('disconnect', fail); process.on('SIGTERM', fail);
  void send({ type: 'hello', pid: process.pid }).catch(fail);
  return { close };
}
