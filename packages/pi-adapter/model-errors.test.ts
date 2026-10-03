// Actual public Pi containers, all messages and faults SYNTHETIC; no model/network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fauxAssistantMessage, InMemoryCredentialStore, InMemoryModelsStore } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { AssistantMessageEventStream, createAssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import { normalizeProviderError, formatProviderError } from '@earendil-works/pi-ai/utils/error-body';
import { safeModelStream, modelErrorFromMessage } from './model-errors.ts';
const runtime=await ModelRuntime.create({credentials:new InMemoryCredentialStore(),modelsStore:new InMemoryModelsStore(),modelsPath:null,allowModelNetwork:false,refreshOnCreate:false});
const model=runtime.getModel('openai','gpt-6-luna')!;
test('public Pi formatting is not redaction; adapter removes error metadata without mutating original native events',async()=>{
 const secret='SYNTHETIC_PRIVATE_ERROR';assert.equal(formatProviderError(normalizeProviderError(new Error(secret))),secret);
 const native=createAssistantMessageEventStream();const safe=safeModelStream(native,()=>200,model);
 const original={...fauxAssistantMessage('SYNTHETIC partial',{stopReason:'error',errorMessage:'Error Code server_error: '+secret}),rawStopReason:secret};
 native.push({type:'error',reason:'error',error:original});native.end();
 const result=await safe.result();assert.deepEqual(modelErrorFromMessage(result.errorMessage),{code:'server_error'});
 assert.equal(JSON.stringify(result).includes(secret),false);assert.ok(original.errorMessage!.includes(secret));
 assert.equal(result.content[0]?.type,'text');assert.deepEqual(result.usage,original.usage);
 const events=[];for await(const event of safe)events.push(event);assert.equal(events.length,1);
});
for(const mode of ['throws','empty'] as const)test(`broken SYNTHETIC provider ${mode} terminates result and iterator safely`,async()=>{
 class BrokenStream extends AssistantMessageEventStream { override async *[Symbol.asyncIterator](){if(mode==='throws')throw new Error('SYNTHETIC_PRIVATE_THROW');} }
 const stream=safeModelStream(new BrokenStream(),()=>undefined,model);
 const result=await stream.result();assert.equal(result.stopReason,'error');assert.equal(JSON.stringify(result).includes('SYNTHETIC_PRIVATE_THROW'),false);
 const events=[];for await(const event of stream)events.push(event);assert.equal(events.length,1);
});
