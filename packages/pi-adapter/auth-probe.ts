// A4 probe only. Pi owns credential storage/serialization, auth flows and catalogs.
import { InMemoryModelsStore, type CredentialStore, type ModelsStore } from '@earendil-works/pi-ai';
import { CredentialSynchronizationError, ModelRuntime } from '@earendil-works/pi-coding-agent';

export function createAuthProbe(credentials: CredentialStore, modelsStore: ModelsStore = new InMemoryModelsStore()) {
  return ModelRuntime.create({ credentials, modelsStore, modelsPath: null,
    allowModelNetwork: false, refreshOnCreate: false });
}

/** Host-owned allowlist, never constructed from raw provider display/source/error strings. */
export interface AuthSelection {
  readonly accountId: string;
  readonly providerId: string;
  readonly models: readonly { readonly id: string; readonly providerModelId: string; readonly label: string }[];
}
export interface AuthView {
  accountId: string;
  state: 'configured' | 'unconfigured' | 'unavailable';
  method?: 'api_key' | 'oauth';
  models: { id: string; label: string; available: boolean }[];
}

const boundRuntimes = new WeakSet<ModelRuntime>();

/** M0: one fixed product account per provider in a Runtime. accountId is not a credential namespace.
 * Register the complete host allowlist once, before queries. Login/refresh/logout remain Pi-owned.
 */
export function createAuthViewReader(runtime: ModelRuntime, selections: readonly AuthSelection[]) {
  if (boundRuntimes.has(runtime)) throw new Error('auth_accounts_already_bound');
  const accounts = new Map<string, AuthSelection>();
  const providers = new Set<string>();
  for (const selection of selections) {
    if (!selection.accountId || !selection.providerId) throw new Error('invalid_auth_selection');
    if (accounts.has(selection.accountId)) throw new Error('duplicate_account_id');
    if (providers.has(selection.providerId)) throw new Error('multiple_accounts_per_provider_not_supported');
    providers.add(selection.providerId);
    accounts.set(selection.accountId, Object.freeze({ accountId: selection.accountId, providerId: selection.providerId,
      models: Object.freeze(selection.models.map(model => Object.freeze({ ...model }))) }));
  }
  boundRuntimes.add(runtime);
  return async (accountId: string, signal: AbortSignal): Promise<AuthView> => {
    const selection = accounts.get(accountId);
    if (!selection) throw new Error('unknown_auth_account');
    return readAuthView(runtime, selection, signal);
  };
}

/** Configuration is not token validity. checkAuth intentionally does not refresh OAuth. */
async function readAuthView(runtime: ModelRuntime, selection: AuthSelection, signal: AbortSignal): Promise<AuthView> {
  const models = selection.models.map(({ id, label }) => ({ id, label, available: false }));
  try {
    const check = await runtime.checkAuth(selection.providerId, { signal });
    if (!check) return { accountId: selection.accountId, state: 'unconfigured', models };
    const method = check.type === 'api_key' ? 'api_key' : check.type === 'oauth' ? 'oauth' : undefined;
    if (!method) throw new Error('Unsupported auth status');
    const available = await runtime.getAvailable(selection.providerId, { signal });
    return { accountId: selection.accountId, state: 'configured', method,
      models: models.map((model, index) => ({ ...model, available: available.some(candidate =>
        candidate.provider === selection.providerId && candidate.id === selection.models[index]!.providerModelId) })) };
  } catch {
    // Error.message/cause, AuthCheck.source and model/provider metadata may contain secrets.
    return { accountId: selection.accountId, state: 'unavailable', models };
  }
}

export type AuthChange = 'synchronized' | 'committed_needs_sync' | 'unknown';

/** No retry, persistence or OAuth implementation here; only a safe result projection. */
export async function projectAuthChange(change: () => Promise<unknown>): Promise<AuthChange> {
  try {
    await change();
    return 'synchronized';
  } catch (error) {
    // A store may commit and then reject. Other errors/aborts do not prove rollback.
    return error instanceof CredentialSynchronizationError ? 'committed_needs_sync' : 'unknown';
  }
}
