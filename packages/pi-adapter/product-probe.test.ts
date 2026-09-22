// Real Pi SDK + product host integration, driven without a model. Authored messages are SYNTHETIC.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test, type TestContext } from 'node:test';
import { validateToolArguments, type AssistantMessage, type ToolCall } from '@earendil-works/pi-ai';
import { createAgentSession, createAgentSessionRuntime, defineTool, SessionManager, type AgentSession } from '@earendil-works/pi-coding-agent';
import { ProductCore } from '../../apps/agent-server/core.ts';
import { bindProductSession, projectObservation } from './product-binding.ts';
import { createProbeRuntime, createProbeServices } from './probe.ts';
import { createToolProbe, digest } from './tool-probe.ts';

const root = process.env.PI_PROBE_ROOT;
assert.ok(root, 'Use npm run test:product-sdk');
assert.equal(process.permission.has('child'), false);
const settled = { piIdle: true, hostClean: true };
function fixture(t: TestContext) {
  const dir = mkdtempSync(join(root!, 'product-sdk-')); const cwd = join(dir, 'workspace');
  const agentDir = join(dir, 'agent'); const sessions = join(dir, 'native');
  for (const path of [cwd, agentDir, sessions]) mkdirSync(path);
  const db = join(dir, 'product.sqlite'); const workspaces = [{ id: 'workspace', path: cwd }];
  const core = new ProductCore(db, workspaces); t.after(() => core.close());
  const thread = core.handle({ type: 'threads.create', requestId: 'thread', workspaceId: 'workspace', title: 'SYNTHETIC SDK integration' }).id;
  core.handle({ type: 'runs.start', requestId: 'run', threadId: thread, input: 'SYNTHETIC product intent; never sent to a model' });
  const binding = core.dispatchNext(); assert.ok(binding); core.markRunning(binding);
  return { dir, cwd, agentDir, sessions, db, workspaces, core, thread, binding };
}
function appendSyntheticNative(manager: SessionManager): void {
  manager.appendCustomEntry('synthetic-b', { synthetic: true, modelInvoked: false });
  manager.appendMessage({ role: 'user', content: 'SYNTHETIC_NATIVE_ONLY_CONTENT', timestamp: 1 });
  const assistant: AssistantMessage = { role: 'assistant', content: [{ type: 'text', text: 'SYNTHETIC_NATIVE_ONLY_RESPONSE; no model invoked' }],
    api: 'openai-responses', provider: 'synthetic-b', model: 'synthetic-b', timestamp: 2, stopReason: 'stop',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
  manager.appendMessage(assistant); // Pi controls its initial disk-save policy.
}
function gate() { let open!: () => void; const promise = new Promise<void>(resolve => { open = resolve; }); return { promise, open }; }
async function invokeWrite(session: AgentSession, id: string, path: string, content: string) {
  const tool = session.agent.state.tools.find(tool => tool.name === 'write'); assert.ok(tool);
  const prepared: unknown = tool.prepareArguments?.({ path, content }) ?? { path, content };
  assert.ok(prepared && typeof prepared === 'object' && !Array.isArray(prepared));
  const call: ToolCall = { type: 'toolCall', id, name: 'write', arguments: Object.fromEntries(Object.entries(prepared)) };
  return tool.execute(id, validateToolArguments(tool, call));
}

test('native-history-ownership: actual Pi file closes/reopens while SQLite only retains reference and product facts', async t => {
  const f = fixture(t); const manager = SessionManager.create(f.cwd, f.sessions); appendSyntheticNative(manager);
  const file = manager.getSessionFile(); assert.ok(file && existsSync(file));
  const services = await createProbeServices(f);
  const { session } = await createAgentSession({ ...services, sessionManager: manager, tools: [], customTools: [], noTools: 'all' });
  t.after(() => session.dispose()); f.core.bindNativeSession(f.binding, file);
  const unbind = bindProductSession(session, f.binding, (binding, event) => { f.core.observe(binding, event); });
  await session.sendCustomMessage({ customType: 'synthetic-b', content: 'SYNTHETIC_NATIVE_ONLY_CUSTOM', display: false,
    details: { synthetic: true, modelInvoked: false } }, { triggerTurn: false });
  unbind(); unbind();
  const expected = structuredClone(session.messages); const before = digest(readFileSync(file));
  assert.ok(f.core.eventsAfter(f.thread, 0).some(event => event.eventType === 'message_end'));
  f.core.settle(f.binding, 'completed', settled);
  const snapshot = f.core.snapshot(f.thread); assert.equal(JSON.stringify(snapshot).includes(file), false);
  f.core.close(); session.dispose();
  assert.equal(readFileSync(f.db).includes(Buffer.from('SYNTHETIC_NATIVE_ONLY')), false);
  const reopened = new ProductCore(f.db, f.workspaces); t.after(() => reopened.close());
  reopened.handle({ type: 'runs.start', requestId: 'next', threadId: f.thread, input: 'SYNTHETIC resume intent' });
  const dispatch = reopened.dispatchNext(); assert.ok(dispatch); assert.equal(dispatch.nativeSessionRef, file);
  assert.equal(digest(readFileSync(file)), before, 'Product state changes never edit the native file');
  const restored = await createAgentSession({ ...services, sessionManager: SessionManager.open(dispatch.nativeSessionRef!, f.sessions),
    tools: [], customTools: [], noTools: 'all' });
  try { assert.deepEqual(restored.session.messages, expected); assert.equal(restored.session.sessionId, manager.getSessionId()); }
  finally { restored.session.dispose(); }
});

test('real Pi write: durable approval precedes execution; actual content hash drives Artifact and plaintext preview', async t => {
  const f = fixture(t); let approvalReady = gate(); let approvalDecision = gate();
  const mapped = new Map<string, string>(); const phases: string[] = [];
  const tools = createToolProbe({ binding: { runId: f.binding.runId, runtimeBindingId: f.binding.runtimeBindingId, runtimeEpoch: 1, workspaceRef: f.cwd },
    deadline: () => Date.now() + 60_000,
    bash: { exec: async () => { throw new Error('SYNTHETIC: no shell approved'); } },
    authorize: async (operation, signal) => {
      const op = f.core.requestOperation(f.binding, { toolCallId: operation.toolCallId, tool: operation.tool,
        parametersDigest: operation.parametersDigest, deadline: operation.deadline,
        artifactPath: operation.target ? relative(f.cwd, operation.target) : undefined });
      mapped.set(operation.operationId, op.id); approvalReady.open(); await approvalDecision.promise; signal.throwIfAborted();
      if (f.core.snapshot(f.thread).operations.find(item => item.id === op.id)?.state === 'denied') return undefined;
      f.core.claimOperation(f.binding, op.id, operation.parametersDigest);
      return { operationId: operation.operationId, parametersDigest: operation.parametersDigest,
        expiresAt: operation.deadline, fileVersion: operation.target && existsSync(operation.target) ? digest(readFileSync(operation.target)) : null };
    },
    observe: event => {
      phases.push(event.phase);
      if (event.phase === 'write_completed') {
        const id = mapped.get(event.operation.operationId); assert.ok(id && event.contentDigest);
        f.core.finishOperation(f.binding, id, 'succeeded', event.contentDigest);
      }
    },
  });
  const services = await createProbeServices(f);
  const { session } = await createAgentSession({ ...services, sessionManager: SessionManager.inMemory(f.cwd),
    customTools: [defineTool(tools.write)], tools: ['write'], noTools: 'builtin' });
  t.after(() => { tools.revoke(); session.dispose(); });
  assert.deepEqual(session.getActiveToolNames(), ['write']);
  const pending = invokeWrite(session, 'SYNTHETIC-write', 'report.md', '# SYNTHETIC Pi artifact\n');
  await approvalReady.promise;
  assert.equal(existsSync(join(f.cwd, 'report.md')), false, 'No I/O while awaiting product approval');
  const op = f.core.snapshot(f.thread).operations[0]; assert.ok(op);
  f.core.handle({ type: 'approvals.resolve', requestId: 'allow', operationId: op.id, parametersDigest: op.parametersDigest, decision: 'allow' });
  approvalDecision.open(); await pending;
  const artifact = f.core.recordArtifact(f.binding, op.id, 'report.md');
  assert.equal(artifact.digest, digest(readFileSync(join(f.cwd, 'report.md'))));
  assert.deepEqual(f.core.previewArtifact(artifact.id), { status: 'ready', text: '# SYNTHETIC Pi artifact\n' });
  assert.ok(phases.indexOf('approved') < phases.indexOf('write_start'));
  assert.equal(phases.filter(phase => phase === 'write_completed').length, 1);
  approvalReady = gate(); approvalDecision = gate(); const writes = phases.filter(phase => phase === 'write_start').length;
  const denied = invokeWrite(session, 'SYNTHETIC-denied', 'denied.md', 'must not exist');
  const rejected = assert.rejects(denied, /approval_denied/); await approvalReady.promise;
  const deniedOp = f.core.snapshot(f.thread).operations[1]; assert.ok(deniedOp);
  f.core.handle({ type: 'approvals.resolve', requestId: 'deny', operationId: deniedOp.id, parametersDigest: deniedOp.parametersDigest, decision: 'deny' });
  approvalDecision.open(); await rejected;
  assert.equal(existsSync(join(f.cwd, 'denied.md')), false); assert.equal(phases.filter(phase => phase === 'write_start').length, writes);
  await session.waitForIdle(); f.core.settle(f.binding, 'completed', { piIdle: !session.isStreaming, hostClean: true });
  assert.equal(session.messages.length, 0, 'Direct public tool execution is not a model turn');
});

test('same real Session across Runs rejects old binding observations and unsubscribe stops duplicate delivery', async t => {
  const f = fixture(t); const services = await createProbeServices(f);
  const { session } = await createAgentSession({ ...services, sessionManager: SessionManager.inMemory(f.cwd), tools: [], customTools: [], noTools: 'all' });
  t.after(() => session.dispose()); let rejectedOld = 0;
  const old = bindProductSession(session, f.binding, (binding, event) => { if (!f.core.observe(binding, event)) rejectedOld++; });
  f.core.settle(f.binding, 'completed', settled);
  f.core.handle({ type: 'runs.start', requestId: 'second', threadId: f.thread, input: 'SYNTHETIC second task' });
  const next = f.core.dispatchNext(); assert.ok(next); f.core.markRunning(next);
  const current = bindProductSession(session, next, (binding, event) => { f.core.observe(binding, event); });
  const before = f.core.eventsAfter(f.thread, 0).filter(event => event.runId === f.binding.runId).length;
  await session.sendCustomMessage({ customType: 'synthetic-b', content: 'SYNTHETIC second Run observation', display: false }, { triggerTurn: false });
  assert.ok(rejectedOld > 0);
  assert.equal(f.core.eventsAfter(f.thread, 0).filter(event => event.runId === f.binding.runId).length, before);
  assert.equal(f.core.eventsAfter(f.thread, 0).filter(event => event.runId === next.runId && event.eventType === 'message_end').length, 1);
  old(); old(); const rejectedBefore = rejectedOld;
  await session.sendCustomMessage({ customType: 'synthetic-b', content: 'SYNTHETIC after unsubscribe', display: false }, { triggerTurn: false });
  assert.equal(rejectedOld, rejectedBefore); current();
});

test('public Pi runtime replacement rotates product identity after idle check and rebinds actual Session', async t => {
  const f = fixture(t); let binding = f.binding;
  const runtime = await createAgentSessionRuntime(createProbeRuntime, { ...f, sessionManager: SessionManager.inMemory(f.cwd) });
  let unbind = bindProductSession(runtime.session, binding, (id, event) => { f.core.observe(id, event); });
  runtime.setBeforeSessionInvalidate(() => unbind());
  runtime.setRebindSession(async session => {
    await session.bindExtensions({}); await session.waitForIdle();
    binding = { ...binding, ...f.core.replaceBinding(binding, { piIdle: !session.isStreaming, hostClean: true }) };
    unbind = bindProductSession(session, binding, (id, event) => { f.core.observe(id, event); });
  });
  t.after(async () => { unbind(); await runtime.dispose(); });
  const old = binding; const oldSession = runtime.session;
  await runtime.newSession(); assert.notEqual(runtime.session, oldSession); assert.notEqual(binding.runtimeBindingId, old.runtimeBindingId);
  assert.equal(f.core.observe(old, 'activity'), false);
  await runtime.session.sendCustomMessage({ customType: 'synthetic-b', content: 'SYNTHETIC replacement observation', display: false }, { triggerTurn: false });
  assert.equal(f.core.eventsAfter(f.thread, 0).filter(event => event.eventType === 'message_end').length, 1);
});

test('SYNTHETIC future event fallback preserves source.type but excludes raw payloads and errors', () => {
  const event = { type: 'synthetic_future', source: { type: 'synthetic_source', token: 'SYNTHETIC_SECRET' }, error: 'SYNTHETIC_SECRET', raw: { arbitrary: true } };
  assert.deepEqual(projectObservation(event), { kind: 'diagnostic', eventType: 'synthetic_future', sourceType: 'synthetic_source' });
  assert.equal(projectObservation({ type: 'agent_end' }).kind, 'activity', 'agent_end alone is never product completion');
  assert.equal(projectObservation({ type: 'agent_settled' }).kind, 'idle');
  assert.equal(projectObservation({ type: 'invalid type', source: 'invalid source' }).sourceType, null);
});
