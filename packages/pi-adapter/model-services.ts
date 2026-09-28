import { InMemoryCredentialStore, InMemoryModelsStore, type Provider, type FetchFunction } from '@earendil-works/pi-ai';
import { ModelRuntime, SettingsManager } from '@earendil-works/pi-coding-agent';
import { explicitEmptyResources } from './session-services.ts';
import type { ModelSelection, ModelOutcome } from '../app-contracts/model.ts';
import type { AgentSession } from '@earendil-works/pi-coding-agent';

/** Public native Provider delegation only. No provider protocol or Agent loop here. */
export async function modelServices(options: { cwd: string; agentDir: string }, selection: ModelSelection,
  key: string, fetch: FetchFunction, syntheticProvider?: Provider) {
  const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsStore: new InMemoryModelsStore(), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false });
  if (syntheticProvider) runtime.registerNativeProvider(syntheticProvider);
  const provider = runtime.getProvider(selection.provider); const model = runtime.getModel(selection.provider, selection.model);
  if (!provider || !model || (selection.mode === 'live' && (!['anthropic-messages'].includes(model.api) || model.baseUrl !== selection.endpoint))) throw new Error('model_not_supported');
  let calls = 0;
  const limits = { maxTokens: selection.maxOutputTokens, maxRetries: 0, timeoutMs: selection.timeoutMs, transport: 'sse' as const, fetch, env: {} };
  runtime.registerNativeProvider({ ...provider,
    getModels: () => [model],
    stream: () => { throw new Error('raw_model_stream_not_admitted'); },
    streamSimple: (m, c, o) => { if (++calls > 1) throw new Error('model_request_budget'); return provider.streamSimple(m, c, { ...o, ...limits }); },
  });
  await runtime.setRuntimeApiKey(selection.provider, key);
  return { model, services: { ...options, modelRuntime: runtime, settingsManager: SettingsManager.inMemory({
    retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0, timeoutMs: selection.timeoutMs } },
    compaction: { enabled: false }, cacheWarming: 'off', transport: 'sse',
  }), resourceLoader: explicitEmptyResources('You are a concise assistant. You have no tools. Never claim to have read or changed files.'), diagnostics: [] } };
}
export function modelOutcome(session: AgentSession, synthetic: boolean, cancelled: boolean): ModelOutcome {
  const last = [...session.messages].reverse().find(m => m.role === 'assistant');
  return { reason: cancelled ? 'cancelled' : last?.stopReason === 'stop' ? 'stop' : last?.stopReason === 'length' ? 'length' : 'provider_error',
    inputTokens: last ? last.usage.input + last.usage.cacheRead + last.usage.cacheWrite : 0, outputTokens: last?.usage.output ?? 0, estimatedCostUsd: last?.usage.cost.total ?? 0, synthetic };
}
