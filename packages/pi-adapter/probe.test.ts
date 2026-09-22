import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as pi from '@earendil-works/pi-coding-agent';
import * as ai from '@earendil-works/pi-ai';
import { SessionManager, type AgentSessionEvent, type CreateAgentSessionRuntimeFactory } from '@earendil-works/pi-coding-agent';
import { createProbeRuntime, ProbeBinding, type Observation } from './probe.ts';

const root = process.env.PI_PROBE_ROOT;
assert.ok(root, 'Run through npm run test:pi-probe to enforce isolation');
assert.equal(process.permission.has('child'), false);
assert.equal(process.env.PI_OFFLINE, '1');

function paths() {
  const dir = mkdtempSync(join(root!, 'case-'));
  const cwd = join(dir, 'workspace');
  const agentDir = join(dir, 'agent');
  const sessions = join(dir, 'sessions');
  for (const path of [cwd, agentDir, sessions]) mkdirSync(path);
  return { dir, cwd, agentDir, sessions };
}

function syntheticRecords(manager: SessionManager) {
  manager.appendCustomEntry('synthetic-a1-probe', { synthetic: true, modelInvoked: false });
  const user = manager.appendMessage({ role: 'user', content: '[SYNTHETIC] Persistence input', timestamp: 1 });
  // Pi defers the initial disk write until an assistant record. This is authored
  // test data via the public API, NOT a model response or an event-stream fixture.
  const assistant: ai.AssistantMessage = {
    role: 'assistant', content: [{ type: 'text', text: '[SYNTHETIC] Persistence response; no model was invoked' }],
    api: 'openai-responses', provider: 'synthetic-a1', model: 'synthetic-a1',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'stop', timestamp: 2,
  };
  manager.appendMessage(assistant);
  return user;
}

async function open(p = paths(), persisted = false, extra: {
  factory?: CreateAgentSessionRuntimeFactory;
  afterSubscribe?: (callback: (event: AgentSessionEvent) => void) => void;
} = {}) {
  const observations: Observation[] = [];
  const manager = persisted ? SessionManager.create(p.cwd, p.sessions) : SessionManager.inMemory(p.cwd);
  const host = await ProbeBinding.create({ ...p, sessionManager: manager,
    observe: event => observations.push(event), ...extra });
  return { p, host, observations, manager };
}

test('release-imports: root runtime exports and type-only names are distinct', () => {
  assert.equal(pi.VERSION, '0.87.0');
  for (const name of ['createAgentSession', 'SessionManager', 'AgentSession', 'AgentSessionRuntime',
    'createAgentSessionRuntime', 'createExtensionRuntime', 'SettingsManager', 'ModelRuntime']) {
    assert.equal(typeof Reflect.get(pi, name), 'function', name);
  }
  for (const name of ['ResourceLoader', 'AgentSessionEvent', 'AgentSessionServices', 'CreateAgentSessionRuntimeFactory']) {
    assert.equal(Object.hasOwn(pi, name), false, `${name} is a declaration, not a runtime export`);
  }
  assert.equal(typeof ai.InMemoryCredentialStore, 'function');
  assert.equal(typeof ai.InMemoryModelsStore, 'function');
  assert.equal(Object.hasOwn(ai, 'CredentialStore'), false);
  for (const method of ['create', 'open', 'inMemory']) assert.equal(typeof Reflect.get(SessionManager, method), 'function');
  assert.equal(Object.hasOwn(pi, 'appendMessage'), false, 'class methods are not root exports');
  for (const path of ['client', 'experimental/plugin']) {
    assert.throws(() => import.meta.resolve(`@earendil-works/pi-coding-agent/${path}`),
      { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  }
});

test('isolated-minimal-session: empty resources/tools/settings/credentials; no discovery', async () => {
  const p = paths();
  const marker = join(p.dir, 'UNAPPROVED_EXECUTED');
  const globalDir = process.env.PI_CODING_AGENT_DIR!;
  // Approved synthetic poison files only; never inspect a real user configuration.
  for (const dir of [globalDir, p.agentDir, join(p.cwd, '.pi'), join(p.dir, '.pi')]) {
    mkdirSync(join(dir, 'extensions'), { recursive: true });
    writeFileSync(join(dir, 'extensions', 'unapproved.ts'),
      `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'UNAPPROVED'); export default () => {};`);
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ defaultProvider: 'poison', defaultTools: ['bash'],
      packages: ['npm:synthetic-missing-package@0.0.0'], extensions: ['./extensions/unapproved.ts'] }));
    writeFileSync(join(dir, 'auth.json'), 'SYNTHETIC INVALID AUTH FILE: MUST NOT READ');
    writeFileSync(join(dir, 'models.json'), 'SYNTHETIC INVALID MODEL CONFIG: MUST NOT READ');
    writeFileSync(join(dir, 'AGENTS.md'), 'SYNTHETIC POISON CONTEXT');
  }
  const { host } = await open(p);
  try {
    const { session, services } = host.runtime;
    assert.deepEqual(session.getActiveToolNames(), []);
    assert.deepEqual(services.settingsManager.getGlobalSettings(), {});
    assert.deepEqual(services.settingsManager.getProjectSettings(), {});
    assert.deepEqual(await services.modelRuntime.listCredentials(), []);
    // pi-agent-core uses an explicit unknown sentinel when no model is selected.
    assert.equal(session.model?.id, 'unknown');
    assert.equal(session.model?.provider, 'unknown');
    assert.equal(session.model?.api, 'unknown');
    assert.deepEqual(services.modelRuntime.getAvailableSnapshot(), []);
    assert.deepEqual(services.resourceLoader.getExtensions().extensions, []);
    assert.deepEqual(services.resourceLoader.getSkills().skills, []);
    assert.deepEqual(services.resourceLoader.getPrompts().prompts, []);
    assert.deepEqual(services.resourceLoader.getAgentsFiles().agentsFiles, []);
    assert.equal(session.systemPrompt.includes('SYNTHETIC POISON'), false);
    await services.settingsManager.flush();
    assert.deepEqual(services.settingsManager.drainErrors(), []);
    assert.equal(existsSync(marker), false);
    assert.equal(readFileSync(join(p.agentDir, 'auth.json'), 'utf8'), 'SYNTHETIC INVALID AUTH FILE: MUST NOT READ');
  } finally { await host.close(); }
});

test('native-memory-roundtrip: snapshot, dispose, reopen through public inMemory entries', async () => {
  const { host, manager, p } = await open();
  syntheticRecords(manager);
  host.runtime.session.refreshContext();
  const before = structuredClone(manager.getEntries());
  const messages = structuredClone(host.runtime.session.messages);
  const header = manager.getHeader();
  assert.ok(header);
  assert.equal(manager.getSessionFile(), undefined);
  await host.close();
  const restored = SessionManager.inMemory(p.cwd, { id: header.id }, [header, ...before]);
  const reopened = await createProbeRuntime({ ...p, sessionManager: restored });
  try {
    assert.deepEqual(restored.getEntries(), before);
    assert.deepEqual(reopened.session.messages, messages);
    assert.equal(restored.getSessionId(), header.id);
    assert.equal(restored.isPersisted(), false);
  } finally { reopened.session.dispose(); }
});

test('native-disk-roundtrip: Pi writes JSONL; dispose/open preserves entries and context', async () => {
  const { host, manager, p } = await open(paths(), true);
  await host.appendSynthetic(host.bindingId!, 'SYNTHETIC pre-assistant record');
  const path = manager.getSessionFile();
  assert.ok(path);
  assert.equal(existsSync(path), false, 'Pi has no public eager flush for a new custom-only session');
  syntheticRecords(manager);
  await host.appendSynthetic(host.bindingId!, 'SYNTHETIC saved custom message');
  assert.equal(existsSync(path), true);
  const bytes = readFileSync(path);
  const entries = structuredClone(manager.getEntries());
  const messages = structuredClone(host.runtime.session.messages);
  await host.close();
  const restored = SessionManager.open(path, p.sessions);
  const reopened = await createProbeRuntime({ ...p, sessionManager: restored });
  try {
    assert.deepEqual(restored.getEntries(), entries);
    assert.deepEqual(reopened.session.messages, messages);
    assert.equal(restored.getSessionId(), manager.getSessionId());
    assert.deepEqual(readFileSync(path), bytes, 'reopen must not rewrite the native file');
  } finally { reopened.session.dispose(); }
});

test('subscriptions: exact callbacks, repeated unsubscribe, close detaches and drops queued delivery', async () => {
  const callbacks: Array<(event: AgentSessionEvent) => void> = [];
  const { host, observations } = await open(paths(), false, { afterSubscribe: cb => callbacks.push(cb) });
  let count = 0;
  const unsubscribe = host.runtime.session.subscribe(() => count++);
  await host.appendSynthetic(host.bindingId!, 'SYNTHETIC first');
  assert.equal(count, 2);
  assert.deepEqual(observations.map(x => x.event.type), ['message_start', 'message_end']);
  unsubscribe(); unsubscribe();
  await host.appendSynthetic(host.bindingId!, 'SYNTHETIC second');
  assert.equal(count, 2);
  assert.equal(observations.length, 4);
  const bindingId = host.bindingId!;
  await host.close(); await host.close();
  callbacks[0](observations[0].event); // Explicit synthetic delayed delivery of a captured real SDK event.
  assert.equal(observations.length, 4);
  await assert.rejects(host.appendSynthetic(bindingId, 'SYNTHETIC stale'), /session_unavailable/);
});

test('binding-session-replacement: new/fork/switch rebind once; old callbacks cannot cross identity', async () => {
  const callbacks: Array<(event: AgentSessionEvent) => void> = [];
  const { host, observations, manager } = await open(paths(), true, { afterSubscribe: cb => callbacks.push(cb) });
  try {
    const user = syntheticRecords(manager);
    const original = manager.getSessionFile()!;
    const old = host.runtime.session;
    const ids = new Set([host.bindingId]);
    await host.appendSynthetic(host.bindingId!, 'SYNTHETIC before fork');
    const captured = observations[0].event;
    const oldId = host.bindingId!;
    await host.fork(user);
    assert.notEqual(host.runtime.session, old);
    assert.notEqual(host.runtime.session.sessionFile, original);
    assert.equal(host.runtime.session.sessionManager.getHeader()?.parentSession, original);
    assert.ok(host.runtime.session.sessionManager.getEntry(user));
    ids.add(host.bindingId);
    callbacks[0](captured);
    assert.equal(observations.length, 2);
    await assert.rejects(host.appendSynthetic(oldId, 'SYNTHETIC stale'), /session_unavailable/);
    await host.appendSynthetic(host.bindingId!, 'SYNTHETIC fork');
    assert.equal(observations.length, 4);
    await host.newSession();
    ids.add(host.bindingId);
    await host.appendSynthetic(host.bindingId!, 'SYNTHETIC new');
    assert.equal(observations.length, 6);
    await host.switchSession(original);
    ids.add(host.bindingId);
    await host.appendSynthetic(host.bindingId!, 'SYNTHETIC resumed');
    assert.equal(observations.length, 8);
    assert.equal(ids.size, 4, 'fresh identity even when returning to an old native session');
    assert.equal(callbacks.length, 4);
    for (const callback of callbacks.slice(0, -1)) callback(captured);
    assert.equal(observations.length, 8);
    assert.equal(observations.at(-1)?.bindingId, host.bindingId);
  } finally { await host.close(); }
});

test('replacement-precheck-failure: invalid fork keeps old live binding', async () => {
  const { host, observations } = await open();
  try {
    const old = host.runtime.session;
    const id = host.bindingId!;
    await assert.rejects(host.fork('SYNTHETIC_MISSING_ENTRY'), /Invalid entry ID/);
    assert.equal(host.available, true);
    assert.equal(host.bindingId, id);
    assert.equal(host.runtime.session, old);
    await host.appendSynthetic(id, 'SYNTHETIC still live');
    assert.equal(observations.length, 2);
  } finally { await host.close(); }
});

test('replacement-factory-failure: no fallback to disposed old object; recover using native reference', async () => {
  let calls = 0;
  const factory: CreateAgentSessionRuntimeFactory = async options => {
    if (++calls === 2) throw new Error('SYNTHETIC_FACTORY_FAILURE');
    return createProbeRuntime(options);
  };
  const { host, manager, p, observations } = await open(paths(), true, { factory });
  syntheticRecords(manager);
  const id = host.bindingId!;
  const original = manager.getSessionFile()!;
  const old = host.runtime.session;
  await assert.rejects(host.newSession(), /SYNTHETIC_FACTORY_FAILURE/);
  assert.equal(host.available, false);
  assert.equal(host.bindingId, undefined);
  // Upstream still exposes this disposed object. Our boundary must never reuse it.
  assert.equal(host.runtime.session, old);
  assert.equal(host.lastNativeSessionFile, original);
  await assert.rejects(host.appendSynthetic(id, 'SYNTHETIC rejected'), /session_unavailable/);
  assert.equal(observations.length, 0);
  await host.close();
  const restored = SessionManager.open(original, p.sessions);
  const recovered = await ProbeBinding.create({ ...p, sessionManager: restored, observe: () => {} });
  try {
    assert.notEqual(recovered.bindingId, id);
    assert.deepEqual(restored.getEntries(), manager.getEntries());
    await recovered.appendSynthetic(recovered.bindingId!, 'SYNTHETIC recovered');
  } finally { await recovered.close(); }
});

test('replacement-rebind-failure: partial subscription cleaned; incomplete new instance blocked', async () => {
  const callbacks: Array<(event: AgentSessionEvent) => void> = [];
  const { host, observations } = await open(paths(), false, { afterSubscribe: callback => {
    callbacks.push(callback);
    if (callbacks.length === 2) throw new Error('SYNTHETIC_REBIND_FAILURE');
  } });
  const old = host.runtime.session;
  const id = host.bindingId!;
  await host.appendSynthetic(id, 'SYNTHETIC prior event');
  await assert.rejects(host.newSession(), /SYNTHETIC_REBIND_FAILURE/);
  assert.notEqual(host.runtime.session, old);
  assert.equal(host.available, false);
  assert.equal(host.bindingId, undefined);
  for (const callback of callbacks) callback(observations[0].event);
  assert.equal(observations.length, 2);
  await assert.rejects(host.appendSynthetic(id, 'SYNTHETIC rejected'), /session_unavailable/);
  await host.close();
});

test('repeat-lifecycle: repeated create/replace/close leaves no probe timers or callbacks', async () => {
  const before = process.getActiveResourcesInfo().filter(x => /Timeout|TCP|UDP|Process|Worker/.test(x));
  for (let i = 0; i < 3; i++) {
    const { host, observations } = await open();
    await host.appendSynthetic(host.bindingId!, 'SYNTHETIC lifecycle');
    await host.newSession();
    await host.appendSynthetic(host.bindingId!, 'SYNTHETIC replacement');
    await host.close();
    assert.equal(observations.length, 4);
  }
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(process.getActiveResourcesInfo().filter(x => /Timeout|TCP|UDP|Process|Worker/.test(x)), before);
  // No idle abort assertion: running model cancellation is deliberately untested.
});
