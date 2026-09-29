import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync,readFileSync,writeFileSync,mkdtempSync,realpathSync,rmSync,statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createScenario,until } from './scenario.ts';
import { repository,sterileEnvironment,type CleanupReceipt } from '../worker-launcher.ts';
import { ProductCore } from '../core.ts';
import { WorkerSupervisor } from '../worker-supervisor.ts';
import { modelFetch } from '../../../packages/pi-adapter/model-fetch.ts';
import { policyDigest,assertTimeoutRevision } from '../model-policy.ts';
import { parseFileToolRequest,parseFileToolPolicy } from '../../../packages/app-contracts/file-tools.ts';
import type { WireBody,ResourceSelection } from '../../../packages/app-contracts/worker-ipc.ts';
import { parseModelConfiguration,type ModelSelection } from '../../../packages/app-contracts/model.ts';
import type { FileToolRequest } from '../../../packages/app-contracts/file-tools.ts';
import { syntheticReply } from './file-agent-fixture.ts';
const entry={path:join(repository,'packages/pi-adapter/model-worker.ts')};
const write:FileToolRequest={tool:'write',parameters:{path:'report.md',content:'# SYNTHETIC first\n'}};
const read:FileToolRequest={tool:'read',parameters:{path:'report.md'}};
const edit:FileToolRequest={tool:'edit',parameters:{path:'report.md',edits:[{oldText:'first',newText:'edited'}]}};
function setup(api:'responses'|'chat-completions'='chat-completions',maxRequests=4){
 const f=createScenario();
 const model:ModelSelection={mode:'live',provider:'openai',model:'SYNTHETIC-file-model',endpoint:'https://synthetic.invalid/v1',maxOutputTokens:1024,timeoutMs:5000,openai:{api,contextWindow:8192,inputUsdPerMillion:1,outputUsdPerMillion:1},fileTools:{maxOperations:8,maxModelRequests:4,operationTimeoutMs:10000}};
 const {mode:_mode,...fields}=model;
 const configuration=parseModelConfiguration({version:1,authorizationId:'synthetic-file-authorization',approved:true,dataScope:'synthetic_non_sensitive',...fields,maxRequests,maxEstimatedCostUsd:1,httpIdleTimeoutMs:1000});
 const access={key:'SYNTHETIC_FILE_KEY',configuration,requestUrl:model.endpoint+(api==='responses'?'/responses':'/chat/completions'),reserveCostUsd:0.01};
 return {...f,f,model,access,plan:{tool:'none' as const,model,deadline:Date.now()+30000}};
}
async function approve(f:ReturnType<typeof createScenario>,index:number,decision:'allow'|'deny'='allow'){
 await until(()=>f.core.snapshot(f.thread).operations.filter(o=>o.state==='pending').length>0,`pending-${index}`);
 const op=f.core.snapshot(f.thread).operations.find(o=>o.state==='pending')!;
 const command={type:'approvals.resolve' as const,requestId:`approve-${index}`,operationId:op.id,parametersDigest:op.parametersDigest,decision};
 f.supervisor.command(command);assert.deepEqual(f.supervisor.command(command),{accepted:true,id:op.id});return op;
}
for(const api of ['chat-completions','responses'] as const)test(`M2 ${api}: same Pi Session chooses sequential write/read/edit, per-call budgets and outcomes`,async()=>{
 const {f,access,plan}=setup(api);let calls=0;const bodies:string[]=[];
 try{
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async(_url,options)=>{
   calls++;bodies.push(String(options?.body));const tools=calls===1?[write,read]:calls===2?[edit]:[];
   return new Response(syntheticReply(api,calls,tools),{headers:{'content-type':'text/event-stream'}});
  }})!;
  assert.equal(f.supervisor.startNext(plan,entry),done);
  for(let i=0;i<3;i++){await approve(f,i);await until(()=>f.core.snapshot(f.thread).operations[i]?.state==='succeeded',`settled-${i}`);}
  await done;
  assert.equal(calls,3);assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'completed');assert.equal(f.core.snapshot(f.thread).operations.length,3);
  assert.equal(readFileSync(join(f.cwd,'report.md'),'utf8'),'# SYNTHETIC edited\n');assert.equal(f.core.snapshot(f.thread).artifacts.length,2);
  assert.ok(bodies[1]!.includes('SYNTHETIC first'));assert.ok(bodies[2]!.includes('Successfully replaced'));
  assert.equal(f.core.modelAdmission(access.configuration,0.01).used,3);assert.equal(f.core.modelOutcome(f.run)?.outputTokens,21);
  const ref=f.core.nativeSessionReference(f.thread);assert.equal(ref.persisted,true);assert.ok(readFileSync(ref.reference!,'utf8').includes('toolResult'));
  await f.supervisor.close();f.reopen();f.supervisor.recover();assert.equal(f.core.modelAdmission(access.configuration,0.01).used,3);assert.equal(f.core.nativeSessionReference(f.thread).reference,ref.reference);
  assert.equal(f.supervisor.startNext(plan,entry,{...access,fetch:async()=>{throw new Error('unexpected_replay');}}),undefined);assert.equal(calls,3);
  const mtime=statSync(join(f.cwd,'report.md')).mtimeMs;
  const next=f.supervisor.command({type:'runs.start',requestId:'native-file-resume',threadId:f.thread,input:'SYNTHETIC continue previous file discussion'}).id;
  await f.supervisor.startNext({...plan,deadline:Date.now()+30000},entry,{...access,fetch:async(_url,options)=>{
   calls++;assert.ok(String(options?.body).includes('Successfully replaced'));assert.ok(String(options?.body).includes('edited'));
   return new Response(syntheticReply(api,calls),{headers:{'content-type':'text/event-stream'}});
  }});
  assert.equal(f.core.snapshot(f.thread).runs[1]!.state,'completed');assert.equal(f.core.modelOutcome(next)?.outputTokens,7);
  assert.equal(f.core.nativeSessionReference(f.thread).reference,ref.reference);assert.equal(f.core.snapshot(f.thread).operations.length,3);
  assert.equal(statSync(join(f.cwd,'report.md')).mtimeMs,mtime);assert.equal(f.core.modelAdmission(access.configuration,0.01).used,4);
 }finally{await f.dispose();}
});

test('M2 transport: next fetch waits for owned close acknowledgement; late old read cannot contaminate it',async()=>{
 const sent:{body:WireBody;id:string}[]=[];const transport=modelFetch(async(body,id)=>{sent.push({body,id});},()=>true);
 try{
  const first=transport.fetch('https://synthetic.invalid',{method:'POST',body:'SYNTHETIC'});
  await until(()=>sent.length===1,'first_head');transport.receive(sent[0]!.id,{type:'model-http-head',status:200,headers:{}});const response=await first;
  await until(()=>sent.length===2,'prefetched_read');const cancelled=response.body!.cancel();
  await until(()=>sent.length===3,'close_request');assert.equal(sent[2]!.body.type,'model-http-finish');
  const next=transport.fetch('https://synthetic.invalid',{method:'POST',body:'SYNTHETIC next'});
  await new Promise(r=>setTimeout(r,30));assert.equal(sent.length,3);
  assert.equal(transport.receive(sent[1]!.id,{type:'model-http-chunk',data:Buffer.from('OLD').toString('base64'),end:false}),true);
  transport.receive(sent[2]!.id,{type:'model-http-finished'});await cancelled;
  await until(()=>sent.length===4,'next_head');transport.receive(sent[3]!.id,{type:'model-http-head',status:200,headers:{}});const second=await next;
  await until(()=>sent.length===5,'next_read');const text=second.text();transport.receive(sent[4]!.id,{type:'model-http-chunk',data:Buffer.from('SYNTHETIC NEW').toString('base64'),end:true});
  await until(()=>sent.length===6,'next_close');transport.receive(sent[5]!.id,{type:'model-http-finished'});
  assert.equal(await text,'SYNTHETIC NEW');assert.equal(transport.receive(sent[1]!.id,{type:'model-http-error'}),false);
 }finally{transport.close();}
});

test('M2 file policy is canonical authority; old timeout revision cannot enable/expand tools and malformed scope is rejected',async()=>{
 const {f,access}=setup();try{
  const c=access.configuration;const reordered={...c,fileTools:Object.fromEntries(Object.entries(c.fileTools!).reverse())};
  assert.equal(policyDigest(c),policyDigest(parseModelConfiguration(reordered)));
  const old={...c};delete old.fileTools;assert.throws(()=>assertTimeoutRevision(old,c),/scope/);
  assert.throws(()=>assertTimeoutRevision(c,{...c,fileTools:{...c.fileTools!,maxOperations:9}}),/scope/);
  for(const p of [{...c.fileTools,maxOperations:0},{...c.fileTools,maxModelRequests:21},{...c.fileTools,bash:true}])assert.throws(()=>parseFileToolPolicy(p));
  for(const request of [{tool:'bash',parameters:{path:'x.md'}},{tool:'read',parameters:{path:'photo.png'}},{tool:'read',parameters:{path:'/secret.md'}},{...write,parameters:{path:'x.md',content:'x'.repeat(16001)}},{tool:'read',parameters:{path:'x.md',offset:0}}])assert.throws(()=>parseFileToolRequest(request));
 }finally{await f.dispose();}
});

for(const phase of ['approval','after-write'] as const)test(`M2 actual App Server SIGKILL at ${phase}: real guardian receipt and cold file ledger reconciliation`,async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'m2-host-kill-'))),manifest=join(dir,'checkpoint.json');
 let m:{root:string;cwd:string;database:string;thread:string;resources:ResourceSelection;workerPid:number}|undefined;let core:ProductCore|undefined;
 const host=spawn(process.execPath,['--import',join(repository,'scripts/probe-no-network.mjs'),join(import.meta.dirname,'file-agent-host.ts'),manifest,phase],{cwd:dir,env:sterileEnvironment(dir),stdio:['ignore','ignore','inherit']});const exited=once(host,'exit');
 const gone=(pid:number)=>{try{process.kill(pid,0);return false;}catch(e){if(e instanceof Error&&'code' in e){if(e.code==='ESRCH')return true;if(e.code==='EPERM')return false;}throw e;}};
 try{
  await until(()=>existsSync(manifest),'host_checkpoint');m=JSON.parse(readFileSync(manifest,'utf8')) as NonNullable<typeof m>;
  assert.equal(existsSync(join(m.cwd,'report.md')),phase==='after-write');const mtime=phase==='after-write'?statSync(join(m.cwd,'report.md')).mtimeMs:null;
  host.kill('SIGKILL');assert.equal((await exited)[1],'SIGKILL');
  core=new ProductCore(m.database,[{id:'workspace',path:m.cwd}]);const supervisor=new WorkerSupervisor(core,{stateDirectory:join(m.root,'state'),databaseDirectory:join(m.root,'host'),resources:m.resources});
  const journal=JSON.parse(core.workerLaunches()[0]!.record) as {spec:{receipt:string}};
  await until(()=>gone(-m!.workerPid)&&existsSync(journal.spec.receipt),'actual_group_cleanup');
  const receipt=JSON.parse(readFileSync(journal.spec.receipt,'utf8')) as CleanupReceipt;assert.equal(receipt.groupGone,true);assert.equal(receipt.exited,true);assert.equal(receipt.workerPid,m.workerPid);
  supervisor.recover();const snap=core.snapshot(m.thread);assert.equal(snap.runs[0]!.state,'failed');assert.equal(snap.operations[0]!.state,phase==='after-write'?'succeeded':'denied');assert.equal(snap.artifacts.length,phase==='after-write'?1:0);
  if(mtime!==null)assert.equal(statSync(join(m.cwd,'report.md')).mtimeMs,mtime);else assert.equal(existsSync(join(m.cwd,'report.md')),false);
  supervisor.recover();assert.equal(core.snapshot(m.thread).cursor,snap.cursor);
 }finally{
  if(host.exitCode===null&&host.signalCode===null){host.kill('SIGKILL');await exited;}
  core?.close();if(m&&gone(-m.workerPid))rmSync(m.root,{recursive:true,force:true});rmSync(dir,{recursive:true,force:true});
 }
});

for(const scenario of ['zero','deny','budget','failed-edit','cancel-approval','version','resource'] as const)test(`M2 ${scenario}: independent operation facts and no unapproved execution`,async()=>{
 const {f,access,plan}=setup('chat-completions',scenario==='budget'?1:4);let calls=0;
 const invalidEdit:FileToolRequest={tool:'edit',parameters:{path:'report.md',edits:[{oldText:'SYNTHETIC missing match',newText:'never'}]}};
 try{
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async()=>{
   calls++;const tools=calls===1?(scenario==='zero'?[]:[write]):calls===2&&scenario==='failed-edit'?[invalidEdit]:[];
   return new Response(syntheticReply('chat-completions',calls,tools),{headers:{'content-type':'text/event-stream'}});
  }})!;
  if(scenario!=='zero'){
   await until(()=>f.core.snapshot(f.thread).operations.some(o=>o.state==='pending'),'pending');
   if(scenario==='version')writeFileSync(join(f.cwd,'report.md'),'# SYNTHETIC external change\n');
   if(scenario==='resource')writeFileSync(join(f.resources.root,'package.json'),'{}');
   if(scenario==='cancel-approval')f.supervisor.command({type:'runs.cancel',requestId:'cancel',runId:f.run});
   else await approve(f,0,scenario==='deny'?'deny':'allow');
   if(scenario==='failed-edit')await approve(f,1);
  }
  await done;
  const before=f.core.snapshot(f.thread);if(before.runs[0]!.state==='unknown'){f.reopen();f.supervisor.recover();}
  const snap=f.core.snapshot(f.thread);
  assert.equal(snap.runs[0]!.state,scenario==='zero'?'completed':scenario==='cancel-approval'?'cancelled':'failed');
  const ops=snap.operations;
  if(['deny','cancel-approval','resource'].includes(scenario))assert.equal(existsSync(join(f.cwd,'report.md')),false);
  if(scenario==='version')assert.equal(readFileSync(join(f.cwd,'report.md'),'utf8'),'# SYNTHETIC external change\n');
  if(scenario==='budget'){assert.equal(calls,1);assert.equal(ops[0]!.state,'succeeded');assert.equal(f.core.modelAdmission(access.configuration,0.01).used,1);}
  if(scenario==='failed-edit'){assert.deepEqual(ops.map(o=>o.state),['succeeded','failed']);assert.equal(readFileSync(join(f.cwd,'report.md'),'utf8'),write.parameters.content);assert.equal(calls,2);}
  if(scenario==='deny')assert.equal(ops[0]!.state,'denied');
  await f.supervisor.close();f.reopen();f.supervisor.recover();assert.equal(f.core.snapshot(f.thread).runs[0]!.state,snap.runs[0]!.state);
 }finally{await f.dispose();}
});

for(const mode of ['after-grant','after-write'] as const)test(`M2 SIGKILL ${mode}: real file/DB reopen only reconciles original operation`,async()=>{
 const {f,access,plan}=setup();let calls=0;
 const fixture=join(repository,'apps/agent-server/tests/file-agent-worker.ts');
 try{
  const done=f.supervisor.startNext(plan,{path:fixture,extraRead:[fixture],args:[mode]},{...access,fetch:async()=>{calls++;return new Response(syntheticReply('chat-completions',calls,[write]),{headers:{'content-type':'text/event-stream'}});}})!;
  await approve(f,0);await until(()=>existsSync(join(f.cwd,'.file-agent-stage')),'checkpoint');
  assert.equal(existsSync(join(f.cwd,'report.md')),mode==='after-write');assert.ok(f.supervisor.workerPid);assert.notEqual(f.supervisor.workerPid,process.pid);
  process.kill(f.supervisor.workerPid!,'SIGKILL');await done;
  assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'unknown');assert.equal(f.core.snapshot(f.thread).operations[0]!.state,'unknown');
  const bytes=mode==='after-write'?readFileSync(join(f.cwd,'report.md')):null;
  f.reopen();f.supervisor.recover();const snapshot=f.core.snapshot(f.thread);
  assert.equal(snapshot.runs[0]!.state,'failed');assert.equal(snapshot.operations[0]!.state,mode==='after-write'?'succeeded':'failed');assert.equal(snapshot.artifacts.length,mode==='after-write'?1:0);
  if(bytes)assert.deepEqual(readFileSync(join(f.cwd,'report.md')),bytes);
  const cursor=snapshot.cursor;f.supervisor.recover();assert.equal(f.core.snapshot(f.thread).cursor,cursor);assert.equal(calls,1);assert.equal(f.core.modelAdmission(access.configuration,0.01).used,1);
 }finally{await f.dispose();}
});

for(const mode of ['after-grant','after-write'] as const)test(`M2 active tool cancellation at ${mode} preserves side effects until host reconciliation`,async()=>{
 const {f,access,plan}=setup();const fixture=join(repository,'apps/agent-server/tests/file-agent-worker.ts');
 try{
  const done=f.supervisor.startNext(plan,{path:fixture,extraRead:[fixture],args:[mode]},{...access,fetch:async()=>new Response(syntheticReply('chat-completions',1,[write]),{headers:{'content-type':'text/event-stream'}})})!;
  await approve(f,0);await until(()=>existsSync(join(f.cwd,'.file-agent-stage')),'tool_active');
  f.supervisor.command({type:'runs.cancel',requestId:'cancel-active-tool',runId:f.run});await done;
  assert.equal(f.core.snapshot(f.thread).runs[0]!.state,mode==='after-write'?'unknown':'cancelled');f.reopen();f.supervisor.recover();
  assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'cancelled');assert.equal(f.core.snapshot(f.thread).operations[0]!.state,mode==='after-write'?'succeeded':'failed');
  assert.equal(existsSync(join(f.cwd,'report.md')),mode==='after-write');
 }finally{await f.dispose();}
});

test('M2 separate request timers: approval wait can exceed a whole LLM timeout without consuming network time',async()=>{
 const {f,model,access}=setup();model.timeoutMs=1000;access.configuration.timeoutMs=1000;let calls=0;
 try{
  const done=f.supervisor.startNext({tool:'none',model,deadline:Date.now()+15000},entry,{...access,fetch:async()=>{calls++;await new Promise(r=>setTimeout(r,300));return new Response(syntheticReply('chat-completions',calls,calls===1?[write]:[]),{headers:{'content-type':'text/event-stream'}});}})!;
  await until(()=>f.core.snapshot(f.thread).operations.some(o=>o.state==='pending'),'approval');await new Promise(r=>setTimeout(r,1200));
  assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'running');await approve(f,0);await done;
  assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'completed');assert.equal(calls,2);
 }finally{await f.dispose();}
});

test('M2 SQL v7 migration preserves old policy rows; host request identities, sequential reservations and replay are atomic',async()=>{
 const {f,access}=setup();const database=f.database;
 try{
  const binding=f.core.dispatchNext()!;f.core.markRunning(binding);f.core.reserveConfiguredModelRequest(binding,access.configuration,0.01);
  f.core.settle(binding,'completed',{piIdle:true,hostClean:true}); // Synthetic host evidence only: this test exercises ledger migration, not processes.
  f.core.close();
  const old=new DatabaseSync(database);old.exec(`DROP TABLE file_operations; ALTER TABLE model_requests RENAME TO rows_v8;
   CREATE TABLE model_requests(run_id TEXT PRIMARY KEY REFERENCES runs(id),authorization_id TEXT NOT NULL,policy_digest TEXT NOT NULL,reserved_cost REAL NOT NULL) STRICT;
   INSERT INTO model_requests SELECT run_id,authorization_id,policy_digest,reserved_cost FROM rows_v8; DROP TABLE rows_v8; PRAGMA user_version=7;`);
  const before=old.prepare('SELECT * FROM model_requests').all();old.close();
  // ProductCore.close is repeatable; reopen migrates the actual temporary SQLite file.
  f.reopen();const db=new DatabaseSync(database,{readOnly:true});assert.equal(db.prepare('PRAGMA user_version').get()?.user_version,8);
  assert.deepEqual(db.prepare('SELECT run_id,authorization_id,policy_digest,reserved_cost FROM model_requests').all(),before);db.close();
  const run=f.core.handle({type:'runs.start',requestId:'multi-request',threadId:f.thread,input:'SYNTHETIC multi-budget'}).id;
  const b=f.core.dispatchNext()!;f.core.markRunning(b);assert.equal(b.runId,run);
  assert.equal(f.core.reserveConfiguredModelRequest(b,access.configuration,0.01,{id:'owned-1',sequence:1}),true);
  assert.equal(f.core.reserveConfiguredModelRequest(b,access.configuration,0.01,{id:'owned-1',sequence:1}),false);
  assert.throws(()=>f.core.reserveConfiguredModelRequest(b,access.configuration,0.02,{id:'owned-1',sequence:1}),/conflict/);
  assert.throws(()=>f.core.reserveConfiguredModelRequest(b,access.configuration,0.01,{id:'gap',sequence:3}),/sequence/);
  assert.equal(f.core.reserveConfiguredModelRequest(b,access.configuration,0.01,{id:'owned-2',sequence:2}),true);
  assert.equal(f.core.modelAdmission(access.configuration,0.01).used,3);
 }finally{await f.dispose();}
});

for(const mode of ['stale-source','unknown-tool','oversized','unknown-field'] as const)test(`M2 actual Worker ${mode} cannot authorize a request or tool`,async()=>{
 const {f,access,plan}=setup();let calls=0;const fixture=join(repository,'apps/agent-server/tests/file-agent-worker.ts');
 try{
  await f.supervisor.startNext(plan,{path:fixture,extraRead:[fixture],args:[mode]},{...access,fetch:async()=>{calls++;return new Response(syntheticReply('chat-completions',1,[write]));}});
  assert.equal(calls,0);assert.equal(existsSync(join(f.cwd,'report.md')),false);assert.equal(f.core.snapshot(f.thread).operations.length,0);assert.equal(f.core.modelAdmission(access.configuration,0.01).used,0);
  f.reopen();f.supervisor.recover();assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'failed');
 }finally{await f.dispose();}
});

test('M2 per-request total deadline stops continuously progressing HTTP; reservation survives actual restart',async()=>{
 const {f,model,access}=setup();model.timeoutMs=300;access.configuration.timeoutMs=300;let cancelled=false;let calls=0;let timer:ReturnType<typeof setInterval>|undefined;
 try{
  await f.supervisor.startNext({tool:'none',model,deadline:Date.now()+15000},entry,{...access,fetch:async()=>{
   calls++;return new Response(new ReadableStream<Uint8Array>({start(c){timer=setInterval(()=>c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({id:'synthetic-long',object:'chat.completion.chunk',choices:[{index:0,delta:{role:'assistant',content:'SYNTHETIC progress '},finish_reason:null}]})}\n\n`)),30);},cancel(){cancelled=true;clearInterval(timer);}}),{headers:{'content-type':'text/event-stream'}});
  }});
  assert.equal(cancelled,true);assert.equal(calls,1);assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'unknown');
  f.reopen();f.supervisor.recover();assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'failed');assert.equal(f.core.modelAdmission(access.configuration,0.01).used,1);
 }finally{clearInterval(timer);await f.dispose();}
});

for(const mode of ['expired','deny-batch','large-edit','large-read','outside'] as const)test(`M2 ${mode} does not grant an invalid file capability`,async()=>{
 const {f,model,access}=setup();let calls=0;
 if(mode==='expired'){model.fileTools!.operationTimeoutMs=250;access.configuration.fileTools!.operationTimeoutMs=250;}
 const path=join(f.cwd,'report.md');
 if(mode==='large-read'||mode==='large-edit')writeFileSync(path,mode==='large-read'?'SYNTHETIC'.repeat(2000):'x'.repeat(10000)+'a');
 const original=existsSync(path)?readFileSync(path):null;
 const request:FileToolRequest=mode==='large-read'?read:mode==='large-edit'?{tool:'edit',parameters:{path:'report.md',edits:[{oldText:'a',newText:'x'.repeat(8000)}]}}:mode==='outside'?{tool:'write',parameters:{path:'../outside.md',content:'SYNTHETIC'}}:write;
 try{
  const done=f.supervisor.startNext({tool:'none',model,deadline:Date.now()+30000},entry,{...access,fetch:async()=>{calls++;return new Response(syntheticReply('chat-completions',calls,mode==='deny-batch'?[write,read]:[request]),{headers:{'content-type':'text/event-stream'}});}})!;
  if(mode==='deny-batch')await approve(f,0,'deny');
  if(mode==='expired')await until(()=>f.core.snapshot(f.thread).operations.length===1,'expires');
  await done;f.reopen();f.supervisor.recover();
  assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'failed');
  // Outside-workspace input fails locally before requesting authority. Pi receives a tool
  // error; this deliberately repeating SYNTHETIC model exhausts its four-call host budget.
  assert.equal(calls,mode==='outside'?4:1);assert.equal(f.core.modelAdmission(access.configuration,0.01).used,calls);
  assert.equal(f.core.snapshot(f.thread).operations.some(o=>o.state==='succeeded'),false);assert.equal(existsSync(join(f.root,'outside.md')),false);
  if(original)assert.deepEqual(readFileSync(path),original);else assert.equal(existsSync(path),false);
  if(mode==='expired'){const op=f.core.snapshot(f.thread).operations[0]!;assert.throws(()=>f.supervisor.command({type:'approvals.resolve',requestId:'too-late',operationId:op.id,parametersDigest:op.parametersDigest,decision:'allow'}));}
 }finally{await f.dispose();}
});

test('M2 later model turn streams safe text alongside the already persisted first Assistant',async()=>{
 const {f,access,plan}=setup();let calls=0;let release:()=>void=()=>{};
 try{
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async()=>{
   calls++;
   if(calls===1)return new Response(syntheticReply('chat-completions',1,[write]),{headers:{'content-type':'text/event-stream'}});
   const chunks=syntheticReply('chat-completions',2,[],'SYNTHETIC second streaming').split('\n\n');
   return new Response(new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode(chunks[0]+'\n\n'));release=()=>{c.enqueue(new TextEncoder().encode(chunks.slice(1).join('\n\n')));c.close();};}}),{headers:{'content-type':'text/event-stream'}});
  }})!;
  await approve(f,0);await until(()=>f.core.presentation(f.run).messages.some(m=>m.id==='streaming'&&m.text.includes('SYNTHETIC second')),'second_stream');
  assert.ok(f.core.presentation(f.run).messages.some(m=>m.text.includes('SYNTHETIC planning')));release();await done;
  assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'completed');assert.equal(f.core.presentation(f.run).messages.some(m=>m.id==='streaming'),false);
 }finally{release=()=>{};await f.dispose();}
});

// Review regression: preserve actual UTF-8 bytes in host plans, including a BOM.
for (const tool of ['read','edit'] as const) test(`M2 review BOM ${tool}: approved valid Markdown keeps byte identity`, async () => {
 const {f,access,plan}=setup();let calls=0;
 const original='\uFEFF# SYNTHETIC before\n';
 writeFileSync(join(f.cwd,'report.md'),original);
 const request:FileToolRequest=tool==='read'?read:{tool:'edit',parameters:{path:'report.md',edits:[{oldText:'before',newText:'after'}]}};
 try {
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async()=>{
   calls++;return new Response(syntheticReply('chat-completions',calls,calls===1?[request]:[]),{headers:{'content-type':'text/event-stream'}});
  }})!;
  await approve(f,0);await done;
  const snap=f.core.snapshot(f.thread);
  assert.equal(snap.runs[0]!.state,'completed');
  assert.equal(snap.operations[0]!.state,'succeeded');
  assert.equal(calls,2);
  assert.equal(readFileSync(join(f.cwd,'report.md'),'utf8'),tool==='read'?original:original.replace('before','after'));
  assert.equal(snap.artifacts.length,tool==='read'?0:1);
  f.reopen();f.supervisor.recover();assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'completed');
 } finally {await f.dispose();}
});

for (const changed of ['oversized','invalid-utf8'] as const) test(`M2 review interrupted read: ${changed} current file cannot block cleanup reconciliation`, async () => {
 const {f,access,plan}=setup();let calls=0;
 const fixture=join(repository,'apps/agent-server/tests/file-agent-worker.ts');
 const path=join(f.cwd,'report.md');writeFileSync(path,'# SYNTHETIC read-only input\n');
 try {
  const done=f.supervisor.startNext(plan,{path:fixture,extraRead:[fixture],args:['after-write']},{...access,fetch:async()=>{
   calls++;return new Response(syntheticReply('chat-completions',calls,[read]),{headers:{'content-type':'text/event-stream'}});
  }})!;
  await approve(f,0);await until(()=>existsSync(join(f.cwd,'.file-agent-stage')),'read-before-result');
  process.kill(f.supervisor.workerPid!,'SIGKILL');await done;
  assert.equal(f.core.snapshot(f.thread).operations[0]!.state,'unknown');
  // Explicit external edit after actual Worker cleanup. Do not restore or replay the read.
  const current=changed==='oversized'?Buffer.from('x'.repeat(16001)):Buffer.from([0xff,0xfe]);
  writeFileSync(path,current);const mtime=statSync(path,{bigint:true}).mtimeNs;
  f.reopen();f.supervisor.recover();
  const snap=f.core.snapshot(f.thread);assert.equal(snap.runs[0]!.state,'failed');
  assert.equal(snap.operations[0]!.state,'failed');assert.equal(snap.artifacts.length,0);
  assert.deepEqual(readFileSync(path),current);assert.equal(statSync(path,{bigint:true}).mtimeNs,mtime);
  f.supervisor.recover();assert.equal(f.core.snapshot(f.thread).cursor,snap.cursor);
  assert.equal(calls,1);assert.equal(f.core.modelAdmission(access.configuration,0.01).used,1);
 } finally {await f.dispose();}
});
