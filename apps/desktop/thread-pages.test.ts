import assert from 'node:assert/strict';
import test from 'node:test';
import type { DesktopApi } from '../../packages/app-contracts/desktop.ts';
import type { DesktopPage, HistoryItem, PageOptions } from '../../packages/app-contracts/desktop-pages.ts';
import type { ProductEvent } from '../../packages/app-contracts/index.ts';
import { ThreadPages } from './thread-pages.ts';
const record = (id: number): HistoryItem => ({run:{id:String(id),threadId:'thread',state:'completed'},input:`SYNTHETIC ${id}`,presentation:{messages:[],omitted:false},modelOutcome:null});
function fixture() {
  let items = Array.from({length:21},(_,i)=>record(21-i)); let seq=1; let events: ProductEvent[]=[];
  const cursors:number[]=[]; let failure=false; let release:(()=>void)|undefined;
  let delayed=false;
  const empty = <T>():DesktopPage<T> => ({items:[],nextCursor:null,hasMore:false,snapshotSeq:seq+500});
  const api:Pick<DesktopApi,'historyEntry'|'historyPage'|'artifactPage'|'operationPage'|'events'> = {
    async historyEntry(_thread,id){if(failure)throw Error('page_item_too_large');return {item:structuredClone(items.find(i=>i.run.id===id)!),snapshotSeq:seq};},
    async historyPage(_id: string, page?: PageOptions) {
      if(failure)throw Error('page_item_too_large');
      if(delayed){delayed=false;await new Promise<void>(r=>{release=r;});}
      assert.equal(page?.limit,8);
      const [ceiling,before]=page?.cursor?.split('_').map(Number)??[Number(items[0]!.run.id),Infinity];
      const remaining=items.filter(i=>Number(i.run.id)<=ceiling!&&Number(i.run.id)<before!);
      const result=remaining.slice(0,page!.limit),hasMore=remaining.length>result.length;
      return {items:structuredClone(result),snapshotSeq:seq,nextCursor:hasMore?`${ceiling}_${result.at(-1)!.run.id}`:null,hasMore};
    },
    async artifactPage(){return empty();},async operationPage(){return empty();},
    async events(_id,cursor){cursors.push(cursor);return events.filter(e=>e.seq>cursor).slice(0,128);},
  };
  return {reader:new ThreadPages(api,'thread'),cursors,
    add(){seq++;items=[record(Number(items[0]!.run.id)+1),...items];events.push({seq,runSeq:seq,threadId:'thread',runId:items[0]!.run.id,kind:'SYNTHETIC',entityId:'thread',eventType:null,sourceType:null});},
    fail(value:boolean){failure=value;}, delay(){delayed=true;}, release(){assert.ok(release);release();},
    flood(){events=Array.from({length:300},(_,i)=>({seq:i+2,runSeq:i+2,threadId:'thread',runId:'21',kind:'SYNTHETIC',entityId:'thread',eventType:null,sourceType:null}));seq=301;},
  };
}
test('pages: new insert between head and older request does not skip or duplicate, refresh preserves loaded depth',async()=>{
  const f=fixture();assert.equal((await f.reader.refresh()).history.items.length,8);
  f.add();let view=await f.reader.more('history');
  assert.deepEqual(view.history.items.map(i=>i.run.id),Array.from({length:16},(_,i)=>String(21-i)));
  view=await f.reader.poll();assert.deepEqual(view.history.items.map(i=>i.run.id),Array.from({length:24},(_,i)=>String(22-i)).filter(i=>Number(i)>0));
  assert.equal(view.history.hasMore,false);assert.equal(new Set(view.history.items.map(i=>i.run.id)).size,22);
});
test('pages: drain all 128-event batches; later page snapshot never skips unseen events',async()=>{
  const f=fixture();await f.reader.refresh();f.flood();
  await f.reader.poll();await f.reader.poll();await f.reader.poll();await f.reader.poll();
  assert.deepEqual(f.cursors,[1,129,257,301]);
});
test('pages: failed refresh retains visible snapshot and can recover without advancing event cursor',async()=>{
  const f=fixture();const old=await f.reader.refresh();f.add();f.fail(true);
  await assert.rejects(f.reader.poll(),/page_item_too_large/);assert.deepEqual(f.reader.view(),old);
  f.fail(false);const next=await f.reader.poll();assert.equal(next.history.items[0]!.run.id,'22');assert.deepEqual(f.cursors,[1,1]);
});
test('pages: slow head refresh and load-more serialize; viewing requests have no execution API',async()=>{
  const f=fixture();await f.reader.refresh();f.delay();const refreshing=f.reader.refresh();const more=f.reader.more('history');
  await new Promise(r=>setImmediate(r));f.release();await refreshing;
  assert.equal((await more).history.items.length,16);
});

// SYNTHETIC query ports: counts are method calls, not IPC latency or model requests.
function targetedFixture(count=256) {
  let items=Array.from({length:count},(_,i)=>record(count-i)),seq=1;
  const events:ProductEvent[]=[],cursors:number[]=[];
  const calls:{method:string;id?:string}[]=[];
  let failure='',invalidCursor=false,release:(()=>void)|undefined,delay=false;
  const operations=new Map<string,import('../../packages/app-contracts/index.ts').OperationView[]>();
  let artifacts:import('../../packages/app-contracts/index.ts').ArtifactView[]=[];
  const emit=(kind:string,id=String(count))=>events.push({seq:++seq,runSeq:seq,threadId:'thread',runId:id,kind,entityId:id,eventType:null,sourceType:null});
  function page<T>(rows:T[],p:PageOptions|undefined,id:(i:T)=>string):DesktopPage<T>{
    const [ceiling,before]=p?.cursor?.split('_').map(Number)??[Infinity,Infinity];
    const rest=rows.filter(i=>Number(id(i))<=ceiling!&&Number(id(i))<before!);
    const batch=rest.slice(0,p?.limit??8),hasMore=rest.length>batch.length;
    return {items:structuredClone(batch),snapshotSeq:seq+500,hasMore,nextCursor:hasMore?`${Number.isFinite(ceiling)?ceiling:Number(id(rows[0]!))}_${id(batch.at(-1)!)}`:null};
  }
  const api:ConstructorParameters<typeof ThreadPages>[0]={
    async historyPage(_thread,p){calls.push({method:'historyPage'});
      if(invalidCursor&&p?.cursor){invalidCursor=false;throw Error('page_cursor_invalid');}
      if(failure==='history')throw Error('page_item_too_large');
      return {...page(items,p,i=>i.run.id),snapshotSeq:seq};},
    async historyEntry(_thread,id){calls.push({method:'historyEntry',id});
      if(delay){delay=false;await new Promise<void>(r=>{release=r;});}
      if(failure===id)throw Error('disconnected');
      return {item:structuredClone(items.find(i=>i.run.id===id)!),snapshotSeq:seq+500};},
    async artifactPage(_thread,p){calls.push({method:'artifactPage'});if(failure==='artifact')throw Error('disconnected');return page(artifacts,p,i=>i.id);},
    async operationPage(id,p){calls.push({method:'operationPage',id});if(failure==='operation')throw Error('disconnected');return page(operations.get(id)??[],p,i=>i.id);},
    async events(_thread,cursor){calls.push({method:'events'});cursors.push(cursor);return events.filter(e=>e.seq>cursor).slice(0,128);},
  };
  const reader=new ThreadPages(api,'thread');
  return {reader,calls,cursors,emit,operations,
    async load(){await reader.refresh();while(reader.view().history.hasMore)await reader.more('history');calls.length=0;},
    change(id:string){items=items.map(i=>i.run.id===id?{...i,input:'SYNTHETIC updated'}:i);emit('display.replaced',id);},
    insert(n:number){for(let i=0;i<n;i++){const id=String(Number(items[0]!.run.id)+1);items=[record(Number(id)),...items];emit('run.queued',id);}},
    artifact(n:number){artifacts=[{id:String(n),runId:String(count),operationId:'op',path:'SYNTHETIC.md',version:n,digest:'0'.repeat(64),bytes:1},...artifacts];emit('artifact.recorded');},
    fail(v:string){failure=v;}, invalidate(){invalidCursor=true;}, delay(){delay=true;},release(){assert.ok(release);release();},
  };
}
for(const count of [64,256])test(`targeted: ${count} loaded rows, repeated body events require exactly two reads`,async()=>{
  const f=targetedFixture(count);await f.load();f.change('2');f.emit('display.replaced','2');
  const view=await f.reader.poll();assert.equal(view.history.items.find(i=>i.run.id==='2')!.input,'SYNTHETIC updated');
  assert.deepEqual(f.calls,[{method:'events'},{method:'historyEntry',id:'2'}]);
});
test('targeted: multi-page new head preserves old tail cursor; unloaded old changes stay unloaded',async()=>{
  const f=targetedFixture(64);await f.reader.refresh();const old=f.reader.view().history.nextCursor;f.calls.length=0;
  f.insert(19);f.change('1');let v=await f.reader.poll();
  assert.equal(v.history.items.length,27);assert.equal(v.history.nextCursor,old);
  assert.equal(f.calls.some(c=>c.id==='1'),false);
  assert.equal(f.calls.filter(c=>c.method==='historyPage').length,3);
  assert.equal(f.calls.some(c=>c.method==='operationPage'&&Number(c.id)<=64),false);
  while(v.history.hasMore)v=await f.reader.more('history');
  assert.deepEqual(v.history.items.map(i=>Number(i.run.id)),Array.from({length:83},(_,i)=>83-i));
  assert.equal(v.history.items.at(-1)!.input,'SYNTHETIC updated');
});
test('targeted: operation paging, cancellation invalidation and artifact versions are independent',async()=>{
  const f=targetedFixture(8);
  f.operations.set('8',Array.from({length:12},(_,i)=>({id:String(12-i),runId:'8',toolCallId:'s',tool:'write',artifactPath:null,parametersDigest:'0'.repeat(64),deadline:1,state:'pending'})));
  await f.load();await f.reader.more('8');f.calls.length=0;
  f.operations.set('8',f.operations.get('8')!.map(op=>({...op,state:'denied'})));f.emit('run.cancelling');
  let v=await f.reader.poll();assert.equal(v.operations.get('8')!.items.length,12);assert.ok(v.operations.get('8')!.items.every(op=>op.state==='denied'));
  assert.equal(f.calls.some(c=>c.method==='artifactPage'),false);
  f.artifact(1);await f.reader.poll();f.calls.length=0;f.artifact(2);v=await f.reader.poll();
  assert.deepEqual(v.artifacts.items.map(i=>i.version),[2,1]);assert.deepEqual(f.calls,[{method:'events'},{method:'artifactPage'}]);
});
test('targeted: 300 body events drain 128 at a time without a later snapshot skipping events',async()=>{
  const f=targetedFixture(8);await f.load();for(let i=0;i<300;i++)f.change('8');
  for(let i=0;i<4;i++)await f.reader.poll();assert.deepEqual(f.cursors,[1,129,257,301]);
  assert.equal(f.calls.filter(c=>c.method==='historyEntry').length,3);
});
test('targeted: failed multi-entity batch publishes nothing, retains watermark and retries all dirty entities',async()=>{
  const f=targetedFixture(8);await f.load();const old=f.reader.view();f.change('8');f.change('7');f.artifact(1);f.fail('artifact');
  await assert.rejects(f.reader.poll(),/disconnected/);assert.deepEqual(f.reader.view(),old);
  f.fail('');await f.reader.poll();assert.deepEqual(f.cursors,[1,1]);
  assert.equal(f.calls.filter(c=>c.method==='historyEntry').length,4);assert.equal(f.reader.view().artifacts.items.length,1);
});
test('targeted: unknown events and explicit reconnect resync; bad older cursor restarts from head once',async()=>{
  const f=targetedFixture(20);await f.reader.refresh();f.emit('future.unknown');await f.reader.poll();assert.ok(f.calls.some(c=>c.method==='historyPage'));
  f.invalidate();await f.reader.more('history');assert.equal(f.reader.view().history.items.length,8);
  await f.reader.more('history');assert.equal(f.reader.view().history.items.length,16);
  await f.reader.refresh();assert.equal(f.reader.view().history.items.length,16);
});
test('targeted: switch fences in-flight and queued work, no next request or partial snapshot',async()=>{
  const f=targetedFixture(8);await f.load();const old=f.reader.view();f.change('8');f.change('7');f.delay();
  const poll=f.reader.poll(),queued=f.reader.more('history');
  const rejected=Promise.all([assert.rejects(poll,/pages_cancelled/),assert.rejects(queued,/pages_cancelled/)]);
  await new Promise(r=>setImmediate(r));f.reader.cancelPending();f.release();await rejected;
  assert.deepEqual(f.reader.view(),old);assert.deepEqual(f.calls,[{method:'events'},{method:'historyEntry',id:'8'}]);
  await f.reader.refresh();assert.equal(f.reader.view().history.items[0]!.input,'SYNTHETIC updated');
});
