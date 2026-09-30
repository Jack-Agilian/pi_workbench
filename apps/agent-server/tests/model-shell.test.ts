import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { setupShell, approveShell, entry } from './model-shell-fixture.ts';
import { syntheticReply } from './file-agent-fixture.ts';
import { until } from './scenario.ts';
import { parseModelConfiguration } from '../../../packages/app-contracts/model.ts';
import { parseBashParameters } from '../../../packages/app-contracts/model-shell.ts';
import { assertTimeoutRevision, policyDigest } from '../model-policy.ts';
const bash=(command:string)=>({tool:'bash' as const,parameters:{command}});
for(const api of ['chat-completions','responses'] as const)test(`model Bash ${api}: separate approvals and receipts; nonzero returns to Pi then succeeds`,async()=>{
 const {f,access,plan}=setupShell(api);let calls=0;const bodies:string[]=[];
 try{
  const done=f.supervisor.startNext(plan,entry,{...access,fetch:async(_url,options)=>{
   bodies.push(String(options?.body));calls++;
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
for(const scenario of ['deny','cancel','timeout','limit','resource'] as const)test(`model Bash ${scenario}: fail closed, never silently repeat effects`,async()=>{
 const {f,access,plan}=setupShell();let calls=0;
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
  for(const value of [{command:'x',cwd:'/tmp'},{command:'x',timeout:31},{command:'x',env:{}},{command:'x'.repeat(4097)}])assert.throws(()=>parseBashParameters(value));
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
for(const phase of ['approval','launch','result'] as const)test(`model Bash actual App Server SIGKILL at ${phase}: closed inventory and per-command receipt, no replay`,async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'shell-host-crash-'))),manifest=join(dir,'checkpoint.json');
 const host=spawn(process.execPath,['--import',join(repository,'scripts/probe-no-network.mjs'),join(import.meta.dirname,'model-shell-host.ts'),manifest,phase],{cwd:dir,env:sterileEnvironment(dir),stdio:['ignore','ignore','inherit']});const exited=once(host,'exit');
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
  const old=new DatabaseSync(f.database);old.exec('DROP TABLE desktop_workspace; DROP TABLE model_shell_operations; PRAGMA user_version=8;');old.close();
  f.reopen();assert.deepEqual(f.core.snapshot(f.thread),before);assert.deepEqual(f.core.modelAdmission(access.configuration,0.01),admission);
  const db=new DatabaseSync(f.database,{readOnly:true});try{assert.equal(db.prepare('PRAGMA user_version').get()?.user_version,9);assert.equal(db.prepare('SELECT count(*) AS count FROM model_shell_operations').get()?.count,0);}finally{db.close();}
 }finally{await f.dispose();}
});
test('dynamic shell IPC has a closed argument set and preserves version/identity/size fences',()=>{
 const body={type:'shell-operation',toolCallId:'synthetic-call|1',parameters:{command:'printf SYNTHETIC'},resourceLock:'a'.repeat(64)};
 const envelope={version:IPC_VERSION,instanceId:'synthetic-worker',runtimeBindingId:'synthetic-binding',requestId:'synthetic-request',body};
 assert.deepEqual(parseEnvelope(envelope),envelope);
 for(const bad of [{...envelope,version:6},{...envelope,body:{...body,hostClean:true}},{...envelope,body:{...body,parameters:{command:'x',cwd:'/tmp'}}},{...envelope,body:{...body,parameters:{command:'x'.repeat(65536)}}}])assert.throws(()=>parseEnvelope(bad));
});

import { fileRunDuration } from '../../../packages/app-contracts/file-tools.ts';
for(const constrainedCost of [false,true])test(`unlimited request counts: native Pi continues beyond four; cost gate=${constrainedCost}`,async()=>{
 const {f,access,plan}=setupShell();let calls=0;
 delete plan.model.fileTools!.maxModelRequests;plan.model.shellTools!.maxCommands=6;
 access.configuration={...access.configuration,maxRequests:undefined,fileTools:{...plan.model.fileTools!},shellTools:{...plan.model.shellTools!},maxEstimatedCostUsd:constrainedCost?0.025:1};
 // Large envelope also exercises the guardian beyond the 32-bit setTimeout range.
 if(!constrainedCost){plan.model.timeoutMs=1800000;access.configuration.timeoutMs=1800000;access.reserveCostUsd=0.0001;}
 plan.deadline=Date.now()+fileRunDuration(plan.model.fileTools!,plan.model.timeoutMs,{total:access.configuration.maxEstimatedCostUsd,perRequest:access.reserveCostUsd});
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
