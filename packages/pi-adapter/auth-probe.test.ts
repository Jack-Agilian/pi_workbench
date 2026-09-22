import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import * as ai from '@earendil-works/pi-ai';
import * as pi from '@earendil-works/pi-coding-agent';
import { createAuthProbe, projectAuthChange, createAuthViewReader, type AuthSelection } from './auth-probe.ts';
import { createProbeServices } from './probe.ts';

const root = process.env.PI_PROBE_ROOT;
assert.ok(root, 'Use npm run test:pi-auth');
assert.equal(process.permission.has('child'), false);
assert.equal(process.permission.has('addons'), false);
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'AWS_ACCESS_KEY_ID', 'GOOGLE_APPLICATION_CREDENTIALS']) {
  assert.equal(Object.hasOwn(process.env, key), false, 'Provider environment must be absent');
}
const secret = () => `A4_SYNTHETIC_SECRET_${randomUUID()}`;
const signal = () => AbortSignal.timeout(5_000);
function gate() {
  let open!: () => void;
  const promise = new Promise<void>(resolve => { open = resolve; });
  return { promise, open };
}
const probe = (name: string, body: () => Promise<void> | void) => test(name, { timeout: 10_000 }, body);
const counts: { stream: number }[] = [];
afterEach(() => { for (const count of counts) assert.equal(count.stream, 0, 'No model stream may execute'); });

/** Approved synthetic provider: auth methods only return test data, never implement an OAuth protocol. */
async function fixture(store: ai.CredentialStore = new ai.InMemoryCredentialStore()) {
  const providerId = `synthetic-a4-${randomUUID()}`;
  const value = secret();
  const calls = { login: 0, refresh: 0, resolve: 0, stream: 0, catalog: 0 };
  counts.push(calls);
  const state = { catalogFailure: false, checkFailure: false, refreshFailure: false };
  const model: ai.Model<'openai-completions'> = { id: value, provider: providerId,
    name: value, api: 'openai-completions', baseUrl: `https://example.invalid/${value}`,
    headers: { Authorization: value }, reasoning: false, input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1024, maxTokens: 128 };
  let catalog: readonly ai.Model<ai.Api>[] = [model];
  const oauth = (access = value, expires = Date.now() + 3_600_000): ai.OAuthCredential =>
    ({ type: 'oauth', access, refresh: secret(), expires });
  const provider: ai.Provider = {
    id: providerId, name: value, baseUrl: `https://example.invalid/${value}`, headers: { Authorization: value },
    auth: {
      apiKey: {
        name: value,
        login: async interaction => { calls.login++; return { type: 'api_key', key: await interaction.prompt({ type: 'secret', message: 'SYNTHETIC key' }) }; },
        check: async ({ credential }) => {
          if (state.checkFailure) throw new Error(value);
          return credential?.key ? { type: 'api_key', source: value } : undefined;
        },
        resolve: async ({ credential }) => { calls.resolve++; return credential?.key ? { auth: { apiKey: credential.key }, source: value } : undefined; },
      },
      oauth: {
        name: value,
        login: async () => { calls.login++; return oauth(); },
        refresh: async () => { calls.refresh++; if (state.refreshFailure) throw new Error(value); return oauth(); },
        toAuth: async credential => ({ apiKey: credential.access, headers: { Authorization: credential.access } }),
      },
    },
    getModels: () => catalog,
    refreshModels: async context => {
      calls.catalog++;
      assert.equal(context.allowNetwork, false, 'Catalog refresh must be explicitly offline');
      if (state.catalogFailure) throw new Error(value);
      if (context.stored) await context.publish({ update: () => { catalog = context.stored!.models; } });
    },
    stream: () => { calls.stream++; throw new Error('SYNTHETIC forbidden stream'); },
    streamSimple: () => { calls.stream++; throw new Error('SYNTHETIC forbidden stream'); },
  };
  const modelsStore = new ai.InMemoryModelsStore();
  const runtime = await createAuthProbe(store, modelsStore);
  runtime.registerNativeProvider(provider);
  const refreshed = await runtime.refresh({ providers: [providerId], allowNetwork: false, signal: signal() });
  assert.equal(refreshed.aborted, false);
  assert.equal(refreshed.errors.size, 0);
  const selection: AuthSelection = { accountId: 'synthetic-account', providerId,
    models: [{ id: 'synthetic-model', providerModelId: model.id, label: 'Synthetic model (no inference)' }] };
  const interaction = { signal: signal(), prompt: async () => value, notify: () => {} };
  const read = createAuthViewReader(runtime, [selection]);
  return { runtime, provider, providerId, store, modelsStore, model, value, state, calls, oauth, selection, interaction, read };
}

probe('A4 public release exports, type-only interfaces and class methods remain distinct', async () => {
  for (const name of ['ModelRuntime', 'CredentialSynchronizationError']) assert.equal(typeof Reflect.get(pi, name), 'function');
  for (const name of ['InMemoryCredentialStore', 'InMemoryModelsStore']) assert.equal(typeof Reflect.get(ai, name), 'function');
  for (const name of ['CredentialStore', 'Credential', 'Provider', 'AuthCheck', 'ModelsStore']) assert.equal(Object.hasOwn(ai, name), false);
  for (const name of ['login', 'logout', 'checkAuth', 'getAuth', 'registerNativeProvider', 'refresh']) {
    assert.equal(typeof Reflect.get(pi.ModelRuntime.prototype, name), 'function');
    assert.equal(Object.hasOwn(pi, name), false);
  }
  // Absence is a documented lifecycle gap, not an implemented flush test.
  for (const name of ['flush', 'dispose', 'close']) assert.equal(Reflect.get(pi.ModelRuntime.prototype, name), undefined);
});

probe('injected stores ignore synthetic auth/models files; empty store does not acquire credentials', async () => {
  const agentDir = process.env.PI_CODING_AGENT_DIR!;
  const sentinel = secret();
  const paths = ['auth.json', 'models.json', 'models-store.json'].map(name => join(agentDir, name));
  for (const path of paths) writeFileSync(path, sentinel); // Invalid JSON: reading would fail.
  const store = new ai.InMemoryCredentialStore();
  const runtime = await createAuthProbe(store);
  assert.deepEqual(await runtime.listCredentials({ signal: signal() }), []);
  assert.equal(await runtime.checkAuth('anthropic', { signal: signal() }), undefined);
  assert.ok(runtime.getModels('anthropic').length > 0, 'Built-in catalog is available offline');
  assert.equal((await runtime.getAvailable('anthropic', { signal: signal() })).length, 0);
  for (const path of paths) assert.ok(readFileSync(path, 'utf8') === sentinel, 'Synthetic configuration remains untouched');
});

probe('API-key login, runtime override, removal and logout reuse Pi; DTO excludes raw metadata', async () => {
  const f = await fixture();
  assert.equal((await f.read(f.selection.accountId, signal())).state, 'unconfigured');
  assert.equal(await projectAuthChange(() => f.runtime.login(f.providerId, 'api_key', f.interaction)), 'synchronized');
  assert.equal(f.calls.login, 1);
  const view = await f.read(f.selection.accountId, signal());
  assert.deepEqual(view, { accountId: 'synthetic-account', state: 'configured', method: 'api_key',
    models: [{ id: 'synthetic-model', label: 'Synthetic model (no inference)', available: true }] });
  assert.equal(JSON.stringify(view).includes('A4_SYNTHETIC_SECRET_'), false);
  f.state.checkFailure = true;
  assert.equal((await f.read(f.selection.accountId, signal())).state, 'unavailable');
  f.state.checkFailure = false;
  assert.deepEqual(await f.runtime.listCredentials(), [{ providerId: f.providerId, type: 'api_key' }]);
  const override = secret();
  await f.runtime.setRuntimeApiKey(f.providerId, override, { signal: signal() });
  assert.ok((await f.runtime.getAuth(f.providerId))?.auth.apiKey === override, 'Runtime override wins');
  const stored = await f.store.read(f.providerId);
  assert.ok(stored?.type === 'api_key' && stored.key === f.value, 'Runtime override never overwrites injected store');
  await f.runtime.removeRuntimeApiKey(f.providerId, { signal: signal() });
  assert.ok((await f.runtime.getAuth(f.providerId))?.auth.apiKey === f.value, 'Removing override restores stored value');
  await f.runtime.setRuntimeApiKey(f.providerId, override);
  await f.runtime.logout(f.providerId, { signal: signal() });
  assert.equal(await f.runtime.getAuth(f.providerId), undefined, 'Logout clears both store and runtime override');
  assert.deepEqual(await f.runtime.listCredentials(), []);
  assert.equal(f.runtime.getAvailableSnapshot().some(model => model.provider === f.providerId), false);
});

probe('configured status does not refresh expired OAuth; concurrent auth resolution refreshes once', async () => {
  const f = await fixture();
  const expired = f.oauth(secret(), 0);
  await f.store.modify(f.providerId, async () => expired);
  const started = gate(); const release = gate();
  f.provider.auth.oauth!.refresh = async () => { f.calls.refresh++; started.open(); await release.promise; return f.oauth(); };
  const before = await f.read(f.selection.accountId, signal());
  assert.equal(before.state, 'configured');
  assert.equal(before.method, 'oauth');
  assert.equal(f.calls.refresh, 0, 'Display must not refresh tokens');
  const requests = Array.from({ length: 8 }, () => f.runtime.getAuth(f.providerId, { signal: signal() }));
  await started.promise;
  release.open();
  const results = await Promise.all(requests);
  assert.equal(f.calls.refresh, 1, 'Pi store lock and expiry recheck prevent duplicate rotation');
  assert.ok(results.every(result => result?.auth.apiKey === f.value), 'All callers use the persisted rotation');
  assert.equal(f.calls.resolve, 0, 'Stored OAuth does not fall back to API keys');
});

for (const operation of ['login', 'logout'] as const) probe(`concurrent refresh then ${operation} cannot restore stale credentials`, async () => {
  const f = await fixture();
  await f.store.modify(f.providerId, async () => f.oauth(secret(), 0));
  const started = gate(); const release = gate(); const loginStarted = gate();
  const replacement = f.oauth(secret());
  f.provider.auth.oauth!.refresh = async () => { started.open(); await release.promise; return f.oauth(); };
  f.provider.auth.oauth!.login = async () => { loginStarted.open(); return replacement; };
  const resolving = f.runtime.getAuth(f.providerId, { signal: signal() });
  await started.promise;
  const changing = operation === 'login' ? f.runtime.login(f.providerId, 'oauth', f.interaction)
    : f.runtime.logout(f.providerId, { signal: signal() });
  if (operation === 'login') await loginStarted.promise;
  release.open();
  await Promise.all([resolving, changing]);
  const final = await f.store.read(f.providerId);
  assert.ok(operation === 'login' ? final === replacement : final === undefined, 'New login/logout wins over older refresh');
});

probe('refresh failure preserves credentials; SDK message/cause are unsafe to forward', async () => {
  const f = await fixture();
  const expired = f.oauth(secret(), 0);
  await f.store.modify(f.providerId, async () => expired);
  f.state.refreshFailure = true;
  await assert.rejects(f.runtime.getAuth(f.providerId, { signal: signal() }), error => {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes(f.value), 'Actual SDK error contains synthetic sensitive cause');
    return true;
  });
  assert.ok(await f.store.read(f.providerId) === expired, 'Failure preserves stored credential for explicit recovery');
  assert.equal(await projectAuthChange(() => f.runtime.getAuth(f.providerId, { signal: signal() })), 'unknown');
  assert.equal(f.calls.resolve, 0, 'No silent API key fallback');
});

probe('active refresh abort rejects promptly but retains lock until synthetic callback settles', async () => {
  const f = await fixture();
  const expired = f.oauth(secret(), 0);
  await f.store.modify(f.providerId, async () => expired);
  const started = gate(); const release = gate();
  f.provider.auth.oauth!.refresh = async () => { started.open(); await release.promise; return f.oauth(); };
  const abort = new AbortController();
  const resolving = projectAuthChange(() => f.runtime.getAuth(f.providerId, { signal: abort.signal }));
  await started.promise;
  abort.abort(new Error(f.value));
  assert.equal(await resolving, 'unknown');
  assert.ok(await f.store.read(f.providerId) === expired);
  let loggedOut = false;
  const logout = f.runtime.logout(f.providerId, { signal: signal() }).then(() => { loggedOut = true; });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(loggedOut, false, 'Abort is not proof the backing operation has settled');
  release.open(); await logout;
  assert.equal(await f.store.read(f.providerId), undefined, 'Late callback cannot resurrect credentials');
});

probe('active and queued login cancellation: late synthetic prompt cannot persist or run queued login', async () => {
  const f = await fixture(); const started = gate(); const release = gate();
  const abort = new AbortController(); const queuedAbort = new AbortController();
  const active = projectAuthChange(() => f.runtime.login(f.providerId, 'api_key', {
    signal: abort.signal, notify: () => {}, prompt: async () => { started.open(); await release.promise; return f.value; },
  }));
  await started.promise;
  const queued = projectAuthChange(() => f.runtime.login(f.providerId, 'api_key', { ...f.interaction, signal: queuedAbort.signal }));
  queuedAbort.abort(); abort.abort();
  assert.deepEqual(await Promise.all([active, queued]), ['unknown', 'unknown']);
  release.open();
  await f.runtime.logout(f.providerId, { signal: signal() });
  assert.equal(f.calls.login, 1);
  assert.equal(await f.store.read(f.providerId), undefined);
  assert.equal(await projectAuthChange(() => f.runtime.login(f.providerId, 'api_key', f.interaction)), 'synchronized');
  assert.equal(f.calls.login, 2, 'Queue remains usable after cancellation');
});

for (const operation of ['login', 'logout', 'setRuntimeApiKey', 'removeRuntimeApiKey'] as const) {
  probe(`post-commit ${operation} synchronization failure is explicit, redacted and never retried`, async () => {
    const f = await fixture();
    if (operation === 'logout') await f.runtime.login(f.providerId, 'api_key', f.interaction);
    if (operation === 'removeRuntimeApiKey') await f.runtime.setRuntimeApiKey(f.providerId, f.value);
    f.state.catalogFailure = true;
    let mutations = 0;
    const result = await projectAuthChange(async () => {
      mutations++;
      try {
        if (operation === 'login') return await f.runtime.login(f.providerId, 'api_key', f.interaction);
        if (operation === 'logout') return await f.runtime.logout(f.providerId, { signal: signal() });
        if (operation === 'setRuntimeApiKey') return await f.runtime.setRuntimeApiKey(f.providerId, f.value, { signal: signal() });
        return await f.runtime.removeRuntimeApiKey(f.providerId, { signal: signal() });
      } catch (error) {
        assert.ok(error instanceof pi.CredentialSynchronizationError);
        assert.equal(error.operation, operation);
        if (operation === 'login' || operation === 'setRuntimeApiKey') {
          assert.ok(error.credential?.type === 'api_key' && error.credential.key === f.value, 'Exception itself carries the credential');
        }
        throw error;
      }
    });
    assert.equal(result, 'committed_needs_sync');
    assert.equal(mutations, 1);
    const auth = await f.runtime.checkAuth(f.providerId);
    assert.equal(Boolean(auth), operation === 'login' || operation === 'setRuntimeApiKey', 'Mutation committed despite rejection');
    f.state.catalogFailure = false;
    const recovery = await f.runtime.refresh({ providers: [f.providerId], allowNetwork: false, signal: signal() });
    assert.equal(recovery.errors.size, 0);
    assert.equal(f.runtime.getAvailableSnapshot().some(model => model.provider === f.providerId), Boolean(auth));
    assert.equal(mutations, 1, 'Recovery synchronizes the catalog, not the mutation');
  });
}

probe('store rejection before or after write is unknown; safe status projection drops errors', async () => {
  for (const afterCommit of [false, true]) {
    const backing = new ai.InMemoryCredentialStore();
    const marker = secret();
    let failRead = false;
    const store: ai.CredentialStore = {
      read: (id, options) => failRead ? Promise.reject(new Error(marker)) : backing.read(id, options),
      list: options => backing.list(options),
      delete: (id, options) => backing.delete(id, options),
      modify: async (id, fn, options) => {
        if (afterCommit) await backing.modify(id, fn, options);
        throw new Error(marker);
      },
    };
    const f = await fixture(store);
    assert.equal(await projectAuthChange(() => f.runtime.login(f.providerId, 'api_key', f.interaction)), 'unknown');
    assert.equal(Boolean(await backing.read(f.providerId)), afterCommit, 'Error alone cannot prove persistence outcome');
    failRead = true;
    const view = await f.read(f.selection.accountId, signal());
    assert.equal(view.state, 'unavailable');
    assert.equal(view.models[0]!.available, false);
    assert.equal(JSON.stringify(view).includes('A4_SYNTHETIC_SECRET_'), false);
  }
});

probe('offline catalog cache and Session model selection use public APIs without inference or credential persistence', async () => {
  const f = await fixture();
  await f.runtime.login(f.providerId, 'api_key', f.interaction);
  const cached = { ...f.model, id: 'synthetic-cached-model' };
  await f.modelsStore.write(f.providerId, { models: [cached], checkedAt: 1 });
  const refreshed = await f.runtime.refresh({ providers: [f.providerId], allowNetwork: false, signal: signal() });
  assert.equal(refreshed.errors.size, 0);
  assert.equal(f.runtime.getModel(f.providerId, f.model.id), undefined);
  const model = f.runtime.getModel(f.providerId, cached.id);
  assert.ok(model);
  const dir = mkdtempSync(join(root!, 'auth-session-'));
  const cwd = join(dir, 'workspace'); const agentDir = join(dir, 'agent');
  mkdirSync(cwd); mkdirSync(agentDir);
  const services = await createProbeServices({ cwd, agentDir });
  const { session } = await pi.createAgentSession({ ...services, modelRuntime: f.runtime,
    sessionManager: pi.SessionManager.inMemory(cwd), model, tools: [], customTools: [], noTools: 'all', thinkingLevel: 'off' });
  try {
    assert.equal(session.model?.id, cached.id);
    assert.equal(session.messages.length, 0);
    assert.equal(session.getActiveToolNames().length, 0);
    assert.equal(session.resourceLoader.getExtensions().extensions.length, 0);
  } finally { session.dispose(); }
  assert.equal(existsSync(join(agentDir, 'auth.json')), false);
  assert.equal(existsSync(join(agentDir, 'models.json')), false);
  assert.equal(existsSync(join(agentDir, 'models-store.json')), false);
});

probe('superseded offline catalog publication cannot overwrite newer models or persisted cache', async () => {
  const f = await fixture();
  const started = gate(); const release = gate(); const settled = gate();
  let phase = 0; let oldOutcome: string | undefined;
  let catalog: readonly ai.Model<ai.Api>[] = [f.model];
  f.provider.getModels = () => catalog;
  f.provider.refreshModels = async context => {
    assert.equal(context.allowNetwork, false);
    const old = ++phase === 1;
    if (old) { started.open(); await release.promise; }
    const models = [{ ...f.model, id: old ? 'synthetic-old' : 'synthetic-new' }];
    const publication = context.publish({ persist: { models, checkedAt: old ? 1 : 2 }, update: () => { catalog = models; } });
    if (old) {
      // This release rejects an already-aborted publication, rather than returning false.
      oldOutcome = await publication.then(value => value ? 'published' : 'rejected',
        error => error instanceof Error ? error.name : 'unknown');
      settled.open();
    } else assert.equal(await publication, true);
  };
  const first = f.runtime.refresh({ providers: [f.providerId], allowNetwork: false, signal: signal() });
  await started.promise;
  const second = await f.runtime.refresh({ providers: [f.providerId], allowNetwork: false, signal: signal() });
  assert.equal(second.errors.size, 0);
  release.open(); await settled.promise; await first;
  assert.equal(oldOutcome, 'AbortError', 'Pi aborts the superseded publication');
  assert.equal(f.runtime.getModel(f.providerId, 'synthetic-old'), undefined);
  assert.ok(f.runtime.getModel(f.providerId, 'synthetic-new'));
  assert.equal((await f.modelsStore.read(f.providerId))?.models[0]?.id, 'synthetic-new');
});

probe('M0 account allowlist rejects provider/account aliases before reading credentials', async () => {
  const runtime = await createAuthProbe(new ai.InMemoryCredentialStore());
  const a = { accountId: 'synthetic-account-a', providerId: 'synthetic-provider-a', models: [] };
  const b = { ...a, accountId: 'synthetic-account-b' };
  let checks = 0;
  const check = runtime.checkAuth.bind(runtime);
  runtime.checkAuth = async (...args) => { checks++; return check(...args); };
  assert.throws(() => createAuthViewReader(runtime, [a, b]), /multiple_accounts_per_provider_not_supported/);
  assert.throws(() => createAuthViewReader(runtime, [a, { ...a, providerId: 'synthetic-provider-b' }]), /duplicate_account_id/);
  const read = createAuthViewReader(runtime, [a]); // Invalid configuration must not consume the registry.
  assert.throws(() => createAuthViewReader(runtime, [b]), /auth_accounts_already_bound/);
  await assert.rejects(read(b.accountId, signal()), /unknown_auth_account/);
  assert.equal(checks, 0, 'Rejected aliases must not query any provider or credential');
});

probe('M0 fixed account selection survives caller mutation; Pi login/logout stay scoped to that provider', async () => {
  const f = await fixture();
  // A separate sterile Runtime for this explicit host configuration, using the approved synthetic provider.
  const runtime = await createAuthProbe(new ai.InMemoryCredentialStore());
  runtime.registerNativeProvider(f.provider);
  const configured = { accountId: 'synthetic-account-a', providerId: f.providerId,
    models: [{ id: 'safe-id', providerModelId: f.model.id, label: 'Synthetic safe label' }] };
  const read = createAuthViewReader(runtime, [configured]);
  configured.accountId = 'synthetic-account-b'; configured.providerId = 'synthetic-unapproved';
  configured.models[0].label = 'MUTATED'; configured.models.length = 0;
  assert.equal((await read('synthetic-account-a', signal())).state, 'unconfigured');
  await runtime.login(f.providerId, 'api_key', f.interaction);
  const view = await read('synthetic-account-a', signal());
  assert.equal(view.accountId, 'synthetic-account-a');
  assert.equal(view.state, 'configured');
  assert.equal(view.models[0].label, 'Synthetic safe label');
  await assert.rejects(read('synthetic-account-b', signal()), /unknown_auth_account/);
  await runtime.logout(f.providerId, { signal: signal() });
  assert.equal((await read('synthetic-account-a', signal())).state, 'unconfigured');
  assert.throws(() => createAuthViewReader(runtime, [configured]), /auth_accounts_already_bound/,
    'Logout clears credentials, not the fixed product identity; rebinding is not supported');
});
