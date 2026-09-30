import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, existsSync, writeFileSync, renameSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DesktopHost } from '../desktop-host.ts';
import { HostClient } from '../../desktop/host-client.ts';
import { repository } from '../worker-launcher.ts';
import { parseDesktopRequest, type DesktopHome } from '../../../packages/app-contracts/desktop.ts';
import { DESKTOP_PAGE_BYTES, type HistoryPage, type ArtifactPage, type ThreadActivity } from '../../../packages/app-contracts/desktop-pages.ts';
import { until, createScenario } from './scenario.ts';
import { digest } from '../../../packages/pi-adapter/controlled-tools.ts';
import { ObservationOrder } from '../../../packages/pi-adapter/observation-order.ts';
const temporary=()=>realpathSync(mkdtempSync(join(tmpdir(),'backend-history-')));
const thread=(host:DesktopHost,workspaceId='demo-workspace',requestId='thread')=>host.core.handle({type:'threads.create',requestId,workspaceId,title:'SYNTHETIC backend'}).id;
const start=(id:string,requestId='start')=>({type:'command' as const,command:{type:'runs.start' as const,threadId:id,requestId,input:'SYNTHETIC backend'}});
function addHistory(host:DesktopHost,id:string,i:number){
  host.core.handle(start(id,'history-'+i).command);const binding=host.core.dispatchNext()!;host.core.markRunning(binding);
  host.core.projectSession(binding,{messages:Array.from({length:4},(_,j)=>({id:`m-${i}-${j}`,role:'assistant',text:'文'.repeat(2000),truncated:false})),omitted:false});
  // Synthetic lifecycle only; this is not cleanup/Worker evidence.
  host.core.settle(binding,'completed',{piIdle:true,hostClean:true});
}
for(const overlap of ['same','ancestor','child'] as const)test(`R01 restart rejects old workspace with new protected ${overlap}; no dispatch or file`,async()=>{
  const base=temporary(),profile=join(base,'profile'),workspace=join(base,'project');mkdirSync(workspace);mkdirSync(join(workspace,'private'));
  let host=new DesktopHost(profile);host.selectWorkspace(workspace);const workspaceId=(host.request({type:'home'}) as DesktopHome).workspaces.selectedId;const id=thread(host,workspaceId);await host.close();
  const protection=overlap==='same'?workspace:overlap==='ancestor'?base:join(workspace,'private');
  host=new DesktopHost(profile,undefined,[protection]);
  try{
    assert.throws(()=>host.request(start(id)),/workspace_invalid/);
    assert.equal(host.core.snapshot(id).runs.length,0);assert.equal(host.core.workerLaunches().length,0);
    assert.equal((host.request({type:'thread-activity',threadId:id}) as ThreadActivity).workspaceStatus,'invalid');
    assert.equal(existsSync(join(workspace,'synthetic-shell.md')),false);
  }finally{await host.close();rmSync(base,{recursive:true,force:true});}
});
test('R01 selecting another workspace never rebinds old Thread; unchanged workspace reopens normally',async()=>{
 const base=temporary(),profile=join(base,'profile'),first=join(base,'first'),second=join(base,'second');mkdirSync(first);mkdirSync(second);
 let host=new DesktopHost(profile);host.selectWorkspace(first);const firstId=host.core.workspaceSelection().selectedId,id=thread(host,firstId);await host.close();
 host=new DesktopHost(profile);try{
  host.selectWorkspace(second);assert.equal(host.core.threadWorkspace(id).path,first);
  host.request(start(id));await until(()=>host.core.snapshot(id).operations.length===1,'old-thread-approval');
  const op=host.core.snapshot(id).operations[0]!;host.request({type:'command',command:{type:'approvals.resolve',requestId:'deny',operationId:op.id,parametersDigest:op.parametersDigest,decision:'deny'}});
  await host.supervisor.completion;assert.equal(host.core.snapshot(id).runs[0]!.state,'failed');
 }finally{await host.close();rmSync(base,{recursive:true,force:true});}
});
test('R01 queued persisted intent fails admission with audit, not an occupied starting slot',async()=>{
 const base=temporary(),profile=join(base,'profile'),workspace=join(base,'project');mkdirSync(workspace);
 let host=new DesktopHost(profile);host.selectWorkspace(workspace);const id=thread(host,host.core.workspaceSelection().selectedId);
 // Persist without dispatch, then simulate a prior host exiting before it could pump.
 const run=host.core.handle(start(id).command).id;host.core.close();host=new DesktopHost(profile,undefined,[workspace]);
 try{host.pump();assert.equal(host.core.snapshot(id).runs[0]!.state,'failed');assert.ok(host.core.eventsAfter(id,0).some(e=>e.kind==='workspace.invalid'));assert.equal(host.core.workerLaunches().length,0);assert.equal(host.core.activeRuns().length,0);assert.equal(host.core.hasRequest('start'),true);assert.ok(run);}
 finally{await host.close();rmSync(base,{recursive:true,force:true});}
});
test('R01 exact managed default exception, protected child, changed symlink and native credential directory',async()=>{
 const base=temporary(),profile=join(base,'profile');let host=new DesktopHost(profile,undefined,[base]);
 const id=thread(host);assert.equal((host.request({type:'thread-activity',threadId:id}) as ThreadActivity).workspaceStatus,'ready');
 assert.throws(()=>host.selectWorkspace(join(profile,'workspace')),/workspace_overlaps_host/);
 const privateDir=join(base,'keys');mkdirSync(privateDir);host.protectCredentialDirectory(privateDir);await host.close();
 host=new DesktopHost(profile);assert.throws(()=>host.selectWorkspace(privateDir),/workspace_overlaps_host/);
 assert.throws(()=>host.protectCredentialDirectory(join(profile,'workspace')),/workspace_invalid/);
 const movedKeys=join(base,'moved-keys');renameSync(privateDir,movedKeys);symlinkSync(movedKeys,privateDir);assert.throws(()=>host.request(start(id)),/workspace_invalid/);unlinkSync(privateDir);renameSync(movedKeys,privateDir);
 const child=join(profile,'workspace','protected');mkdirSync(child);await host.close();host=new DesktopHost(profile,undefined,[child]);
 assert.throws(()=>host.request(start(id)),/workspace_invalid/);await host.close();
 const moved=join(profile,'old-workspace');renameSync(join(profile,'workspace'),moved);symlinkSync(moved,join(profile,'workspace'));
 try{assert.throws(()=>new DesktopHost(profile),/workspace_mapping_changed/);}finally{rmSync(base,{recursive:true,force:true});}
});
test('R03 actual SQLite/HostClient: 60-Run history paginates by bytes, reconnect and appends do not skip/duplicate older rows',async()=>{
 const base=temporary(),profile=join(base,'profile');const host=new DesktopHost(profile),id=thread(host);
 for(let i=0;i<60;i++)addHistory(host,id,i);
 assert.ok(Buffer.byteLength(JSON.stringify(host.request({type:'thread',threadId:id})))>1_200_000);
 await host.close();const client=new HostClient(process.execPath,repository,profile);
 try{
  await client.connect();await assert.rejects(client.request({type:'thread',threadId:id}),/request_rejected/);
  let page=await client.request({type:'history-page',threadId:id,page:{limit:32}}) as HistoryPage;
  assert.ok(page.items.length<32);const original=page.items.map(i=>i.run.id);const first=page;
  await client.reconnect();const repeat=await client.request({type:'history-page',threadId:id,page:{limit:32}}) as HistoryPage;assert.deepEqual(repeat,first);
  const newest=(await client.request(start(id,'new-after-snapshot')) as {id:string}).id;
  for(;;){assert.ok(Buffer.byteLength(JSON.stringify(page))<=DESKTOP_PAGE_BYTES);if(!page.hasMore)break;
   page=await client.request({type:'history-page',threadId:id,page:{cursor:page.nextCursor!,limit:32}}) as HistoryPage;
   original.push(...page.items.map(i=>i.run.id));
  }
  assert.equal(original.length,60);assert.equal(new Set(original).size,60);assert.equal(original.includes(newest),false);
  let activity:ThreadActivity;
  do{activity=await client.request({type:'thread-activity',threadId:id}) as ThreadActivity;await new Promise(r=>setTimeout(r,20));}while(!activity.operations.length);
  assert.equal(activity.activeRun?.id,newest);assert.equal(activity.operations[0]!.state,'pending');
  const op=activity.operations[0]!;await client.request({type:'command',command:{type:'approvals.resolve',requestId:'deny-new',operationId:op.id,parametersDigest:op.parametersDigest,decision:'deny'}});
  await assert.rejects(client.request({type:'artifact-page',threadId:id,page:{cursor:first.nextCursor!}}),/page_cursor_invalid/);
  await assert.rejects(client.request({type:'history-page',threadId:id,page:{cursor:Buffer.from('{}').toString('base64url')}}),/page_cursor_invalid/);
  const events=await client.request({type:'events',threadId:id,cursor:first.snapshotSeq}) as {seq:number}[];assert.ok(events.length);assert.ok(events.every(e=>e.seq>first.snapshotSeq));
 }finally{await client.close();rmSync(base,{recursive:true,force:true});}
});
test('R03 real artifacts page + lazy preview detects changed/missing; paging has no side effects',async()=>{
 const base=temporary(),host=new DesktopHost(join(base,'profile')),id=thread(host),workspace=host.core.threadWorkspace(id).path;
 for(let i=0;i<3;i++){
  host.core.handle(start(id,'artifact-'+i).command);const binding=host.core.dispatchNext()!;host.core.markRunning(binding);
  const text='# SYNTHETIC '+i,path=`artifact-${i}.md`,hash=digest(text);
  const op=host.core.requestOperation(binding,{toolCallId:'tool-'+i,tool:'write',parametersDigest:hash,deadline:Date.now()+10000,artifactPath:path});
  host.core.handle({type:'approvals.resolve',requestId:'allow-'+i,operationId:op.id,parametersDigest:hash,decision:'allow'});
  host.core.claimOperation(binding,op.id,hash);writeFileSync(join(workspace,path),text);host.core.finishOperation(binding,op.id,'succeeded',hash);host.core.recordArtifact(binding,op.id,path);host.core.settle(binding,'completed',{piIdle:true,hostClean:true});
 }
 try{
  const page=host.request({type:'artifact-page',threadId:id,page:{limit:2}}) as ArtifactPage;assert.equal(page.items.length,2);assert.equal(page.hasMore,true);
  const next=host.request({type:'artifact-page',threadId:id,page:{cursor:page.nextCursor!}}) as ArtifactPage;assert.equal(next.items.length,1);
  const cursor=host.core.snapshot(id).cursor;const artifact=page.items[0]!;assert.ok(artifact.version);assert.ok(artifact.runId);
  assert.equal((host.request({type:'preview',artifactId:artifact.id}) as {status:string}).status,'ready');
  writeFileSync(join(workspace,artifact.path),'changed');assert.equal((host.request({type:'preview',artifactId:artifact.id}) as {status:string}).status,'changed');
  rmSync(join(workspace,artifact.path));assert.equal((host.request({type:'preview',artifactId:artifact.id}) as {status:string}).status,'missing');assert.equal(host.core.snapshot(id).cursor,cursor);
 }finally{await host.close();rmSync(base,{recursive:true,force:true});}
});
test('page requests reject unknown authority, invalid limits and cursors before storage access',()=>{
 for(const page of [{limit:0},{limit:33},{limit:1.5},{cursor:1},{cursor:'a'.repeat(1025)},{database:'/private/test'}])assert.throws(()=>parseDesktopRequest({type:'history-page',threadId:'x',page}));
 assert.throws(()=>parseDesktopRequest({type:'thread-activity',threadId:'x',execute:true}));
});
test('replaceable observation sequence uses constant state and never re-applies duplicate/late updates',()=>{
 const order=new ObservationOrder();for(const id of ['presentation-1','observation-3'])assert.throws(()=>order.assertControl(id),/reserved_observation_id/);order.assertControl('worker-1');for(let i=1;i<=5000;i++)assert.equal(order.accept('presentation','presentation-'+i),true);
 assert.equal(order.accept('presentation','presentation-1'),false);assert.equal(order.accept('presentation','presentation-5000'),false);
 assert.equal(order.accept('observation','observation-3'),true);assert.equal(order.accept('observation','observation-2'),false);
 for(const id of ['presentation-0','presentation-01','presentation-9007199254740992','observation-3','attacker'])assert.throws(()=>order.accept('presentation',id));
});

test('R02 real Worker: hundreds of display messages preserve duplicate control fencing and cancellation',async()=>{
 const f=createScenario(),path=join(repository,'apps/agent-server/tests/display-worker-fixture.ts');
 try{
  const done=f.supervisor.startNext(f.plan,{path,extraRead:[path],args:[f.plan.tool==='write'?f.plan.parametersDigest:'']})!;
  await until(()=>f.core.snapshot(f.thread).operations.length===1,'display-after-flood');
  assert.equal(f.core.presentation(f.run).messages[0]!.text,'SYNTHETIC latest');
  assert.equal(f.core.snapshot(f.thread).operations.length,1);
  f.supervisor.command({type:'runs.cancel',requestId:'cancel-flood',runId:f.run});await done;
  assert.equal(f.core.snapshot(f.thread).runs[0]!.state,'cancelled');assert.equal(existsSync(join(f.cwd,'report.md')),false);
 }finally{await f.dispose();}
});
