// All HTTP/keys below are SYNTHETIC. Real installed Pi adapters run in real restricted Workers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createScenario, until } from './scenario.ts';
import { repository } from '../worker-launcher.ts';
import { describeModel, validateModelPayload } from '../../../packages/pi-adapter/model-catalog.ts';
import { parseModelConfiguration, type ModelSelection, type OpenAIConnection } from '../../../packages/app-contracts/model.ts';
const entry={path:join(repository,'packages/pi-adapter/model-worker.ts')};
const key='SYNTHETIC_OPENAI_KEY_NOT_REAL';
function selection(api:'official'|'responses'|'chat-completions',field?:OpenAIConnection['tokenLimitField']):ModelSelection{
 return {mode:'live',provider:'openai',model:api==='official'?'gpt-4o-mini':'SYNTHETIC-custom-model',endpoint:api==='official'?'https://api.openai.com/v1':'https://synthetic.example.invalid/custom/v1',maxOutputTokens:64,timeoutMs:5000,
 ...(api==='official'?{}:{openai:{api,contextWindow:8192,inputUsdPerMillion:0.2,outputUsdPerMillion:0.4,...(field?{tokenLimitField:field}:{})}})};
}
function response(api:'responses'|'chat-completions',id:string){
 const text='SYNTHETIC OpenAI native reply';
 if(api==='chat-completions')return [
 {id,object:'chat.completion.chunk',model:'SYNTHETIC-custom-model',choices:[{index:0,delta:{role:'assistant',content:text},finish_reason:null}]},
 {id,object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:8,completion_tokens:7,total_tokens:15}}
 ].map(e=>`data: ${JSON.stringify(e)}\n\n`).join('')+'data: [DONE]\n\n';
 const item={id:'msg_synthetic',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]};
 return [
 {type:'response.created',response:{id,status:'in_progress'}},
 {type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},
 {type:'response.output_text.delta',output_index:0,content_index:0,item_id:item.id,delta:text},
 {type:'response.output_item.done',output_index:0,item},
 {type:'response.completed',response:{id,status:'completed',output:[item],usage:{input_tokens:8,output_tokens:7,total_tokens:15,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}}
 ].map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}
for(const mode of ['official','responses','chat-completions','chat-modern'] as const)for(const error of [false,true])test(`OpenAI native ${mode} ${error?'401 redaction':'stream and native reopen'} through actual Worker/IPC`,async()=>{
 const s=selection(mode==='chat-modern'?'chat-completions':mode,mode==='chat-modern'?'max_completion_tokens':undefined);
 const configuration=parseModelConfiguration({version:1,authorizationId:'synthetic-openai',approved:true,dataScope:'synthetic_non_sensitive',provider:s.provider,model:s.model,endpoint:s.endpoint,maxRequests:2,maxOutputTokens:s.maxOutputTokens,timeoutMs:s.timeoutMs,maxEstimatedCostUsd:1,...(s.openai?{openai:s.openai}:{})});
 const catalog=await describeModel(s.provider,s.model,s.maxOutputTokens,s);const f=createScenario();let calls=0;
 const fetch:typeof globalThis.fetch=async(url,init)=>{
  calls++;assert.equal(String(url),catalog.requestUrl);assert.equal(init?.redirect,'error');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+key);
  const body=JSON.parse(String(init?.body)) as Record<string,unknown>;assert.equal(body.model,s.model);assert.equal(body.stream,true);assert.ok(!body.tools || Array.isArray(body.tools)&&body.tools.length===0);
  const field=mode==='chat-modern'?'max_completion_tokens':mode==='chat-completions'?'max_tokens':'max_output_tokens';assert.equal(body[field],64);
  if(calls===2)assert.match(JSON.stringify(body),/SYNTHETIC OpenAI native reply/);
  return error?new Response(JSON.stringify({error:{message:key,type:'invalid_api_key'}}),{status:401,headers:{'content-type':'application/json'}}):new Response(response(mode.startsWith('chat')?'chat-completions':'responses','resp_synthetic_'+calls),{headers:{'content-type':'text/event-stream'}});
 };
 const access={key,configuration,requestUrl:catalog.requestUrl,reserveCostUsd:catalog.reserveCostUsd,fetch};
 try{
  await f.supervisor.startNext({tool:'none',model:s,deadline:Date.now()+10000},entry,access);
  assert.equal(calls,1);assert.equal(f.core.snapshot(f.thread).runs[0]!.state,error?'failed':'completed');assert.equal(f.core.modelOutcome(f.run)?.reason,error?'provider_error':'stop');assert.equal(f.core.snapshot(f.thread).operations.length,0);
  const ref=f.core.nativeSessionReference(f.thread);if(ref.persisted)assert.equal(readFileSync(ref.reference!,'utf8').includes(key),false);
  assert.equal(JSON.stringify(f.core.workerLaunches()).includes(key),false);assert.equal(readFileSync(f.database).includes(Buffer.from(key)),false);
  if(!error){assert.equal(f.core.modelOutcome(f.run)?.outputTokens,7);await f.supervisor.close();f.reopen();f.supervisor.recover();const next=f.supervisor.command({type:'runs.start',requestId:'continue-openai',threadId:f.thread,input:'SYNTHETIC continue'}).id;await f.supervisor.startNext({tool:'none',model:s,deadline:Date.now()+10000},entry,access);assert.equal(calls,2);assert.equal(f.core.snapshot(f.thread).runs.find(r=>r.id===next)!.state,'completed');}
 }finally{await f.dispose();}
});
for(const api of ['responses','chat-completions'] as const)test(`OpenAI native ${api} active stream cancellation aborts owned HTTP`,async()=>{
 const f=createScenario();const s=selection(api);const catalog=await describeModel(s.provider,s.model,64,s);let aborted=false;
 const configuration=parseModelConfiguration({version:1,authorizationId:'synthetic-cancel',approved:true,dataScope:'synthetic_non_sensitive',provider:s.provider,model:s.model,endpoint:s.endpoint,maxRequests:1,maxOutputTokens:64,timeoutMs:5000,maxEstimatedCostUsd:1,openai:s.openai});
 try{
  const done=f.supervisor.startNext({tool:'none',model:s,deadline:Date.now()+10000},entry,{key,configuration,requestUrl:catalog.requestUrl,reserveCostUsd:catalog.reserveCostUsd,fetch:async(_url,init)=>{
   init!.signal!.addEventListener('abort',()=>{aborted=true;});
   const full=response(api,'resp_synthetic_cancel');const partial=api==='responses'?full.slice(0,full.indexOf('event: response.output_item.done')):full.slice(0,full.indexOf('\n\n')+2);
   return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(partial));}}),{headers:{'content-type':'text/event-stream'}});
  }})!;
  await until(()=>f.core.presentation(f.run).messages.some(m=>m.role==='assistant'),'openai_partial');assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'running');f.supervisor.command({type:'runs.cancel',requestId:'cancel',runId:f.run});await done;assert.equal(aborted,true);assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'cancelled');
 }finally{await f.dispose();}
});
test('OpenAI closed policy rejects ambiguous caps, tools, unknown metadata and unsafe endpoints',()=>{
 const s=selection('responses');const good={model:s.model,stream:true,max_output_tokens:64};validateModelPayload(s,s.endpoint+'/responses',JSON.stringify(good));
 for(const patch of [{max_output_tokens:65},{max_tokens:64},{tools:[{type:'web_search'}]},{functions:[]},{n:2},{background:true}])assert.throws(()=>validateModelPayload(s,s.endpoint+'/responses',JSON.stringify({...good,...patch})));
 const config={version:1,authorizationId:'synthetic-policy',approved:true,dataScope:'synthetic_non_sensitive',provider:'openai',model:s.model,endpoint:s.endpoint,maxRequests:1,maxOutputTokens:64,timeoutMs:5000,maxEstimatedCostUsd:1,openai:s.openai};
 for(const patch of [{openai:{...s.openai,api:['responses']}},{openai:{...s.openai,inputUsdPerMillion:0}},{openai:{...s.openai,apiKey:key}},{endpoint:'http://example.invalid/v1'},{endpoint:'https://user:pass@example.invalid/v1'}])assert.throws(()=>parseModelConfiguration({...config,...patch}));
});

import { parseEnvelope } from '../../../packages/app-contracts/worker-ipc.ts';
test('HTTP header tokens accept native session_id but reject separators and newlines',()=>{
 const envelope=(headers:unknown)=>({version:5,instanceId:'worker',runtimeBindingId:'binding',requestId:'http-1',body:{type:'model-http',url:'https://example.invalid',method:'POST',headers,body:'{}'}});
 assert.doesNotThrow(()=>parseEnvelope(envelope({session_id:'synthetic-session'})));
 for(const headers of [{'bad header':'x'},{'bad:header':'x'},{session_id:'x\r\nInjected: true'}])assert.throws(()=>parseEnvelope(envelope(headers)));
});
test('catalog rejects unadmitted providers and output caps below native Responses minimum',async()=>{
 await assert.rejects(describeModel('openai','gpt-4o-mini',15),/responses_min_output_tokens/);
 await assert.rejects(describeModel('unapproved','model',64),/provider_not_admitted/);
});
