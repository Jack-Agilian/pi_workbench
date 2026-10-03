import { safeModelStream, modelErrorFromMessage } from './model-errors.ts';
import { configureOpenAI, supportedModelApis } from './model-catalog.ts';
import { InMemoryCredentialStore, InMemoryModelsStore, type Provider, type FetchFunction } from '@earendil-works/pi-ai';
import { ModelRuntime, SettingsManager } from '@earendil-works/pi-coding-agent';
import { explicitEmptyResources } from './session-services.ts';
import type { ModelSelection, ModelOutcome } from '../app-contracts/model.ts';
import type { AgentSession } from '@earendil-works/pi-coding-agent';

/** Public native Provider delegation only. No provider protocol or Agent loop here. */
export async function modelServices(options: { cwd: string; agentDir: string }, selection: ModelSelection,
  key: string, fetch: FetchFunction, syntheticProvider?: Provider) {
  const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsStore: new InMemoryModelsStore(), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false });
  configureOpenAI(runtime, selection);
  if (syntheticProvider) runtime.registerNativeProvider(syntheticProvider);
  const provider = runtime.getProvider(selection.provider); const model = runtime.getModel(selection.provider, selection.model);
  if (!provider || !model || (selection.mode === 'live' && (!supportedModelApis.some(api=>api===model.api) || model.baseUrl !== selection.endpoint))) throw new Error('model_not_supported');
  let calls = 0;
  const limits = { ...(selection.maxOutputTokens===undefined?{}:{maxTokens:selection.maxOutputTokens}), maxRetries: 0, timeoutMs: selection.timeoutMs, transport: 'sse' as const, fetch, env: {} };
  runtime.registerNativeProvider({ ...provider,
    getModels: () => [model],
    stream: () => { throw new Error('raw_model_stream_not_admitted'); },
    streamSimple: (m, c, o) => {
      const cap = selection.fileTools ? selection.fileTools.maxModelRequests : 1;
      if (++calls > (cap ?? Infinity)) throw new Error('model_request_budget');
      let status: number | undefined;
      const observedFetch: FetchFunction = async (input, init) => { const response = await fetch(input, init); status = response.status; return response; };
      return safeModelStream(provider.streamSimple(m, c, { ...o, ...limits, fetch: observedFetch }), () => status, m);
    },
  });
  await runtime.setRuntimeApiKey(selection.provider, key);
  return { model, services: { ...options, modelRuntime: runtime, settingsManager: SettingsManager.inMemory({
    retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0, timeoutMs: selection.timeoutMs } },
    compaction: { enabled: false }, cacheWarming: 'off', transport: 'sse',
  }), resourceLoader: explicitEmptyResources(selection.shellTools?'You may use read, write and edit on approved Markdown files and bash within the approved workspace. Every operation requires host authorization under the task\'s fixed permission mode: manual confirmation or approved automatic rules. Bash is offline, uses a sterile environment, and may change any workspace file. A known nonzero exit may be corrected with a separately host-authorized command. Never retry denied, cancelled or unconfirmed operations.':selection.fileTools?'You may use only read, write and edit on approved Markdown files in the workspace. Every operation requires host authorization under the task\'s fixed permission mode: manual confirmation or approved automatic rules. Treat a denial as a refusal; do not retry it or claim an unconfirmed change.':'You are a concise assistant. You have no tools. Never claim to have read or changed files.'), diagnostics: [] } };
}
export function modelOutcome(session: AgentSession, synthetic: boolean, cancelled: boolean, firstMessage=0): ModelOutcome {
  const messages=session.messages.slice(firstMessage).filter(m=>m.role==='assistant');
  const last=messages.at(-1);
  return { ...(!cancelled && last?.stopReason !== 'stop' && last?.stopReason !== 'length' ? { error: modelErrorFromMessage(last?.errorMessage) } : {}), reason: cancelled ? 'cancelled' : last?.stopReason === 'stop' ? 'stop' : last?.stopReason === 'length' ? 'length' : 'provider_error',
    inputTokens: messages.reduce((n,m)=>n+m.usage.input+m.usage.cacheRead+m.usage.cacheWrite,0), outputTokens: messages.reduce((n,m)=>n+m.usage.output,0), estimatedCostUsd: messages.reduce((n,m)=>n+m.usage.cost.total,0), synthetic };
}
