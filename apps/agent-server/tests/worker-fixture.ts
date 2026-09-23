// Explicit SYNTHETIC no-model driver. This entry is selected only by trusted test/demo composition.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { validateToolArguments, type AssistantMessage, type ToolCall } from '@earendil-works/pi-ai';
import { serveWorker } from '../../../packages/pi-adapter/worker-runtime.ts';
import type { AgentSessionRuntime } from '@earendil-works/pi-coding-agent';
export interface FixtureSpec { mode: string; database: string; tool: 'write' | 'edit'; args: Record<string, unknown>; persistNative?: boolean }
const spec = JSON.parse(process.argv[4]!) as FixtureSpec;
const pause = () => new Promise<void>(() => {});
const stage = (name: string) => writeFileSync(join(process.cwd(), '.worker-stage'), name);
const syntheticNative = (runtime: AgentSessionRuntime) => {
  const manager = runtime.session.sessionManager;
  manager.appendCustomEntry('synthetic-b-ipc', { synthetic: true, modelInvoked: false });
  manager.appendMessage({ role: 'user', content: 'SYNTHETIC B-IPC native request', timestamp: 1 });
  const assistant: AssistantMessage = { role: 'assistant', content: [{ type: 'text', text: 'SYNTHETIC B-IPC native response; no model invoked' }],
    api: 'openai-responses', provider: 'synthetic-b-ipc', model: 'synthetic-b-ipc', timestamp: 2, stopReason: 'stop',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
  manager.appendMessage(assistant);
};
let creations = 0; let bindings = 0;
serveWorker({
  testOnly: {
    afterSessionCreated: async () => { creations++;
      if (spec.mode === 'session-create' || (spec.mode === 'replace-create' && creations === 2)) { stage(spec.mode); await pause(); }
    },
    beforeBind: async close => { bindings++;
      if (spec.mode === 'close-rebind' && bindings === 2) { const pending = close(); assert.equal(close(), pending); stage('close-rebind'); }
    },
  },
  beforeReady: async (runtime, close) => {
    assert.equal(process.env.OPENAI_API_KEY, undefined); assert.equal(process.env.NODE_OPTIONS, undefined);
    assert.equal(process.permission.has('addons'), false); assert.equal(process.permission.has('worker'), false);
    assert.throws(() => readFileSync(spec.database));
    assert.throws(() => new DatabaseSync(spec.database, { readOnly: true }), /unable to open database file/);
    assert.throws(() => new DatabaseSync(spec.database + '.worker-new'), /unable to open database file/);
    assert.throws(() => readFileSync('/etc/passwd'));
    stage('database-denied');
    if (spec.persistNative) syntheticNative(runtime);
    if (spec.mode === 'before-ready') { stage('before-ready'); await pause(); }
    if (spec.mode === 'replace-create' || spec.mode === 'close-rebind') await runtime.newSession();
    if (spec.mode === 'replace') {
      runtime.setRebindSession(async () => { stage('rebind'); await pause(); });
      await runtime.newSession();
    }
    if (spec.mode === 'close-create') { const first = close(); assert.equal(close(), first); stage('close-create'); }
    if (spec.mode === 'restore') assert.ok(runtime.session.messages.some(m => m.role === 'user'));
  },
  afterGrant: async signal => {
    stage('claimed');
    if (spec.mode === 'descendants') {
      spawn(process.execPath, [join(import.meta.dirname, 'descendant-fixture.mjs'), 'fixed-parent'], { stdio: 'ignore' });
      while (!existsSync(join(process.cwd(), 'port-denied')) || !existsSync(join(process.cwd(), 'fixed-child.heartbeat'))) await new Promise<void>(r => setTimeout(r, 20));
      stage('descendants'); await pause();
    }
    if (spec.mode === 'claimed' || spec.mode === 'cancel') {
      if (spec.mode === 'claimed') await pause();
      else await new Promise<void>((_, reject) => { signal.addEventListener('abort', () => reject(new Error('SYNTHETIC active cancel')), { once: true }); });
    }
  },
  execute: async (runtime, signal) => {
    const tool = runtime.session.agent.state.tools.find(t => t.name === spec.tool); assert.ok(tool);
    const prepared: unknown = tool.prepareArguments?.(spec.args) ?? spec.args;
    assert.ok(prepared && typeof prepared === 'object' && !Array.isArray(prepared));
    const call: ToolCall = { type: 'toolCall', id: 'SYNTHETIC-b-ipc-tool', name: spec.tool, arguments: Object.fromEntries(Object.entries(prepared)) };
    await tool.execute(call.id, validateToolArguments(tool, call), signal);
    assert.ok(existsSync(join(process.cwd(), String(spec.args.path)))); stage('written');
    if (spec.mode === 'written') await pause();
  },
});
