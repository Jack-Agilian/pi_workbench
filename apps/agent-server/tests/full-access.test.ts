import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, statSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fullScenario } from './full-access-fixture.ts';
import { syntheticReply } from './file-agent-fixture.ts';
import { entry } from './model-shell-fixture.ts';
import { until } from './scenario.ts';
import { repository, sterileEnvironment } from '../worker-launcher.ts';
import { ProductCore } from '../core.ts';
import { WorkerSupervisor } from '../worker-supervisor.ts';
import type { ResourceSelection } from '../../../packages/app-contracts/worker-ipc.ts';
import { createScenario } from './scenario.ts';
const quote=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'";

test('full Run: real Pi external text write/read/edit and Bash, fixed mode, one claim, native resume without replay',async()=>{
  const x=fullScenario(),{f}=x;let calls=0;
  const target=join(x.outside,'notes.txt');
  try {
    const fetch:typeof globalThis.fetch=async(_url,options)=>{
      calls++; const body=String(options?.body);assert.ok(body.includes('outside the workspace'));
      return new Response(syntheticReply('responses',calls,calls===1?[
        {tool:'write',parameters:{path:target,content:'SYNTHETIC first'}},
        {tool:'read',parameters:{path:target}},
        {tool:'edit',parameters:{path:target,edits:[{oldText:'first',newText:'edited'}]}},
        {tool:'write',parameters:{path:'report.md',content:'# SYNTHETIC workspace artifact'}},
        {tool:'bash',parameters:{command:`printf once >> ${quote(join(x.outside,'count'))}`}},
      ]:[]),{headers:{'content-type':'text/event-stream'}});
    };
    const done=x.supervisor.startNext(x.plan,entry,{...x.access,fetch})!;
    assert.equal(x.supervisor.startNext(x.plan,entry,{...x.access,fetch}),done);
    assert.equal(x.supervisor.command(x.command).id,x.run);
    x.supervisor.command({type:'threads.permissions',requestId:'next-manual',threadId:f.thread,mode:'manual',expectedRevision:1});
    await done;
    const snap=f.core.snapshot(f.thread),run=snap.runs.find(r=>r.id===x.run)!;
    assert.equal(run.state,'completed',JSON.stringify(snap.operations));assert.equal(run.permissionMode,'full');assert.equal(snap.thread.permissionMode,'manual');
    assert.equal(snap.operations.length,5);assert.ok(snap.operations.every(o=>o.state==='succeeded'&&o.approvalSource==='full-tools-v1'));
    assert.equal(snap.operations[4]!.shell!.intent.profile,'full-bash-v1');
    assert.equal(readFileSync(target,'utf8'),'SYNTHETIC edited');assert.equal(readFileSync(join(x.outside,'count'),'utf8'),'once');
    assert.equal(snap.artifacts.length,1);assert.equal(snap.artifacts[0]!.path,'report.md');
    const native=f.core.nativeSessionReference(f.thread);assert.equal(native.persisted,true);const stamp=statSync(target,{bigint:true}).mtimeNs;
    await x.supervisor.close();x.reopen();x.supervisor.recover();x.supervisor.recover();
    assert.equal(f.core.nativeSessionReference(f.thread).reference,native.reference);assert.equal(statSync(target,{bigint:true}).mtimeNs,stamp);
    assert.equal(x.supervisor.startNext(x.plan,entry,{...x.access,fetch}),undefined);assert.equal(calls,2);
    x.supervisor.command({type:'threads.permissions',requestId:'resume-full',threadId:f.thread,mode:'full',expectedRevision:2});
    x.supervisor.command({type:'runs.start',requestId:'resume',threadId:f.thread,input:'SYNTHETIC original context',permissionRevision:3});
    await x.supervisor.startNext({...x.plan,deadline:Date.now()+30000},entry,{...x.access,fetch:async(_url,options)=>{
      assert.ok(String(options?.body).includes('Successfully replaced'));return new Response(syntheticReply('responses',3),{headers:{'content-type':'text/event-stream'}});
    }});
    assert.equal(statSync(target,{bigint:true}).mtimeNs,stamp);assert.equal(readFileSync(join(x.outside,'count'),'utf8'),'once');
  } finally {await x.dispose();}
});

test('full Run native tools cannot read/write private host files or overwrite runtime code',async()=>{
  const x=fullScenario(),{f}=x;let calls=0;
  const secret=join(f.root,'host','canary.txt');writeFileSync(secret,'SYNTHETIC_SECRET');
  try {
    await x.supervisor.startNext(x.plan,entry,{...x.access,fetch:async()=>new Response(syntheticReply('responses',++calls,calls===1?[
      {tool:'read',parameters:{path:secret}},{tool:'write',parameters:{path:secret,content:'not allowed'}},
      {tool:'write',parameters:{path:join(repository,'SYNTHETIC_MUST_NOT_EXIST.txt'),content:'not allowed'}},
    ]:[]),{headers:{'content-type':'text/event-stream'}})});
    assert.equal(f.core.snapshot(f.thread).operations.length,0);assert.equal(readFileSync(secret,'utf8'),'SYNTHETIC_SECRET');
    assert.equal(existsSync(join(repository,'SYNTHETIC_MUST_NOT_EXIST.txt')),false);
  } finally {await x.dispose();}
});

test('full Run Worker killed after external write: reopen actual product DB and only verify, never write again',async()=>{
  const x=fullScenario(),{f}=x;const target=join(x.outside,'lost.txt');
  const path=join(repository,'apps/agent-server/tests/file-agent-worker.ts');
  try {
    const done=x.supervisor.startNext(x.plan,{path,extraRead:[path],args:['after-write']},{...x.access,fetch:async()=>new Response(syntheticReply('responses',1,[{tool:'write',parameters:{path:target,content:'SYNTHETIC lost result'}}]),{headers:{'content-type':'text/event-stream'}})})!;
    void done.catch(()=>{});await until(()=>existsSync(join(f.cwd,'.file-agent-stage')),'external written');
    const before=statSync(target,{bigint:true}).mtimeNs;process.kill(x.supervisor.workerPid!,'SIGKILL');await done;
    assert.equal(f.core.snapshot(f.thread).operations[0]!.state,'unknown');
    await x.supervisor.close();x.reopen();x.supervisor.recover();x.supervisor.recover();
    const snap=f.core.snapshot(f.thread);assert.equal(snap.operations[0]!.state,'succeeded');assert.equal(snap.runs.find(r=>r.id===x.run)!.state,'failed');assert.equal(snap.artifacts.length,0);
    assert.equal(statSync(target,{bigint:true}).mtimeNs,before);assert.equal(readFileSync(target,'utf8'),'SYNTHETIC lost result');assert.equal(f.core.workerLaunches().length,1);
  } finally {await x.dispose();}
});

test('full product Worker SQLite denial and actual guardian Bash loopback access',async()=>{
  const x=fullScenario(),{f}=x;let calls=0;
  const path=join(repository,'apps/agent-server/tests/file-agent-worker.ts');
  const code=`const h=require('node:http'),a=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');a.throws(()=>new DatabaseSync(${JSON.stringify(f.database)}));a.throws(()=>new DatabaseSync(${JSON.stringify(f.database+'.shell-forbidden')}));const s=h.createServer((q,r)=>r.end('SYNTHETIC_LOOPBACK'));s.listen(0,'127.0.0.1',()=>h.get('http://127.0.0.1:'+s.address().port,r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>{a.equal(b,'SYNTHETIC_LOOPBACK');s.close();console.log(b)})}));`;
  try {
    await x.supervisor.startNext(x.plan,{path,extraRead:[path],args:['full-isolation',f.database]},{...x.access,fetch:async()=>new Response(syntheticReply('responses',++calls,calls===1?[{tool:'bash',parameters:{command:`${quote(process.execPath)} -e ${quote(code)}`}}]:[]),{headers:{'content-type':'text/event-stream'}})});
    assert.equal(readFileSync(join(f.cwd,'.full-isolation'),'utf8'),'SYNTHETIC actual Pi Worker SQLite denial');
    const snap=f.core.snapshot(f.thread);assert.equal(snap.runs.find(r=>r.id===x.run)!.state,'completed');assert.equal(snap.operations[0]!.shell!.outcome!.exitCode,0);assert.match(snap.operations[0]!.shell!.outcome!.stdout,/SYNTHETIC_LOOPBACK/);
    assert.equal(existsSync(f.database+'.forbidden'),false);assert.equal(existsSync(f.database+'.shell-forbidden'),false);
  } finally {await x.dispose();}
});

test('full active cancel cleans external Bash side effects; switching the thread cannot revoke the old Run identity',async()=>{
  const x=fullScenario(),{f}=x;const heartbeat=join(x.outside,'heartbeat');
  try {
    const done=x.supervisor.startNext(x.plan,entry,{...x.access,fetch:async()=>new Response(syntheticReply('responses',1,[{tool:'bash',parameters:{command:`while :; do printf . >> ${quote(heartbeat)}; sleep 0.05; done`}}]),{headers:{'content-type':'text/event-stream'}})})!;
    await until(()=>existsSync(heartbeat),'external active command');
    x.supervisor.command({type:'threads.permissions',requestId:'switch-manual',threadId:f.thread,mode:'manual',expectedRevision:1});
    x.supervisor.command({type:'runs.cancel',requestId:'cancel',runId:x.run});await done;
    await x.supervisor.close();x.reopen();x.supervisor.recover();
    const snap=f.core.snapshot(f.thread);assert.equal(snap.runs.find(r=>r.id===x.run)!.state,'cancelled');assert.equal(snap.operations[0]!.shell!.outcome!.sideEffects,'possible');
    const stamp=statSync(heartbeat,{bigint:true}).mtimeNs;await new Promise(r=>setTimeout(r,120));assert.equal(statSync(heartbeat,{bigint:true}).mtimeNs,stamp);
  } finally {await x.dispose();}
});

for(const fault of ['version','cancel','resource'] as const)test(`full claim ${fault}: automatic approval never bypasses the original preconditions`,async()=>{
  const x=fullScenario(),{f}=x;const target=join(x.outside,'precondition.txt');
  writeFileSync(target,'SYNTHETIC before');let injected=false;
  const unsubscribe=f.core.subscribe(f.thread,0,event=>{
    if(event.runId!==x.run||event.kind!=='approval.automatic'||injected)return;injected=true;
    if(fault==='version')writeFileSync(target,'SYNTHETIC concurrent version');
    else if(fault==='resource')writeFileSync(join(f.resources.root,'package.json'),'SYNTHETIC changed resource');
    else x.supervisor.command({type:'runs.cancel',requestId:'cancel-before-claim',runId:x.run});
  });
  try {
    await x.supervisor.startNext(x.plan,entry,{...x.access,fetch:async()=>new Response(syntheticReply('responses',1,[{tool:'write',parameters:{path:target,content:'SYNTHETIC must not execute'}}]),{headers:{'content-type':'text/event-stream'}})});
    assert.equal(injected,true);assert.equal(readFileSync(target,'utf8'),fault==='version'?'SYNTHETIC concurrent version':'SYNTHETIC before');
    assert.equal(f.core.snapshot(f.thread).operations[0]!.state,'denied');
  } finally {unsubscribe.unsubscribe();await x.dispose();}
});

test('current-channel forged file request cannot make the host read or overwrite a private target',async()=>{
  const x=fullScenario(),{f}=x;const target=join(f.root,'host','canary.txt');writeFileSync(target,'SYNTHETIC private');
  const path=join(repository,'apps/agent-server/tests/file-agent-worker.ts');
  try {
    await x.supervisor.startNext(x.plan,{path,extraRead:[path],args:['forged-file',target,f.resources.id]},x.access);
    assert.equal(readFileSync(join(f.cwd,'.file-agent-stage'),'utf8'),'forged-file');
    const snap=f.core.snapshot(f.thread);assert.equal(snap.runs.find(r=>r.id===x.run)!.state,'unknown');assert.equal(snap.operations.length,0);
    assert.equal(readFileSync(target,'utf8'),'SYNTHETIC private');
    await x.supervisor.close();x.reopen();x.supervisor.recover();
    assert.equal(f.core.snapshot(f.thread).runs.find(r=>r.id===x.run)!.state,'failed');
    assert.equal(f.core.snapshot(f.thread).operations.length,0);assert.equal(readFileSync(target,'utf8'),'SYNTHETIC private');
  } finally {await x.dispose();}
});

test('SQL v10 migration retains manual/auto requests and revisions, foreign keys, and rejects invalid modes',async()=>{
  const f=createScenario();
  try {
    const policy={type:'threads.permissions',requestId:'old-auto',threadId:f.thread,mode:'auto',expectedRevision:0};f.core.handle(policy);
    f.core.handle({type:'runs.start',requestId:'old-queued',threadId:f.thread,input:'SYNTHETIC old auto',permissionRevision:1});
    // Module-only migration fixture: preserve an actual old automatic approval row.
    // These state transitions test SQL migration, not process cleanup evidence.
    f.core.handle({type:'runs.cancel',requestId:'old-cancel',runId:f.run});
    const binding=f.core.dispatchNext()!;f.core.markRunning(binding);
    f.core.requestOperation(binding,{tool:'write',toolCallId:'old-approved',parametersDigest:'a'.repeat(64),deadline:Date.now()+60000,artifactPath:'old.md'});
    const before=f.core.snapshot(f.thread);assert.equal(before.operations[0]!.approvalSource,'workspace-tools-v1');f.core.close();
    const db=new DatabaseSync(f.database);
    // Reconstruct the actual v10 CHECK definitions, not only its version number.
    db.exec(`BEGIN;
      ALTER TABLE threads ADD COLUMN old_mode TEXT NOT NULL DEFAULT 'manual' CHECK(old_mode IN ('manual','auto'));
      UPDATE threads SET old_mode=permission_mode; ALTER TABLE threads DROP COLUMN permission_mode; ALTER TABLE threads RENAME COLUMN old_mode TO permission_mode;
      ALTER TABLE runs ADD COLUMN old_mode TEXT NOT NULL DEFAULT 'manual' CHECK(old_mode IN ('manual','auto'));
      UPDATE runs SET old_mode=permission_mode; ALTER TABLE runs DROP COLUMN permission_mode; ALTER TABLE runs RENAME COLUMN old_mode TO permission_mode;
      ALTER TABLE approvals ADD COLUMN old_source TEXT NOT NULL DEFAULT 'manual' CHECK(old_source IN ('manual','workspace-tools-v1'));
      UPDATE approvals SET old_source=source;ALTER TABLE approvals DROP COLUMN source;ALTER TABLE approvals RENAME COLUMN old_source TO source;
      ALTER TABLE threads DROP COLUMN title_revision; PRAGMA user_version=10; COMMIT;`);db.close();
    f.reopen();assert.deepEqual(f.core.snapshot(f.thread),before);f.core.handle(policy);assert.deepEqual(f.core.snapshot(f.thread),before);
    const verify=new DatabaseSync(f.database);assert.equal(verify.prepare('PRAGMA user_version').get()!.user_version,12);assert.deepEqual(verify.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.throws(()=>verify.prepare("UPDATE threads SET permission_mode='anything'").run());verify.close();
    f.core.handle({type:'threads.permissions',requestId:'new-full',threadId:f.thread,mode:'full',expectedRevision:1});
    assert.deepEqual(f.core.snapshot(f.thread).runs.map(r=>r.permissionMode),['manual','auto']);
  } finally {await f.dispose();}
});

test('actual full product host SIGKILL after external write: guardian cleanup and database recovery do not replay',async()=>{
  const f=createScenario();const manifest=join(f.cwd,'manifest.json');let record:{root:string;outside:string;database:string;cwd:string;thread:string;run:string;resources:ResourceSelection}|undefined;
  const child=spawn(process.execPath,[join(repository,'apps/agent-server/tests/full-access-host.ts'),manifest],{env:sterileEnvironment(join(f.cwd,'host-home')),stdio:'ignore'});
  const exited=new Promise<void>((r,reject)=>{child.once('error',reject);child.once('close',()=>r());});let core:ProductCore|undefined;
  try {
    await until(()=>existsSync(manifest),'full host written checkpoint');record=JSON.parse(readFileSync(manifest,'utf8')) as NonNullable<typeof record>;
    const target=join(record.outside,'lost.txt'),stamp=statSync(target,{bigint:true}).mtimeNs;
    child.kill('SIGKILL');await exited;
    const lease=join(record.root,'state/leases',readdirSync(join(record.root,'state/leases'))[0]!);
    await until(()=>existsSync(join(lease,'cleanup.json')),'actual guardian cleanup');
    core=new ProductCore(record.database,[{id:'workspace',path:record.cwd}]);
    const root=record.root;const supervisor=new WorkerSupervisor(core,{stateDirectory:join(root,'state'),databaseDirectory:join(root,'host'),resources:record.resources,fullAccessRoots:()=>[root]});
    supervisor.recover();supervisor.recover();
    assert.equal(core.snapshot(record.thread).operations[0]!.state,'succeeded');assert.equal(core.snapshot(record.thread).runs.find(r=>r.id===record!.run)!.state,'failed');
    assert.equal(statSync(target,{bigint:true}).mtimeNs,stamp);assert.equal(core.workerLaunches().length,1);assert.equal(core.snapshot(record.thread).artifacts.length,0);await supervisor.close();
  } finally {child.kill('SIGKILL');await exited;core?.close();if(record){rmSync(record.root,{recursive:true,force:true});rmSync(record.outside,{recursive:true,force:true});}await f.dispose();}
});
