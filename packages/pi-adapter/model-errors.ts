import type { Api, Model, AssistantMessage, AssistantMessageEventStream } from '@earendil-works/pi-ai';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import { normalizeProviderError, formatProviderError } from '@earendil-works/pi-ai/utils/error-body';
import { parseModelError, providerErrorCode, type ModelError } from '../app-contracts/model-error.ts';

/** Read only known codes from Pi 0.87.1's formatted errors. Unknown text never crosses this seam. */
function diagnostic(message: string | undefined, httpStatus?: number): ModelError {
  const text = (message ?? '').slice(0, 8192);
  let code = providerErrorCode(text.match(/^(?:Error Code )?([a-z_]+):/)?.[1]);
  if (httpStatus && httpStatus >= 300) {
    // The host has already replaced non-2xx bodies with closed JSON. Never search arbitrary message prose.
    try {
      const value: unknown = JSON.parse(text.slice(text.indexOf('{')));
      if (value && typeof value === 'object' && 'code' in value) code = providerErrorCode(value.code);
    } catch { /* Unknown Pi formatting degrades to status-only, never a fabricated code. */ }
  }
  return { ...(httpStatus && httpStatus >= 300 && httpStatus <= 599 ? { httpStatus } : {}), ...(code ? { code } : {}) };
}
function safeMessage(error: ModelError): string {
  // Use the public Pi formatter, but only AFTER removing all arbitrary provider text/metadata.
  const message = JSON.stringify({ message: 'Provider request failed', ...error });
  return formatProviderError(normalizeProviderError(Object.assign(new Error(message), { status: error.httpStatus })), 'Model request failed');
}
export function modelErrorFromMessage(message: string | undefined): ModelError {
  try {
    const value: unknown = JSON.parse((message ?? '').replace(/^Model request failed \([3-5][0-9]{2}\): /, ''));
    if (!value || typeof value !== 'object' || !('message' in value) || value.message !== 'Provider request failed') return {};
    const { message: _message, ...fields } = value;
    return parseModelError(fields);
  } catch { return {}; }
}

/** Delegate every protocol event to Pi. Sanitize terminal error metadata before AgentSession persists it. */
export function safeModelStream(source: AssistantMessageEventStream, status: () => number | undefined, model: Model<Api>): AssistantMessageEventStream {
  const result = createAssistantMessageEventStream();
  const clean = (message: AssistantMessage): AssistantMessage => {
    const { errorMessage, diagnostics: _diagnostics, rawStopReason: _raw, ...rest } = message;
    return { ...rest, ...(message.stopReason === 'error' || message.stopReason === 'aborted'
      ? { errorMessage: message.stopReason === 'aborted' ? 'Request cancelled' : safeMessage(diagnostic(errorMessage, status())) } : {}) };
  };
  let terminal = false;
  const fail = () => result.push({ type: 'error', reason: 'error', error: {
    role: 'assistant', content: [], api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(),
    stopReason: 'error', errorMessage: safeMessage({}),
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  } });
  void (async () => {
    try {
      for await (const event of source) {
        if (event.type === 'error' || event.type === 'done') terminal = true;
        if (event.type === 'error') result.push({ ...event, error: clean(event.error) });
        else if (event.type === 'done') result.push({ ...event, message: clean(event.message) });
        else result.push({ ...event, partial: clean(event.partial) });
      }
      if (!terminal) fail();
    } catch {
      // Never hang or persist arbitrary thrown text when a Provider violates its event contract.
      if (!terminal) fail();
    } finally {
      result.end();
    }
  })();
  return result;
}
