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
  const api:Pick<DesktopApi,'historyPage'|'artifactPage'|'operationPage'|'events'> = {
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
