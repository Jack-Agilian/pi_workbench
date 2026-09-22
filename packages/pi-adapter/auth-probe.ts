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

/** Configuration is not token validity. checkAuth intentionally does not refresh OAuth. */
export async function readAuthView(runtime: ModelRuntime, selection: AuthSelection, signal: AbortSignal): Promise<AuthView> {
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
