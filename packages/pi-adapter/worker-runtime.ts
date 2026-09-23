// A single approved Pi Runtime in a real Worker; no ProductCore/database imports.
import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { createAgentSession, createAgentSessionRuntime, defineTool, SessionManager, type AgentSessionRuntime, type CreateAgentSessionRuntimeFactory } from '@earendil-works/pi-coding-agent';
import { parseEnvelope, type Envelope, type WireBody, type WorkerInit } from '../app-contracts/worker-ipc.ts';
import { createIsolatedServices } from './session-services.ts';
import { contentLoader, inside, verifyContent } from './approved-resources.ts';
import { createControlledTools, type ToolApproval } from './controlled-tools.ts';
import { bindProductSession } from './product-binding.ts';
import { IpcSender } from './ipc-channel.ts';

/** Trusted composition seam only; never serialized on product commands or IPC. */
interface WorkerDriver {
  // Lifecycle checkpoints belong only to the trusted no-model test driver; no wire fields enable them.
  testOnly?: { afterSessionCreated?: (close: () => Promise<void>) => Promise<void>; beforeBind?: (close: () => Promise<void>) => Promise<void> };
  beforeReady?(runtime: AgentSessionRuntime, close: () => Promise<void>): Promise<void>;
  afterGrant?(signal: AbortSignal): Promise<void>;
  execute(runtime: AgentSessionRuntime, signal: AbortSignal): Promise<void>;
}
export function serveWorker(driver?: WorkerDriver): { close(): Promise<void> } {
  const instanceId = process.argv[2]!; const runtimeBindingId = process.argv[3]!;
  const sender = new IpcSender((message, callback) => process.send!(message, callback));
  let sequence = 0; let config: WorkerInit | undefined; let runtime: AgentSessionRuntime | undefined;
  let tools: ReturnType<typeof createControlledTools> | undefined;
  let creating: Promise<void> | undefined; let executing: Promise<void> | undefined; let closing: Promise<void> | undefined;
  let closed = false; let started = false; let unbind = () => {}; let subscriptionGeneration = 0;
  const abort = new AbortController();
  const grants = new Map<string, { resolve: (value: ToolApproval | undefined) => void; localId: string }>();
  const claimed = new Set<string>();
  const seen = new Set<string>();
  const send = (body: WireBody, requestId = `worker-${++sequence}`) => sender.send({ version: 1, instanceId, runtimeBindingId, requestId, body } satisfies Envelope);
  const nativeRef = () => { const path = runtime?.session.sessionManager.getSessionFile(); return path && existsSync(path) ? path : null; };
  function close(): Promise<void> {
    if (closing) return closing;
    closed = true; subscriptionGeneration++; unbind(); abort.abort(new Error('worker_closed')); tools?.revoke();
    for (const grant of grants.values()) grant.resolve(undefined); grants.clear();
    closing = Promise.resolve().then(async () => {
      await creating?.catch(() => {}); await executing?.catch(() => {});
      unbind(); if (runtime) await runtime.dispose();
      await send({ type: 'closed', nativeRef: nativeRef() });
      sender.close(); if (process.connected) process.disconnect();
    });
    return closing;
  }
  const fail = () => { void close().catch(() => { sender.close(); if (process.connected) process.disconnect(); process.exitCode = 1; }); };
  async function initialize(c: WorkerInit) {
    if (c.binding.runtimeBindingId !== runtimeBindingId) throw new Error('binding_mismatch');
    config = c;
    const resources = contentLoader({ cwd: c.workspace, agentDir: c.agentDir }); resources.select(c.resources); await resources.loader.reload();
    if (closed || resources.loaded?.id !== c.resources.id) throw new Error('resource_admission_blocked'); verifyContent(c.resources);
    tools = createControlledTools({ binding: { runId: c.binding.runId, runtimeBindingId, runtimeEpoch: 1, workspaceRef: c.workspace },
      deadline: () => c.deadline, bash: { exec: async () => { throw new Error('shell_not_admitted'); } }, observe: () => {},
      authorize: async operation => {
        if (closed || !operation.target || !['write','edit'].includes(operation.tool)) throw new Error('tool_not_admitted');
        verifyContent(c.resources);
        const requestId = `operation-${++sequence}`;
        const promise = new Promise<ToolApproval | undefined>(resolve => { grants.set(requestId, { resolve, localId: operation.operationId }); });
        await send({ type: 'operation', toolCallId: operation.toolCallId, tool: operation.tool as 'write' | 'edit', parametersDigest: operation.parametersDigest,
          target: relative(c.workspace, operation.target), resourceLock: c.resources.id }, requestId);
        try { const approval = await promise; if (approval) await driver?.afterGrant?.(abort.signal); return approval; } finally { grants.delete(requestId); }
      } });
    const definitions = [defineTool(tools.write), defineTool(tools.edit)];
    const factory: CreateAgentSessionRuntimeFactory = async options => {
      if (closed) throw new Error('worker_closed');
      const services = await createIsolatedServices(options); services.resourceLoader = resources.loader;
      const result = await createAgentSession({ ...services, sessionManager: options.sessionManager, sessionStartEvent: options.sessionStartEvent,
        tools: ['write','edit'], customTools: definitions, noTools: 'builtin', thinkingLevel: 'off' });
      try { await driver?.testOnly?.afterSessionCreated?.(close); } catch (error) { result.session.dispose(); throw error; }
      if (closed) { result.session.dispose(); throw new Error('worker_closed'); }
      return { ...result, services, diagnostics: services.diagnostics };
    };
    if (c.binding.nativeSessionRef && !inside(c.sessions, c.binding.nativeSessionRef)) throw new Error('native_reference_outside_session_root');
    const manager = c.binding.nativeSessionRef ? SessionManager.open(c.binding.nativeSessionRef, c.sessions) : SessionManager.create(c.workspace, c.sessions);
    runtime = await createAgentSessionRuntime(factory, { cwd: c.workspace, agentDir: c.agentDir, sessionManager: manager });
    const bind = async () => {
      if (closed) throw new Error('worker_closed');
      const generation = ++subscriptionGeneration; const session = runtime!.session;
      await session.bindExtensions({});
      await driver?.testOnly?.beforeBind?.(close);
      if (closed || generation !== subscriptionGeneration) throw new Error('worker_closed');
      unbind = bindProductSession(session, c.binding, (_binding, event) => {
        if (!closed && generation === subscriptionGeneration) void send({ type: 'observation', ...event }).catch(fail);
      });
    };
    runtime.setBeforeSessionInvalidate(() => { subscriptionGeneration++; unbind(); });
    runtime.setRebindSession(bind); await bind();
    await driver?.beforeReady?.(runtime, close);
    if (closed) return;
    await send({ type: 'ready', resourceLock: resources.loaded.id, nativeRef: nativeRef() });
  }
  async function receive(raw: unknown) {
    const message = parseEnvelope(raw);
    if (message.instanceId !== instanceId || message.runtimeBindingId !== runtimeBindingId) throw new Error('stale_host');
    const { body, requestId } = message;
    if (seen.has(requestId)) return;
    if (seen.size >= 128) throw new Error('request_limit'); seen.add(requestId);
    if (body.type === 'cancel') { abort.abort(new Error('cancel_requested')); tools?.revoke(); for (const g of grants.values()) g.resolve(undefined); return; }
    if (body.type === 'close') { fail(); return; }
    if (closed) return;
    if (body.type === 'init') {
      if (creating) throw new Error('already_initialized');
      creating = Promise.resolve().then(() => initialize(body.config));
      void creating.catch(async () => { await send({ type: 'fault', code: 'initialization_failed' }).catch(() => {}); fail(); }); return;
    }
    if (body.type === 'grant' || body.type === 'deny') {
      const pending = grants.get(requestId); if (!pending) return;
      if (body.type === 'grant') {
        if (abort.signal.aborted || body.expiresAt > config!.deadline || Date.now() >= body.expiresAt) { pending.resolve(undefined); return; }
        claimed.add(body.operationId); pending.resolve({ ...body, operationId: pending.localId });
      } else pending.resolve(undefined); return;
    }
    if (body.type === 'start') {
      if (started) return;
      if (!runtime || !config || !driver) throw new Error('worker_driver_not_configured'); started = true;
      executing = (async () => {
        let ok = false;
        try { abort.signal.throwIfAborted(); verifyContent(config!.resources); await driver.execute(runtime!, abort.signal); ok = !abort.signal.aborted; }
        catch { ok = false; }
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
