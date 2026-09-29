import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { InMemoryCredentialStore, InMemoryModelsStore } from '@earendil-works/pi-ai';
import { parseModelSelection, type ModelSelection } from '../app-contracts/model.ts';

/** Only declared model metadata goes through Pi's public provider configuration API. */
export function configureOpenAI(runtime: ModelRuntime, selection: ModelSelection): void {
  parseModelSelection(selection);
  const connection=selection.openai;
  if(!connection){
    // Public endpoint override preserves the bundled model's capabilities and pricing.
    const bundled=runtime.getModel(selection.provider,selection.model);
    if(selection.mode==='live'&&selection.provider==='openai'&&bundled&&bundled.baseUrl!==selection.endpoint)
      runtime.registerProvider('openai',{baseUrl:selection.endpoint});
    return;
  }
  runtime.registerProvider('openai', {
    baseUrl:selection.endpoint, api:connection.api==='responses'?'openai-responses':'openai-completions',
    models:[{id:selection.model,name:selection.model,reasoning:false,input:['text'],contextWindow:connection.contextWindow,maxTokens:selection.maxOutputTokens,
      cost:{input:connection.inputUsdPerMillion,output:connection.outputUsdPerMillion,cacheRead:connection.inputUsdPerMillion,cacheWrite:connection.inputUsdPerMillion},
      ...(connection.api==='chat-completions'?{compat:{maxTokensField:connection.tokenLimitField??'max_tokens',supportsDeveloperRole:false,supportsReasoningEffort:false}}:{}),
    }],
  });
}
export const supportedModelApis = ['anthropic-messages','openai-responses','openai-completions'] as const;
/** Static locked Pi catalog or explicitly approved custom model; no discovery/auth/network. */
export async function describeModel(provider:string,id:string,maxOutputTokens:number, custom?:Pick<ModelSelection,'endpoint'|'openai'>) {
  if(provider!=='openai'&&provider!=='anthropic')throw new Error('provider_not_admitted');
  const runtime=await ModelRuntime.create({credentials:new InMemoryCredentialStore(),modelsStore:new InMemoryModelsStore(),modelsPath:null,allowModelNetwork:false,refreshOnCreate:false});
  if(custom)configureOpenAI(runtime,{mode:'live',provider,model:id,maxOutputTokens,timeoutMs:30000,endpoint:custom.endpoint,...(custom.openai?{openai:custom.openai}:{})});
  const model=runtime.getModel(provider,id);
  if(!model || !supportedModelApis.some(api=>api===model.api))throw new Error('model_not_supported');
  if(model.api==='openai-responses'&&maxOutputTokens<16)throw new Error('responses_min_output_tokens');
  const suffix=model.api==='anthropic-messages'?'/v1/messages?beta=true':model.api==='openai-responses'?'/responses':'/chat/completions';
  return {endpoint:model.baseUrl,requestUrl:model.baseUrl.replace(/\/$/,'')+suffix,
    reserveCostUsd:(model.contextWindow*Math.max(model.cost.input,model.cost.cacheRead,model.cost.cacheWrite)+maxOutputTokens*model.cost.output)/1_000_000,
    priceSource:custom?.openai?'User-declared compatible model metadata; estimate, not verified pricing':'Pi 0.87.1 bundled catalog; estimate, not a provider billing guarantee'};
}

/** Host admission only, never serialization/SSE parsing (those remain in Pi). */
export function validateModelPayload(selection:ModelSelection,url:string,body:string):void {
  const request:unknown=JSON.parse(body);
  if(!request||typeof request!=='object'||Array.isArray(request))throw new Error('model_payload_not_approved');
  const r=request as Record<string,unknown>;
  const fields=['max_tokens','max_completion_tokens','max_output_tokens'];
  const present=fields.filter(f=>Object.hasOwn(r,f));
  const path=new URL(url).pathname;
  const field=path.endsWith('/responses')?'max_output_tokens':path.endsWith('/chat/completions')?present[0]:path.endsWith('/messages')?'max_tokens':undefined;
  if(!field||present.length!==1||present[0]!==field||(path.endsWith('/chat/completions')&&field==='max_output_tokens')||r.model!==selection.model||r.stream!==true||!Number.isSafeInteger(r[field])||Number(r[field])<1||Number(r[field])>selection.maxOutputTokens||(r.tools!==undefined&&(!Array.isArray(r.tools)||r.tools.length))||r.functions!==undefined||r.n!==undefined&&r.n!==1||r.background===true)throw new Error('model_payload_not_approved');
}
