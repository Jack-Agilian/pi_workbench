import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createScenario, until } from './scenario.ts';
import { repository } from '../worker-launcher.ts';
import type { ModelExecutionPlan } from '../worker-supervisor.ts';
const entry={path:join(repository,'packages/pi-adapter/model-test-worker.ts')};
function plan():ModelExecutionPlan{return {tool:'none',model:{mode:'offline',provider:'workbench-synthetic',model:'synthetic-text',endpoint:'synthetic://no-network',maxOutputTokens:1024,timeoutMs:10000},deadline:Date.now()+20000};}
for(const mode of ['normal','cancel','error'] as const)test(`M1 actual SDK no-tool prompt ${mode}, native history and true Worker cleanup`,async()=>{
 const f=createScenario();
 try{
  // Replace only the queued SYNTHETIC test intent through a second explicitly accepted Run.
  f.supervisor.command({type:'runs.cancel',requestId:'cancel-initial',runId:f.run});
  const run=f.supervisor.command({type:'runs.start',requestId:'model-input',threadId:f.thread,input:mode==='cancel'?'[long]':mode==='error'?'[error]':'remember SYNTHETIC blue-17'}).id;
  const done=f.supervisor.startNext(plan(),entry)!;void done.catch(()=>{});
  if(mode==='cancel'){await until(()=>f.core.presentation(run).messages.some(m=>m.role==='assistant'),'stream-before-end');assert.equal(f.core.snapshot(f.thread).runs.find(r=>r.id===run)?.state,'running');f.supervisor.command({type:'runs.cancel',requestId:'cancel-model',runId:run});}
  await done;const snap=f.core.snapshot(f.thread);assert.equal(snap.operations.length,0);assert.equal(snap.artifacts.length,0);assert.equal(snap.runs.find(r=>r.id===run)?.state,mode==='normal'?'completed':mode==='cancel'?'cancelled':'failed');
  if(mode==='normal'){assert.match(f.core.presentation(run).messages.find(m=>m.role==='assistant')!.text,/SYNTHETIC blue-17/);assert.equal(f.core.modelOutcome(run)?.reason,'stop');const ref=f.core.nativeSessionReference(f.thread);assert.equal(ref.persisted,true);assert.match(readFileSync(ref.reference!,'utf8'),/SYNTHETIC blue-17/);}
  await f.supervisor.close();f.reopen();f.supervisor.recover();assert.equal(f.core.snapshot(f.thread).runs.find(r=>r.id===run)?.state,mode==='normal'?'completed':mode==='cancel'?'cancelled':'failed');
  if(mode==='normal'){const next=f.supervisor.command({type:'runs.start',requestId:'continue',threadId:f.thread,input:'repeat the remembered token'}).id;await f.supervisor.startNext(plan(),entry);assert.match(f.core.presentation(next).messages.find(m=>m.role==='assistant')!.text,/SYNTHETIC blue-17.*repeat the remembered token/);assert.equal(f.core.workerLaunches().length,2);}
 }finally{await f.dispose();}
});

// SYNTHETIC HTTP response fixture through the installed native Anthropic adapter.
// No remote endpoint or real Provider is contacted; protocol parsing stays in Pi.
test('M1 public fetch delegates native provider over real IPC; request budget survives reopen',async()=>{
 const f=createScenario();let requests=0;
 const selection={mode:'live' as const,provider:'anthropic',model:'claude-sonnet-4-5',endpoint:'https://api.anthropic.com',maxOutputTokens:64,timeoutMs:5000};
 const config={version:1 as const,authorizationId:'synthetic-authorization',approved:true,dataScope:'synthetic_non_sensitive' as const,provider:selection.provider,model:selection.model,endpoint:selection.endpoint,maxRequests:1,maxOutputTokens:64,timeoutMs:5000,maxEstimatedCostUsd:5};
 const key='SYNTHETIC_ONLY_NOT_A_REAL_API_KEY';
 const fetch:typeof globalThis.fetch=async(url,options)=>{
  requests++;assert.equal(String(url),'https://api.anthropic.com/v1/messages?beta=true');assert.equal(options?.redirect,'error');
  const request=JSON.parse(String(options?.body)) as {model:string;max_tokens:number;tools?:unknown[]};assert.equal(request.model,selection.model);assert.equal(request.max_tokens,64);assert.ok(!request.tools?.length);
  const events=[
   {type:'message_start',message:{id:'synthetic-message',type:'message',role:'assistant',model:selection.model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:8,output_tokens:0}}},
   {type:'content_block_start',index:0,content_block:{type:'text',text:''}},
   {type:'content_block_delta',index:0,delta:{type:'text_delta',text:'SYNTHETIC native HTTP stream'}},
   {type:'content_block_stop',index:0},
   {type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:7}},
   {type:'message_stop'},
  ];
  return new Response(events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}});
 };
 const access={key,configuration:config,requestUrl:'https://api.anthropic.com/v1/messages?beta=true',reserveCostUsd:1,fetch};
 try{
  await f.supervisor.startNext({tool:'none',model:selection,deadline:Date.now()+10000},{path:join(repository,'packages/pi-adapter/model-worker.ts')},access);
  assert.equal(requests,1);assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'completed');assert.match(f.core.presentation(f.run).messages.find(m=>m.role==='assistant')!.text,/SYNTHETIC native HTTP stream/);
  assert.equal(f.core.modelOutcome(f.run)?.outputTokens,7);
  assert.equal(JSON.stringify(f.core.workerLaunches()).includes(key),false);assert.equal(readFileSync(f.database).includes(Buffer.from(key)),false);
  await f.supervisor.close();f.reopen();f.supervisor.recover();
  const next=f.supervisor.command({type:'runs.start',requestId:'over-budget',threadId:f.thread,input:'SYNTHETIC second request forbidden'}).id;
  await f.supervisor.startNext({tool:'none',model:selection,deadline:Date.now()+10000},{path:join(repository,'packages/pi-adapter/model-worker.ts')},access);
  assert.equal(requests,1);assert.equal(f.core.snapshot(f.thread).runs.find(r=>r.id===next)!.state,'failed');
 }finally{await f.dispose();}
});

import { ModelHttp } from '../model-http.ts';
import { modelFetch } from '../../../packages/pi-adapter/model-fetch.ts';
import { parseModelSelection, parseModelOutcome } from '../../../packages/app-contracts/model.ts';
import { parseEnvelope } from '../../../packages/app-contracts/worker-ipc.ts';
test('M1 strict model DTOs reject coercion, unknown fields and oversized transport',()=>{
 assert.throws(()=>parseModelSelection({...plan().model,mode:['offline']}));
 assert.throws(()=>parseModelOutcome({reason:['stop'],inputTokens:0,outputTokens:0,estimatedCostUsd:0,synthetic:true}));
 for(const body of [{type:'model-http',url:'https://example.invalid',method:'POST',headers:{},body:'x'.repeat(24001)},{type:'model-http-read',hostClean:true},{type:'model-key',key:'x'.repeat(8193)}])assert.throws(()=>parseEnvelope({version:5,instanceId:'worker',runtimeBindingId:'binding',requestId:'http-1',body}));
});
test('M1 bounded pull HTTP, exact URL, one request, error redaction and shared close',async()=>{
 let calls=0;const key='SYNTHETIC_SECRET_CANARY';
 const host=new ModelHttp('https://example.invalid/messages',()=>{},async()=>{calls++;return new Response(key,{status:401});});
 const worker=modelFetch(async(body,id)=>{host.receive(body,async(reply)=>{assert.equal(worker.receive(id,reply),true);});});
 try{
  assert.throws(()=>host.receive({type:'model-http',url:'https://other.invalid',method:'POST',headers:{},body:'{}'},async()=>{}));
  const response=await worker.fetch('https://example.invalid/messages',{method:'POST',body:'{}'});assert.equal(response.status,401);assert.equal((await response.text()).includes(key),false);
  await assert.rejects(worker.fetch('https://example.invalid/messages',{method:'POST'}),/budget/);assert.equal(calls,1);
 }finally{worker.close();const closing=host.close();assert.equal(host.close(),closing);await closing;}
});
test('M1 transport cancellation aborts host-owned request and late responses cannot publish',async()=>{
 let signal:AbortSignal|undefined;let called=false;
 const host=new ModelHttp('https://example.invalid/messages',()=>{},async(_url,options)=>{called=true;signal=options!.signal!;return new Promise((_resolve,reject)=>signal!.addEventListener('abort',()=>reject(new Error('synthetic_abort')),{once:true}));});
 const worker=modelFetch(async(body,id)=>host.receive(body,async(reply)=>{worker.receive(id,reply);}));
 const pending=worker.fetch('https://example.invalid/messages',{method:'POST',body:'{}'});const rejected=assert.rejects(pending,/closed/);
 await until(()=>called,'http_started');worker.close();await host.close();await rejected;assert.equal(signal!.aborted,true);assert.equal(worker.receive('http-1',{type:'model-http-error'}),false);
});
test('M1 stream size cap fails closed',async()=>{
 const host=new ModelHttp('https://example.invalid/messages',()=>{},async()=>new Response(new Uint8Array(1_100_000)));
 const worker=modelFetch(async(body,id)=>host.receive(body,async(reply)=>{worker.receive(id,reply);}));
 try{const response=await worker.fetch('https://example.invalid/messages',{method:'POST',body:'{}'});await assert.rejects(response.arrayBuffer(),/transport_failed/);}finally{worker.close();await host.close();}
});
test('M1 actual Worker SIGKILL stays unknown until real reconciliation; reopen never resends',async()=>{
 const f=createScenario();try{
  f.supervisor.command({type:'runs.cancel',requestId:'initial-cancel',runId:f.run});
  const run=f.supervisor.command({type:'runs.start',requestId:'long-model',threadId:f.thread,input:'[long]'}).id;
  const done=f.supervisor.startNext(plan(),entry)!;
  await until(()=>f.core.presentation(run).messages.some(m=>m.role==='assistant'),'partial_before_kill');
  assert.notEqual(f.supervisor.workerPid, process.pid);process.kill(f.supervisor.workerPid!, 'SIGKILL');
  await done;assert.equal(f.core.snapshot(f.thread).runs.find(r=>r.id===run)!.state,'unknown');
  await f.supervisor.close();f.reopen();f.supervisor.recover();assert.equal(f.core.snapshot(f.thread).runs.find(r=>r.id===run)!.state,'failed');assert.equal(f.core.workerLaunches().length,1);assert.equal(f.supervisor.startNext(plan(),entry),undefined);assert.equal(f.core.snapshot(f.thread).operations.length,0);
 }finally{await f.dispose();}
});
test('M1 native provider error cannot persist reflected credentials or count as success',async()=>{
 const f=createScenario();const key='SYNTHETIC_REFLECTED_KEY_NOT_REAL';let calls=0;
 const selection={mode:'live' as const,provider:'anthropic',model:'claude-sonnet-4-5',endpoint:'https://api.anthropic.com',maxOutputTokens:64,timeoutMs:5000};
 const config={version:1 as const,authorizationId:'synthetic-error',approved:true,dataScope:'synthetic_non_sensitive' as const,...selection,maxRequests:1,maxEstimatedCostUsd:5};
 const {mode:_mode,...configuration}=config;
 try{
  await f.supervisor.startNext({tool:'none',model:selection,deadline:Date.now()+10000},{path:join(repository,'packages/pi-adapter/model-worker.ts')},{key,configuration,requestUrl:'https://api.anthropic.com/v1/messages?beta=true',reserveCostUsd:1,fetch:async()=>{calls++;return new Response(JSON.stringify({error:{type:'authentication_error',message:key}}),{status:401,headers:{'content-type':'application/json'}});}});
  assert.equal(calls,1);assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'failed');assert.equal(f.core.modelOutcome(f.run)?.reason,'provider_error');
  const ref=f.core.nativeSessionReference(f.thread);if(ref.persisted)assert.equal(readFileSync(ref.reference!,'utf8').includes(key),false);
  assert.equal(readFileSync(f.database).includes(Buffer.from(key)),false);
 }finally{await f.dispose();}
});
test('M1 deadline terminates active generation; recovery does not retry the request',async()=>{
 const f=createScenario();try{
  f.supervisor.command({type:'runs.cancel',requestId:'initial-cancel',runId:f.run});const run=f.supervisor.command({type:'runs.start',requestId:'timeout',threadId:f.thread,input:'[long]'}).id;
  const done=f.supervisor.startNext({...plan(),deadline:Date.now()+1500},entry)!;await until(()=>f.core.presentation(run).messages.some(m=>m.role==='assistant'),'generation_before_deadline');await done;
  assert.equal(f.core.snapshot(f.thread).runs.find(r=>r.id===run)!.state,'unknown');f.supervisor.recover();assert.equal(f.core.snapshot(f.thread).runs.find(r=>r.id===run)!.state,'failed');assert.equal(f.core.workerLaunches().length,1);
 }finally{await f.dispose();}
});
