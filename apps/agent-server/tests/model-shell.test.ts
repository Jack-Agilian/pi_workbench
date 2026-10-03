import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { setupShell, approveShell, entry } from './model-shell-fixture.ts';
import { syntheticReply } from './file-agent-fixture.ts';
import { until } from './scenario.ts';
import { parseModelConfiguration } from '../../../packages/app-contracts/model.ts';
import { parseBashParameters } from '../../../packages/app-contracts/model-shell.ts';
import { assertTimeoutRevision, policyDigest } from '../model-policy.ts';
const bash=(command:string)=>({tool:'bash' as const,parameters:{command}});
test('automatic policy: actual Pi write/read/Bash, immutable Run mode and no replay after reopen',async()=>{
 const {f,access,plan}=setupShell('responses');let calls=0;
 try{
  f.supervisor.command({type:'runs.cancel',requestId:'cancel-fixture',runId:f.run});
  f.supervisor.command({type:'threads.permissions',requestId:'auto',threadId:f.thread,mode:'auto',expectedRevision:0});
  const start={type:'runs.start',requestId:'auto-run',threadId:f.thread,input:'SYNTHETIC automatic tools',permissionRevision:1};
  const run=f.supervisor.command(start).id;
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async(_url,options)=>{
   const wire=String(options?.body);assert.match(wire,/Every operation requires host authorization/);assert.doesNotMatch(wire,/requires separate human approval/);
   calls++;
   if(calls===1)f.supervisor.command({type:'threads.permissions',requestId:'manual-next',threadId:f.thread,mode:'manual',expectedRevision:1});
   const tools=calls===1?[{tool:'write' as const,parameters:{path:'auto.md',content:'# SYNTHETIC automatic\n'}}]:calls===2?[{tool:'read' as const,parameters:{path:'auto.md'}}]:calls===3?[bash('printf once >> effect.txt; if printf forbidden > ../outside.txt 2>/dev/null; then exit 9; fi')]:[];
   return new Response(syntheticReply('responses',calls,tools),{headers:{'content-type':'text/event-stream'}});
  }})!;
  await done;
  const snapshot=f.core.snapshot(f.thread);assert.equal(snapshot.runs.find(r=>r.id===run)!.state,'completed');
  assert.equal(snapshot.thread.permissionMode,'manual');assert.equal(snapshot.runs.find(r=>r.id===run)!.permissionMode,'auto');
  assert.deepEqual(snapshot.operations.map(o=>o.approvalSource),Array(3).fill('workspace-tools-v1'));
  assert.deepEqual(snapshot.operations.map(o=>o.state),Array(3).fill('succeeded'));
  assert.equal(calls,4);assert.equal(readFileSync(join(f.cwd,'effect.txt'),'utf8'),'once');assert.equal(existsSync(join(f.root,'outside.txt')),false);
  const modified=statSync(join(f.cwd,'effect.txt')).mtimeMs;
  f.reopen();f.supervisor.recover();assert.equal(f.supervisor.command(start).id,run);
  assert.equal(f.core.snapshot(f.thread).operations.length,3);assert.equal(statSync(join(f.cwd,'effect.txt')).mtimeMs,modified);
 }finally{await f.dispose();}
});

test('automatic Bash still supports active cancellation and fixed descendant cleanup',async()=>{
 const {f,access,plan}=setupShell('responses');
 try{
  f.supervisor.command({type:'runs.cancel',requestId:'cancel-fixture',runId:f.run});
  f.supervisor.command({type:'threads.permissions',requestId:'auto',threadId:f.thread,mode:'auto',expectedRevision:0});
  const run=f.supervisor.command({type:'runs.start',requestId:'auto-run',threadId:f.thread,input:'SYNTHETIC cancellation',permissionRevision:1}).id;
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async()=>new Response(syntheticReply('responses',1,[bash('sleep 20 & echo $! > child.pid; wait; printf late > late.txt')]),{headers:{'content-type':'text/event-stream'}})})!;
  await until(()=>existsSync(join(f.cwd,'child.pid')),'auto-child');const child=Number(readFileSync(join(f.cwd,'child.pid'),'utf8'));
  f.supervisor.command({type:'runs.cancel',requestId:'stop-auto',runId:run});await done;
  assert.equal(f.core.snapshot(f.thread).runs.find(r=>r.id===run)!.state,'cancelled');assert.equal(existsSync(join(f.cwd,'late.txt')),false);assert.throws(()=>process.kill(child,0));
 }finally{await f.dispose();}
});
for(const drift of ['file','resources'] as const)test(`automatic approval cannot bypass ${drift} change before claim`,async()=>{
 const {f,access,plan}=setupShell('responses');
 try{
  writeFileSync(join(f.cwd,'auto.md'),'# SYNTHETIC original\n');
  f.supervisor.command({type:'runs.cancel',requestId:'cancel-fixture',runId:f.run});
  f.supervisor.command({type:'threads.permissions',requestId:'auto',threadId:f.thread,mode:'auto',expectedRevision:0});
  const run=f.supervisor.command({type:'runs.start',requestId:'auto-run',threadId:f.thread,input:'SYNTHETIC drift',permissionRevision:1}).id;
  // Synchronous host subscription introduces real file drift after persistence, before the supervisor grants.
  const subscription=f.core.subscribe(f.thread,f.core.snapshot(f.thread).cursor,event=>{
   if(event.kind==='approval.automatic')writeFileSync(drift==='file'?join(f.cwd,'auto.md'):join(f.resources.root,'package.json'),drift==='file'?'# SYNTHETIC external\n':'{}');
  });
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async()=>new Response(syntheticReply('responses',1,[{tool:'write',parameters:{path:'auto.md',content:'# SYNTHETIC should not write\n'}}]),{headers:{'content-type':'text/event-stream'}})})!;
  await done;subscription.unsubscribe();
  assert.notEqual(f.core.snapshot(f.thread).runs.find(r=>r.id===run)!.state,'completed');
  assert.equal(readFileSync(join(f.cwd,'auto.md'),'utf8'),drift==='file'?'# SYNTHETIC external\n':'# SYNTHETIC original\n');
  assert.equal(f.core.snapshot(f.thread).operations[0]!.state,'denied');
 }finally{await f.dispose();}
});
for(const api of ['chat-completions','responses'] as const)test(`model Bash ${api}: separate approvals and receipts; nonzero returns to Pi then succeeds`,async()=>{
 const {f,access,plan}=setupShell(api);let calls=0;const bodies:string[]=[];
 try{
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async(_url,options)=>{
   bodies.push(String(options?.body));calls++;
   assert.match(bodies.at(-1)!,/Every operation requires host authorization/);assert.doesNotMatch(bodies.at(-1)!,/requires separate human approval/);
   const tools=calls===1?[bash('printf SYNTHETIC-first; exit 7')]:calls===2?[bash('printf SYNTHETIC-second >> result.txt')]:[];
   return new Response(syntheticReply(api,calls,tools),{headers:{'content-type':'text/event-stream'}});
  }})!;
  assert.equal(f.supervisor.startNext(plan,entry),done);
  const first=await approveShell(f);const second=await approveShell(f);await done;
  const snap=f.core.snapshot(f.thread);assert.equal(snap.runs[0]!.state,'completed');assert.deepEqual(snap.operations.map(o=>o.state),['failed','succeeded']);
  assert.equal(snap.operations[0]!.shell!.outcome!.exitCode,7);assert.ok(bodies[1]!.includes('SYNTHETIC-first'));assert.ok(bodies[1]!.includes('7'));
  assert.equal(calls,3);assert.equal(readFileSync(join(f.cwd,'result.txt'),'utf8'),'SYNTHETIC-second');
  const journal=JSON.parse(f.core.workerLaunches()[0]!.record) as {lease:string};
  for(const op of [first,second])assert.equal(JSON.parse(readFileSync(join(journal.lease,op.id+'.json'),'utf8')).operationId,op.id);
  assert.equal(readdirSync(journal.lease).filter(n=>n===first.id+'.json'||n===second.id+'.json').length,2);
  const time=statSync(join(f.cwd,'result.txt')).mtimeMs;f.reopen();f.supervisor.recover();assert.equal(statSync(join(f.cwd,'result.txt')).mtimeMs,time);assert.equal(f.core.snapshot(f.thread).operations.length,2);
 }finally{await f.dispose();}
});
for(const uncapped of [false,true])for(const scenario of ['deny','cancel','timeout','limit','resource'] as const)test(`model Bash ${scenario}, uncapped=${uncapped}: fail closed, never silently repeat effects`,async()=>{
 const {f,access,plan}=setupShell('chat-completions',uncapped);let calls=0;
 if(scenario==='limit'){plan.model.shellTools!.maxCommands=1;access.configuration.shellTools!.maxCommands=1;}
 try{
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async()=>{
   calls++;return new Response(syntheticReply('chat-completions',calls,calls<=2?[{tool:'bash',parameters:{command:scenario==='cancel'||scenario==='timeout'?'printf started > marker; sleep 20; printf late > late.txt':'printf once >> result.txt',...(scenario==='timeout'?{timeout:0.2}:{})}}]:[]),{headers:{'content-type':'text/event-stream'}});
  }})!;
  if(scenario==='resource'){
   await until(()=>f.core.snapshot(f.thread).operations.some(o=>o.state==='pending'),'resource-approval');
   const {writeFileSync}=await import('node:fs');writeFileSync(join(f.resources.root,'package.json'),'{}');
  }
  await approveShell(f,scenario==='deny'?'deny':'allow');
  if(scenario==='cancel'){
   await until(()=>existsSync(join(f.cwd,'marker')),'running-command');f.supervisor.command({type:'runs.cancel',requestId:'cancel-shell',runId:f.run});
  }
  await done;if(f.core.snapshot(f.thread).runs[0]!.state==='unknown'){f.reopen();f.supervisor.recover();}
  const snap=f.core.snapshot(f.thread);assert.notEqual(snap.runs[0]!.state,'completed');assert.equal(calls,scenario==='limit'?2:1);
  assert.equal(existsSync(join(f.cwd,'late.txt')),false);
  if(scenario==='deny'||scenario==='resource')assert.equal(existsSync(join(f.cwd,'result.txt')),false);
  if(scenario==='limit')assert.equal(readFileSync(join(f.cwd,'result.txt'),'utf8'),'once');
  if(scenario==='cancel')assert.equal(snap.runs[0]!.state,'cancelled');
 }finally{await f.dispose();}
});
test('model Bash policy: old config stays closed, timeout revision cannot add shell and unknown parameters fail',async()=>{
 const {f,access}=setupShell();try{
  const config=access.configuration;const old={...config};delete old.shellTools;
  assert.throws(()=>assertTimeoutRevision(old,config),/scope/);assert.notEqual(policyDigest(old),policyDigest(config));
  assert.equal(parseModelConfiguration(old).shellTools,undefined);
  for(const value of [{command:'x',cwd:'/tmp'},{command:'x',timeout:86401},{command:'x',env:{}},{command:'x'.repeat(4097)}])assert.throws(()=>parseBashParameters(value));
 }finally{await f.dispose();}
});

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { repository, sterileEnvironment } from '../worker-launcher.ts';
import { ProductCore } from '../core.ts';
import { WorkerSupervisor } from '../worker-supervisor.ts';
import type { ResourceSelection } from '../../../packages/app-contracts/worker-ipc.ts';
for(const uncapped of [false,true])for(const phase of ['approval','launch','result'] as const)test(`model Bash actual App Server SIGKILL at ${phase}, uncapped=${uncapped}: closed inventory and per-command receipt, no replay`,async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'shell-host-crash-'))),manifest=join(dir,'checkpoint.json');
 const host=spawn(process.execPath,['--import',join(repository,'scripts/probe-no-network.mjs'),join(import.meta.dirname,'model-shell-host.ts'),manifest,phase,uncapped?'uncapped':'bounded'],{cwd:dir,env:sterileEnvironment(dir),stdio:['ignore','ignore','inherit']});const exited=once(host,'exit');
 let core:ProductCore|undefined;let m:{root:string;cwd:string;database:string;thread:string;resources:ResourceSelection;workerPid:number}|undefined;
 try{
  assert.equal((await exited)[1],'SIGKILL');m=JSON.parse(readFileSync(manifest,'utf8')) as NonNullable<typeof m>;
  core=new ProductCore(m.database,[{id:'workspace',path:m.cwd}]);const supervisor=new WorkerSupervisor(core,{stateDirectory:join(m.root,'state'),databaseDirectory:join(m.root,'host'),resources:m.resources});
  const journal=JSON.parse(core.workerLaunches()[0]!.record) as {spec:{receipt:string};lease:string};await until(()=>existsSync(journal.spec.receipt),'guardian-clean');
  const file=join(m.cwd,'effect.txt');const time=existsSync(file)?statSync(file).mtimeMs:null;
  assert.equal(existsSync(file),phase==='result');
  supervisor.recover();const snapshot=core.snapshot(m.thread);assert.equal(snapshot.runs[0]!.state,'failed');assert.equal(snapshot.operations[0]!.state,phase==='approval'?'denied':phase==='launch'?'failed':'succeeded');
  if(phase==='launch')assert.equal(snapshot.operations[0]!.shell!.outcome!.sideEffects,'not-started');
  if(phase==='result'){assert.equal(readFileSync(file,'utf8'),'once');assert.equal(statSync(file).mtimeMs,time);}
  supervisor.recover();assert.equal(core.snapshot(m.thread).cursor,snapshot.cursor);assert.throws(()=>process.kill(m!.workerPid,0));
 }finally{if(host.exitCode===null&&host.signalCode===null)host.kill('SIGKILL');core?.close();if(m)rmSync(m.root,{recursive:true,force:true});rmSync(dir,{recursive:true,force:true});}
});
test('model Bash real Worker death while command runs: descendants stop, effect remains unknown, no replay',async()=>{
 const {f,access,plan}=setupShell();let calls=0;
 try{
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async()=>{calls++;return new Response(syntheticReply('chat-completions',calls,[bash('printf started > marker; sleep 20 & echo $! > child.pid; wait; printf late > late.txt')]),{headers:{'content-type':'text/event-stream'}});}})!;
  await approveShell(f);await until(()=>existsSync(join(f.cwd,'child.pid')),'descendant');const child=Number(readFileSync(join(f.cwd,'child.pid'),'utf8'));
  process.kill(f.supervisor.workerPid!,'SIGKILL');await done;assert.throws(()=>process.kill(child,0));assert.equal(existsSync(join(f.cwd,'late.txt')),false);
  f.reopen();assert.throws(()=>f.supervisor.recover(),/shell_side_effect_unresolved/);assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'unknown');assert.equal(calls,1);
 }finally{await f.dispose();}
});
test('dynamic Bash cannot read or create the synthetic host SQLite database',async()=>{
 const {f,access,plan}=setupShell();let calls=0;
 const quote=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'";
 try{
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async()=>{
   calls++;const script=`const {DatabaseSync}=require('node:sqlite');let denied=0;for(const [p,opts] of [[${JSON.stringify(f.database)},{readOnly:true}],[${JSON.stringify(join(f.root,'host','new.sqlite'))},{}]]){try{new DatabaseSync(p,opts).close()}catch{denied++}};console.log('database-denied='+denied);process.exit(denied===2?0:1)`;
   return new Response(syntheticReply('chat-completions',calls,calls===1?[bash(quote(process.execPath)+' -e '+quote(script))]:[]),{headers:{'content-type':'text/event-stream'}});
  }})!;
  await approveShell(f);await done;assert.match(f.core.snapshot(f.thread).operations[0]!.shell!.outcome!.stdout,/database-denied=2/);assert.equal(existsSync(join(f.root,'host','new.sqlite')),false);
 }finally{await f.dispose();}
});

import { DatabaseSync } from 'node:sqlite';
import { parseEnvelope, IPC_VERSION } from '../../../packages/app-contracts/worker-ipc.ts';
test('v8 migration preserves existing Run/Operation/model records; shell and workspace tables are additive',async()=>{
 const {f,access,plan}=setupShell();let calls=0;try{
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async()=>{calls++;return new Response(syntheticReply('chat-completions',calls,calls===1?[{tool:'write',parameters:{path:'migration.md',content:'# SYNTHETIC migration'}}]:[]),{headers:{'content-type':'text/event-stream'}});}})!;
  await approveShell(f);await done;const admission=f.core.modelAdmission(access.configuration,0.01);
  const before=f.core.snapshot(f.thread);f.core.close();
  const old=new DatabaseSync(f.database);old.exec('ALTER TABLE threads DROP COLUMN permission_mode; ALTER TABLE threads DROP COLUMN permission_revision; ALTER TABLE runs DROP COLUMN permission_mode; ALTER TABLE runs DROP COLUMN permission_revision; ALTER TABLE approvals DROP COLUMN source; DROP TABLE desktop_workspace; DROP TABLE model_shell_operations; PRAGMA user_version=8;');old.close();
  f.reopen();assert.deepEqual(f.core.snapshot(f.thread),before);assert.deepEqual(f.core.modelAdmission(access.configuration,0.01),admission);
  const db=new DatabaseSync(f.database,{readOnly:true});try{assert.equal(db.prepare('PRAGMA user_version').get()?.user_version,11);assert.equal(db.prepare('SELECT count(*) AS count FROM model_shell_operations').get()?.count,0);}finally{db.close();}
 }finally{await f.dispose();}
});
test('dynamic shell IPC has a closed argument set and preserves version/identity/size fences',()=>{
 const body={type:'shell-operation',toolCallId:'synthetic-call|1',parameters:{command:'printf SYNTHETIC'},resourceLock:'a'.repeat(64)};
 const envelope={version:IPC_VERSION,instanceId:'synthetic-worker',runtimeBindingId:'synthetic-binding',requestId:'synthetic-request',body};
 assert.deepEqual(parseEnvelope(envelope),envelope);
 for(const bad of [{...envelope,version:6},{...envelope,body:{...body,hostClean:true}},{...envelope,body:{...body,parameters:{command:'x',cwd:'/tmp'}}},{...envelope,body:{...body,parameters:{command:'x'.repeat(65536)}}}])assert.throws(()=>parseEnvelope(bad));
});

import { fileRunDuration } from '../../../packages/app-contracts/file-tools.ts';
for(const costMode of ['bounded','exhausted','uncapped'])test(`unlimited request counts: native Pi continues beyond four; cost gate=${costMode}`,async()=>{
 const constrainedCost=costMode==='exhausted';
 const {f,access,plan}=setupShell();let calls=0;
 delete plan.model.fileTools!.maxModelRequests;plan.model.shellTools!.maxCommands=6;
 access.configuration={...access.configuration,maxRequests:undefined,fileTools:{...plan.model.fileTools!},shellTools:{...plan.model.shellTools!},maxEstimatedCostUsd:constrainedCost?0.025:1};
 // Large envelope also exercises the guardian beyond the 32-bit setTimeout range.
 if(!constrainedCost){plan.model.timeoutMs=1800000;access.configuration.timeoutMs=1800000;access.reserveCostUsd=0.0001;}
 plan.deadline=Date.now()+fileRunDuration(plan.model.fileTools!,plan.model.timeoutMs,{total:access.configuration.maxEstimatedCostUsd,perRequest:access.reserveCostUsd})!;
 if(costMode==='uncapped'){delete access.configuration.maxEstimatedCostUsd;plan.deadline=null;access.reserveCostUsd=100;}
 try{
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async()=>{
   calls++;return new Response(syntheticReply('chat-completions',calls,calls<=5?[bash('printf x >> count.txt')]:[]),{headers:{'content-type':'text/event-stream'}});
  }})!;
  const operations=constrainedCost?2:5;
  for(let i=0;i<operations;i++)await approveShell(f);
  await done;
  assert.equal(calls,constrainedCost?2:6);
  assert.equal(readFileSync(join(f.cwd,'count.txt'),'utf8'),'x'.repeat(operations));
  const snap=f.core.snapshot(f.thread);assert.equal(snap.runs[0]!.state,constrainedCost?'failed':'completed');
  assert.equal(f.core.modelAdmission(access.configuration,access.reserveCostUsd).status,constrainedCost?'budget_exhausted':'ready');
 }finally{await f.dispose();}
});

import { validateModelPayload } from '../../../packages/pi-adapter/model-catalog.ts';
test('bundled gpt-6-luna strict schemas: actual Pi payload admitted, mutations rejected, nullable optional arguments normalized',async()=>{
 const {f,access,plan}=setupShell('responses');let calls=0;
 delete plan.model.openai;plan.model.model='gpt-6-luna';delete access.configuration.openai;access.configuration.model=plan.model.model;
 try{
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async(_url,options)=>{
   calls++;const body=String(options?.body),payload=JSON.parse(body) as {tools:{name:string;strict:boolean;parameters:{additionalProperties:boolean;properties:Record<string,unknown>}}[]};
   assert.ok(payload.tools.every(t=>t.strict===true&&t.parameters.additionalProperties===false));
   validateModelPayload(plan.model,access.requestUrl,body);
   for(const mutate of [(p:typeof payload)=>{p.tools[0]!.parameters.additionalProperties=true;},(p:typeof payload)=>{p.tools[0]!.parameters.properties['unapproved']={type:'string'};},(p:typeof payload)=>{p.tools[0]!.name='unapproved';}]){
    const altered=structuredClone(payload);mutate(altered);assert.throws(()=>validateModelPayload(plan.model,access.requestUrl,JSON.stringify(altered)),/schema/);
   }
   // Explicit synthetic nullable wire arguments; Pi converts strict optional nulls back to omitted values.
   const reply=calls===1?syntheticReply('responses',calls,[{tool:'bash',parameters:{command:'printf SYNTHETIC > strict.md',timeout:0.001}}]).replaceAll('0.001','null'):
    calls===2?syntheticReply('responses',calls,[{tool:'read',parameters:{path:'strict.md',offset:0.001,limit:0.001}}]).replaceAll('0.001','null'):syntheticReply('responses',calls);
   return new Response(reply,{headers:{'content-type':'text/event-stream'}});
  }})!;
  await approveShell(f);await approveShell(f);await done;
  assert.equal(calls,3);assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'completed');assert.equal(readFileSync(join(f.cwd,'strict.md'),'utf8'),'SYNTHETIC');
  assert.deepEqual(f.core.snapshot(f.thread).operations.map(o=>[o.tool,o.state]),[['bash','succeeded'],['read','succeeded']]);
 }finally{await f.dispose();}
});

for(const mixed of [false,true])test(`R02 sixteen approved operations, mixed=${mixed}: native Pi completes without consuming display replay quota`,async()=>{
 const {f,access,plan}=setupShell();let calls=0;
 delete plan.model.fileTools!.maxModelRequests;plan.model.fileTools!.maxOperations=16;plan.model.shellTools!.maxCommands=16;
 access.configuration={...access.configuration,maxRequests:undefined,fileTools:{...plan.model.fileTools!},shellTools:{...plan.model.shellTools!}};
 plan.deadline=Date.now()+90000;
 try{
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async()=>{
   calls++;const tools=calls>16?[]:mixed&&calls%2===0?[{tool:'write' as const,parameters:{path:`mixed-${calls}.md`,content:'# SYNTHETIC mixed'}}]:[bash('printf x >> sixteen.txt')];
   return new Response(syntheticReply('chat-completions',calls,tools),{headers:{'content-type':'text/event-stream'}});
  }})!;
  for(let i=0;i<16;i++)await approveShell(f);await done;
  const snapshot=f.core.snapshot(f.thread);assert.equal(snapshot.runs[0]!.state,'completed');assert.equal(calls,17);
  assert.equal(snapshot.operations.length,16);assert.ok(snapshot.operations.every(o=>o.state==='succeeded'));
  let page=f.core.operationPage(f.run,{limit:5});const ids=page.items.map(op=>op.id);
  while(page.hasMore){page=f.core.operationPage(f.run,{limit:5,cursor:page.nextCursor!});ids.push(...page.items.map(op=>op.id));}
  assert.deepEqual(ids,snapshot.operations.map(op=>op.id).reverse());assert.equal(new Set(ids).size,16);
  assert.equal(readFileSync(join(f.cwd,'sixteen.txt'),'utf8'),'x'.repeat(mixed?8:16));
 }finally{await f.dispose();}
});

for(const phase of ['http','approval','between-phases'] as const)test(`uncapped Run still stops stalled ${phase} and records real process cleanup`,async()=>{
 const {f,access,plan}=setupShell('chat-completions',true);let calls=0;
 if(phase==='http'){plan.model.timeoutMs=250;access.configuration.timeoutMs=250;}
 if(phase==='approval'){plan.model.fileTools!.operationTimeoutMs=250;}
 try{
  const selected=phase==='between-phases'?{path:join(import.meta.dirname,'protocol-fixture.ts'),extraRead:[join(import.meta.dirname,'protocol-fixture.ts')],args:['idle']}:entry;
  const done=f.supervisor.startNext(plan,selected,{...access,fetch:async(_url,options)=>{
   calls++;
   if(phase==='http')return await new Promise<Response>((_resolve,reject)=>options!.signal!.addEventListener('abort',()=>reject(new Error('SYNTHETIC abort')),{once:true}));
   return new Response(syntheticReply('chat-completions',calls,[bash('printf forbidden > forbidden.txt')]),{headers:{'content-type':'text/event-stream'}});
  }})!;
  if(phase==='between-phases')await until(()=>f.core.snapshot(f.thread).runs[0]!.state==='running','ready before phase timeout');
  const started=Date.now();await done;
  if(phase==='between-phases')assert.ok(Date.now()-started>=4000,'must exercise host phase watchdog');
  const journal=JSON.parse(f.core.workerLaunches()[0]!.record) as {spec:{receipt:string}};
  const receipt=JSON.parse(readFileSync(journal.spec.receipt,'utf8')) as {exited:boolean;groupGone:boolean};
  assert.equal(receipt.exited,true);assert.equal(receipt.groupGone,true);
  assert.notEqual(f.core.snapshot(f.thread).runs[0]!.state,'completed');
  assert.equal(existsSync(join(f.cwd,'forbidden.txt')),false);assert.equal(calls,phase==='between-phases'?0:1);
 }finally{await f.dispose();}
});

test('product defaults: actual Pi performs 44 separately approved Bash operations without validation quotas',async()=>{
 const {f,access,plan}=setupShell('responses',true);let calls=0;
 delete plan.model.fileTools!.maxOperations;delete plan.model.shellTools!.maxCommands;delete plan.model.shellTools!.timeoutMs;
 delete plan.model.maxOutputTokens;delete access.configuration.maxOutputTokens;
 plan.model.openai!.maxTokens=8192;
 try{
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async(_url,options)=>{
   const payload=JSON.parse(String(options?.body)) as {max_output_tokens:number};assert.ok(payload.max_output_tokens>512);assert.ok(payload.max_output_tokens<=8192);
   calls++;return new Response(syntheticReply('responses',calls,calls<=44?[bash(':')]:[]),{headers:{'content-type':'text/event-stream'}});
  }})!;
  for(let i=0;i<44;i++)await approveShell(f);
  await done;const snapshot=f.core.snapshot(f.thread);assert.equal(calls,45);assert.equal(snapshot.runs[0]!.state,'completed');assert.equal(snapshot.operations.length,44);assert.ok(snapshot.operations.every(o=>o.state==='succeeded'));
 }finally{await f.dispose();}
});
test('product Bash default has no forced 30-second timeout: real 31-second command completes',async()=>{
 const {f,access,plan}=setupShell('chat-completions',true);let calls=0;
 delete plan.model.shellTools!.timeoutMs;plan.model.fileTools!.operationTimeoutMs=60000;
 try{
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async()=>{
   calls++;return new Response(syntheticReply('chat-completions',calls,calls===1?[bash('sleep 31; printf SYNTHETIC > beyond-30.txt')]:[]),{headers:{'content-type':'text/event-stream'}});
  }})!;
  const op=await approveShell(f);assert.equal(op.shell!.intent.timeoutMs,null);
  await done;assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'completed');assert.equal(readFileSync(join(f.cwd,'beyond-30.txt'),'utf8'),'SYNTHETIC');
 }finally{await f.dispose();}
});

test('native absolute workspace Markdown paths normalize before approval; outside paths produce safe failure projection',async()=>{
 const {f,access,plan}=setupShell('responses',true);let calls=0;
 const file=join(f.cwd,'absolute.md');
 try{
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async()=>{
   calls++;
   const tools=calls===1?[{tool:'write' as const,parameters:{path:file,content:'# SYNTHETIC Draft'}}]:calls===2?[{tool:'edit' as const,parameters:{path:file,edits:[{oldText:'Draft',newText:'Verified'}]}}]:calls===3?[{tool:'read' as const,parameters:{path:file}}]:calls===4?[{tool:'write' as const,parameters:{path:join(f.root,'outside.md'),content:'FORBIDDEN'}}]:[];
   return new Response(syntheticReply('responses',calls,tools),{headers:{'content-type':'text/event-stream'}});
  }})!;
  for(let i=0;i<3;i++){const op=await approveShell(f);assert.equal(op.artifactPath,'absolute.md');}
  await done;assert.equal(readFileSync(file,'utf8'),'# SYNTHETIC Verified');assert.equal(existsSync(join(f.root,'outside.md')),false);
  const snap=f.core.snapshot(f.thread);assert.deepEqual(snap.operations.map(o=>[o.tool,o.state]),[['write','succeeded'],['edit','succeeded'],['read','succeeded']]);
  assert.ok(f.core.presentation(f.run).messages.some(m=>m.role==='tool' && m.text.includes('write 调用未成功')));
  assert.ok(!JSON.stringify(f.core.presentation(f.run)).includes(f.root));
 }finally{await f.dispose();}
});
