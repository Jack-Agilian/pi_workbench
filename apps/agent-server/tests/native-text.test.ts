// Real Pi serialization/SQLite/files; all authored content and lifecycles marked SYNTHETIC.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync,renameSync,symlinkSync,unlinkSync,statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { DesktopHost } from '../desktop-host.ts';
import { parseDesktopRequest } from '../../../packages/app-contracts/desktop.ts';
import type { NativeTextPage } from '../../../packages/app-contracts/native-text.ts';
import { readNativeText } from '../../../packages/pi-adapter/native-text.ts';
import { displayText } from '../../../packages/app-contracts/presentation.ts';
import { createScenario } from './scenario.ts';

function assistant(text:string){return {role:'assistant' as const,content:[{type:'text' as const,text}],api:'openai-responses' as const,provider:'SYNTHETIC',model:'SYNTHETIC',timestamp:1,stopReason:'stop' as const,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};}
function fixture(t:test.TestContext){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'native-text-')));let host=new DesktopHost(root);t.after(async()=>{await host.close();rmSync(root,{recursive:true,force:true});});
 const thread=host.core.handle({type:'threads.create',requestId:'thread',workspaceId:'demo-workspace',title:'SYNTHETIC native reading'}).id;
 const workspace=host.core.threadWorkspace(thread).path,dir=join(root,'state','sessions',thread);mkdirSync(dir,{recursive:true});
 const manager=SessionManager.create(workspace,dir);manager.appendMessage(assistant('SYNTHETIC PREVIOUS RUN MUST NOT LEAK'));
 const run=host.core.handle({type:'runs.start',requestId:'run',threadId:thread,input:'SYNTHETIC intent'}).id;const binding=host.core.dispatchNext()!;host.core.markRunning(binding);host.core.bindNativeSession(binding,manager.getSessionFile()!,true);
 host.core.recordNativeRange(binding,manager.getSessionFile()!,'start',manager.getLeafId());
 const body='# SYNTHETIC long\n\n'+('中😀'.repeat(7000))+'\nBearer SYNTHETIC_CANARY_TOKEN\n';
 manager.appendMessage({role:'user',content:'SYNTHETIC prompt',timestamp:2});const id=manager.appendMessage(assistant(body));
 for(let i=0;i<20;i++)manager.appendMessage(assistant('SYNTHETIC omitted-message-'+i));
 const end=manager.getLeafId();host.core.recordNativeRange(binding,manager.getSessionFile()!,'end',end);
 // Synthetic lifecycle only. OS cleanup evidence is tested separately below.
 host.core.settle(binding,'completed',{piIdle:true,hostClean:true});
 manager.appendMessage(assistant('SYNTHETIC NEXT RUN MUST NOT LEAK'));
 return {root,thread,run,binding,manager,body,id,dir,workspace,get host(){return host;},read:(cursor?:string)=>host.request({type:'native-text',threadId:thread,runId:run,...(cursor?{cursor}:{})}) as NativeTextPage,
 reopen:async()=>{await host.close();host=new DesktopHost(root);}};
}
test('native full reading uses Pi parser/tree, all omitted messages, Unicode byte pages and whole-message redaction; no native writes',async t=>{
 const f=fixture(t),path=f.manager.getSessionFile()!,bytes=readFileSync(path),mtime=statSync(path).mtimeMs;
 let p=f.read();assert.equal(p.status,'ready');let cursor:string|undefined,joined='',ids=new Set<string>(),pages=0;
 do{p=f.read(cursor);assert.equal(p.status,'ready');if(p.status!=='ready')throw Error('not ready');
  assert.ok(Buffer.byteLength(JSON.stringify(p))<70_000);assert.ok(p.chunks.every(c=>!c.text.includes('\uFFFD')));
  for(const c of p.chunks){ids.add(c.id);if(c.id===f.id)joined+=c.text;assert.ok(!c.text.includes('MUST NOT LEAK'));assert.ok(!c.text.includes('SYNTHETIC_CANARY_TOKEN'));}
  cursor=p.nextCursor??undefined;pages++;
 }while(cursor);
 assert.ok(pages>2);assert.equal(ids.size,22);assert.equal(joined,displayText(f.body,f.body.length));
 assert.deepEqual(readFileSync(path),bytes);assert.equal(statSync(path).mtimeMs,mtime);
 const before=f.read();await f.reopen();assert.deepEqual(f.read(),before);assert.equal(f.host.core.workerLaunches().length,0);
 const db=readFileSync(join(f.root,'host','product.sqlite'));assert.equal(db.includes(Buffer.from('omitted-message')),false);
});
test('native cursor binds exact Run/source; mutation, missing/aliased/oversized files and foreign identity fail closed',t=>{
 const f=fixture(t),p=f.read();assert.equal(p.status,'ready');if(p.status!=='ready')throw Error();assert.ok(p.nextCursor);
 const decoded=JSON.parse(Buffer.from(p.nextCursor!,'base64url').toString());decoded.runId='other';assert.deepEqual(f.read(Buffer.from(JSON.stringify(decoded)).toString('base64url')),{status:'changed'});
 const path=f.manager.getSessionFile()!,original=readFileSync(path);writeFileSync(path,original.toString().replace('SYNTHETIC omitted-message-0','SYNTHETIC altered-message-0'));assert.deepEqual(f.read(p.nextCursor!),{status:'changed'});
 writeFileSync(path,original);const moved=path+'.saved';renameSync(path,moved);assert.deepEqual(f.read(),{status:'missing'});symlinkSync(moved,path);assert.deepEqual(f.read(),{status:'unavailable'});unlinkSync(path);renameSync(moved,path);
 writeFileSync(path,Buffer.alloc(8*1024*1024+1));assert.deepEqual(f.read(),{status:'too_large'});writeFileSync(path,original);
 const source=f.host.core.nativeTextSource(f.thread,f.run)!;
 assert.deepEqual(readNativeText({...source,end:'missing-entry'},f.dir,f.workspace,f.run),{status:'unavailable'});
 assert.deepEqual(readNativeText({...source,start:'missing-entry'},f.dir,f.workspace,f.run),{status:'unavailable'});
 assert.deepEqual(readNativeText(source,f.dir,f.workspace+'-wrong',f.run),{status:'unavailable'});
 assert.throws(()=>f.host.request({type:'native-text',threadId:'other',runId:f.run}),/not_found/);
 for(const extra of [{path},{nativeRef:path},{hostClean:true},{cursor:'x'.repeat(1025)}])assert.throws(()=>parseDesktopRequest({type:'native-text',threadId:f.thread,runId:f.run,...extra}));
});
test('range schema v12 migration, incomplete/legacy ranges and stale binding are explicit, not fabricated full text',async t=>{
 const f=fixture(t);assert.throws(()=>f.host.core.recordNativeRange(f.binding,f.manager.getSessionFile()!,'end',null),/stale_binding/);
 await f.host.close();const db=new DatabaseSync(join(f.root,'host','product.sqlite'));db.exec('DROP TABLE run_native_ranges; PRAGMA user_version=12;');db.close();await f.reopen();assert.deepEqual(f.read(),{status:'unavailable'});
 const run=f.host.core.handle({type:'runs.start',requestId:'incomplete',threadId:f.thread,input:'SYNTHETIC unpersisted intent'}).id;const b=f.host.core.dispatchNext()!;f.host.core.markRunning(b);f.host.core.recordNativeRange(b,f.manager.getSessionFile()!,'start',f.manager.getLeafId());
 assert.deepEqual(f.host.request({type:'native-text',threadId:f.thread,runId:run}),{status:'pending'});
 f.host.core.settle(b,'failed',{piIdle:true,hostClean:true});assert.deepEqual(f.host.request({type:'native-text',threadId:f.thread,runId:run}),{status:'unavailable'});
});
test('real Worker records Run range through actual IPC and preserves it across host reopen without execution replay',async()=>{
 const f=createScenario('normal',true);try{
  const done=f.start();await f.approval();await done;const source=f.core.nativeTextSource(f.thread,f.run);assert.ok(source?.finished);
  const page=readNativeText(source,join(f.root,'state','sessions',f.thread),f.cwd,f.run);assert.equal(page.status,'ready');
  const file=readFileSync(source.reference);f.reopen();assert.deepEqual(f.core.nativeTextSource(f.thread,f.run),source);assert.deepEqual(readNativeText(source,join(f.root,'state','sessions',f.thread),f.cwd,f.run),page);assert.deepEqual(readFileSync(source.reference),file);assert.equal(f.core.workerLaunches().length,1);
 }finally{await f.dispose();}
});
