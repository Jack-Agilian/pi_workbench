// Workbench policy/observations, never Pi provider objects or credentials.
import { exact } from './worker-ipc.ts';
import { identifier } from './index.ts';
export interface OpenAIConnection { api: 'responses' | 'chat-completions'; contextWindow: number; inputUsdPerMillion: number; outputUsdPerMillion: number; tokenLimitField?: 'max_tokens' | 'max_completion_tokens' }
export interface ModelSelection { mode: 'offline' | 'live'; provider: string; model: string; endpoint: string; maxOutputTokens: number; timeoutMs: number; openai?: OpenAIConnection }
export interface ModelConfiguration { version: 1; authorizationId: string; approved: boolean; dataScope: 'synthetic_non_sensitive'; provider: string; model: string; endpoint: string; maxRequests: number; maxOutputTokens: number; timeoutMs: number; maxEstimatedCostUsd: number; openai?: OpenAIConnection }
export interface ModelOutcome { reason: 'stop' | 'length' | 'cancelled' | 'provider_error' | 'budget' | 'protocol'; inputTokens: number; outputTokens: number; estimatedCostUsd: number; synthetic: boolean }
export function parseModelSelection(value: unknown): ModelSelection {
  const r = exact(value, ['mode','provider','model','endpoint','maxOutputTokens','timeoutMs',...(Object.hasOwn(Object(value),'openai')?['openai']:[])]);
  if (typeof r.mode !== 'string' || !['offline','live'].includes(r.mode)) throw new Error('model_mode');
  for (const k of ['provider','model','endpoint']) if (typeof r[k] !== 'string' || !r[k] || r[k].length > 512 || /[\u0000-\u001f]/.test(r[k])) throw new Error('model_selection');
  for (const [k,min,max] of [['maxOutputTokens',1,4096],['timeoutMs',100,120000]] as const) if (typeof r[k] !== 'number' || !Number.isSafeInteger(r[k]) || r[k] < min || r[k] > max) throw new Error('model_limit');
  if (Object.hasOwn(r,'openai')) { if (r.mode !== 'live' || r.provider !== 'openai') throw new Error('openai_provider'); parseOpenAIConnection(r.openai); }
  return r as unknown as ModelSelection;
}
export function parseModelConfiguration(value: unknown): ModelConfiguration {
  const r = exact(value, ['version','authorizationId','approved','dataScope','provider','model','endpoint','maxRequests','maxOutputTokens','timeoutMs','maxEstimatedCostUsd',...(Object.hasOwn(Object(value),'openai')?['openai']:[])]);
  identifier(r.authorizationId);
  if (r.version !== 1 || typeof r.approved !== 'boolean' || r.dataScope !== 'synthetic_non_sensitive') throw new Error('model_configuration');
  parseModelSelection({ mode:'live', provider:r.provider, model:r.model, endpoint:r.endpoint, maxOutputTokens:r.maxOutputTokens, timeoutMs:r.timeoutMs, ...(Object.hasOwn(r,'openai')?{openai:r.openai}:{}) });
  const endpoint = new URL(String(r.endpoint));
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.port && endpoint.port !== '443') throw new Error('model_endpoint');
  if (typeof r.maxRequests !== 'number' || !Number.isSafeInteger(r.maxRequests) || r.maxRequests < 1 || r.maxRequests > 20 || typeof r.maxEstimatedCostUsd !== 'number' || !Number.isFinite(r.maxEstimatedCostUsd) || r.maxEstimatedCostUsd <= 0 || r.maxEstimatedCostUsd > 10) throw new Error('model_budget');
  return r as unknown as ModelConfiguration;
}
export function parseModelOutcome(value: unknown): ModelOutcome {
  const r = exact(value, ['reason','inputTokens','outputTokens','estimatedCostUsd','synthetic']);
  if (typeof r.reason !== 'string' || !['stop','length','cancelled','provider_error','budget','protocol'].includes(r.reason) || typeof r.synthetic !== 'boolean') throw new Error('model_outcome');
  for (const k of ['inputTokens','outputTokens','estimatedCostUsd']) if (typeof r[k] !== 'number' || !Number.isFinite(r[k]) || r[k] < 0 || r[k] > 1e9) throw new Error('model_usage');
  return r as unknown as ModelOutcome;
}

export function parseOpenAIConnection(value: unknown): OpenAIConnection {
  const r=exact(value,['api','contextWindow','inputUsdPerMillion','outputUsdPerMillion',...(Object.hasOwn(Object(value),'tokenLimitField')?['tokenLimitField']:[])]);
  if(r.api!=='responses' && r.api!=='chat-completions')throw new Error('openai_api');
  if(typeof r.contextWindow!=='number'||!Number.isSafeInteger(r.contextWindow)||r.contextWindow<1024||r.contextWindow>2_000_000)throw new Error('openai_context');
  for(const k of ['inputUsdPerMillion','outputUsdPerMillion'])if(typeof r[k]!=='number'||!Number.isFinite(r[k])||r[k]<=0||r[k]>1000)throw new Error('openai_price');
  if(Object.hasOwn(r,'tokenLimitField')&&(r.api!=='chat-completions'||(r.tokenLimitField!=='max_tokens'&&r.tokenLimitField!=='max_completion_tokens')))throw new Error('openai_token_limit');
  return r as unknown as OpenAIConnection;
}
