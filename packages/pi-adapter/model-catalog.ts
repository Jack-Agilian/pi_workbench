import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { InMemoryCredentialStore, InMemoryModelsStore } from '@earendil-works/pi-ai';
/** Static locked Pi catalog, no auth discovery, refresh or remote model call. */
export async function describeModel(provider:string,id:string,maxOutputTokens:number) {
  const runtime=await ModelRuntime.create({credentials:new InMemoryCredentialStore(),modelsStore:new InMemoryModelsStore(),modelsPath:null,allowModelNetwork:false,refreshOnCreate:false});
  const model=runtime.getModel(provider,id);
  if(!model || !['anthropic-messages'].includes(model.api))throw new Error('model_not_supported');
  const suffix='/v1/messages?beta=true';
  return {endpoint:model.baseUrl,requestUrl:model.baseUrl.replace(/\/$/,'')+suffix,
    reserveCostUsd:(model.contextWindow*Math.max(model.cost.input,model.cost.cacheRead,model.cost.cacheWrite)+maxOutputTokens*model.cost.output)/1_000_000,
    priceSource:'Pi 0.87.0 bundled catalog; estimate, not a provider billing guarantee'};
}
