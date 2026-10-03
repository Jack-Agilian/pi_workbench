import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelHttp } from '../model-http.ts';
import { modelFetch } from '../../../packages/pi-adapter/model-fetch.ts';
import type { WireBody } from '../../../packages/app-contracts/worker-ipc.ts';
const url='https://synthetic.invalid/stream';
function bridge(fetch:typeof globalThis.fetch,idle=120){
 const host=new ModelHttp(url,()=>{},fetch,idle);
 const worker=modelFetch(async(body,id)=>host.receive(body,async reply=>{worker.receive(id,reply);}));
 return {host,worker,async close(){worker.close();await host.close();}};
}
test('one HTTP/LLM stream remains alive beyond idle period while bytes keep arriving',async()=>{
 let tick:ReturnType<typeof setInterval>|undefined;let calls=0;let cancelled=false;
 const b=bridge(async()=>{calls++;return new Response(new ReadableStream<Uint8Array>({start(c){let n=0;tick=setInterval(()=>{c.enqueue(new TextEncoder().encode(`SYNTHETIC token ${++n}\n`));if(n===12){clearInterval(tick);c.close();}},30);},cancel(){cancelled=true;clearInterval(tick);}}));});
 try{const start=Date.now();const r=await b.worker.fetch(url,{method:'POST',body:'{}'});const body=await r.text();assert.ok(Date.now()-start>=300);assert.match(body,/token 12/);assert.equal(calls,1);assert.equal(cancelled,false);}finally{clearInterval(tick);await b.close();}
});
test('missing response headers reaches idle timeout and aborts actual fetch signal',async()=>{
 let aborted=false;
 const b=bridge(async(_url,options)=>new Promise<Response>((_resolve,reject)=>{options!.signal!.addEventListener('abort',()=>{aborted=true;reject(new Error('SYNTHETIC abort'));},{once:true});}),40);
 try{await assert.rejects(b.worker.fetch(url,{method:'POST',body:'{}'}),/transport_failed/);assert.equal(aborted,true);}finally{await b.close();}
});
test('a stopped token stream times out after previous progress and cancels reader',async()=>{
 let cancelled=false;
 const b=bridge(async()=>new Response(new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode('SYNTHETIC first token'));},cancel(){cancelled=true;}})),40);
 try{const r=await b.worker.fetch(url,{method:'POST',body:'{}'});const reader=r.body!.getReader();assert.equal((await reader.read()).done,false);await assert.rejects(reader.read(),/transport_failed/);assert.equal(cancelled,true);}finally{await b.close();}
});
test('close cancels pending I/O and its idle timer without late errors',async()=>{
 let cancelled=false;
 const b=bridge(async()=>new Response(new ReadableStream<Uint8Array>({cancel(){cancelled=true;}})),10000);
 const r=await b.worker.fetch(url,{method:'POST',body:'{}'});const read=r.text();const rejected=assert.rejects(read,/transport_failed/);
 await b.close();await rejected;assert.equal(cancelled,true);assert.equal(b.host.close(),b.host.close());
});

test('empty chunks cannot keep an otherwise idle HTTP body alive',async()=>{
 let timer:ReturnType<typeof setInterval>|undefined;
 const b=bridge(async()=>new Response(new ReadableStream<Uint8Array>({start(c){timer=setInterval(()=>c.enqueue(new Uint8Array()),5);},cancel(){clearInterval(timer);}})),40);
 try{const r=await b.worker.fetch(url,{method:'POST',body:'{}'});await assert.rejects(r.text(),/transport_failed/);}finally{clearInterval(timer);await b.close();}
});

for(const winner of ['timeout','close'] as const)test(`late response headers after ${winner} are cancelled without publishing to the closed request`,async()=>{
 let deliver!:(response:Response)=>void;let signal:AbortSignal|undefined;let reservations=0;let cancelled=false;
 const replies:WireBody[]=[];
 let replied!:()=>void;const responseObserved=new Promise<void>(resolve=>{replied=resolve;});
 const host=new ModelHttp(url,()=>{reservations++;},async(_url,options)=>{signal=options!.signal!;return new Promise<Response>(resolve=>{deliver=resolve;});},40);
 host.receive({type:'model-http',url,method:'POST',headers:{},body:'{}'},async body=>{replies.push(body);replied();});
 if(winner==='timeout')await responseObserved;
 const closing=host.close();assert.equal(host.close(),closing);assert.equal(signal!.aborted,true);
 // Deliberately uncooperative synthetic fetch resolves after abort, as a race input.
 deliver(new Response(new ReadableStream<Uint8Array>({cancel(){cancelled=true;}})));
 await closing;await new Promise<void>(resolve=>setImmediate(resolve));
 assert.equal(cancelled,true);assert.equal(reservations,1);
 assert.deepEqual(replies.map(r=>r.type),winner==='timeout'?['model-http-error']:[]);
});

test('completed stream does not become a timeout after the former idle deadline',async()=>{
 let signal:AbortSignal|undefined;let reservations=0;const replies:WireBody[]=[];
 const host=new ModelHttp(url,()=>{reservations++;},async(_url,options)=>{signal=options!.signal!;return new Response('SYNTHETIC completed');},40);
 const worker=modelFetch(async(body,id)=>host.receive(body,async reply=>{replies.push(reply);worker.receive(id,reply);}));
 try{
  const response=await worker.fetch(url,{method:'POST',body:'{}'});assert.equal(await response.text(),'SYNTHETIC completed');
  const count=replies.length;await new Promise<void>(resolve=>setTimeout(resolve,80));
  assert.equal(replies.length,count);assert.equal(signal!.aborted,false);assert.equal(reservations,1);
  assert.equal(replies.at(-1)?.type,'model-http-chunk');assert.ok(replies.every(r=>r.type!=='model-http-error'));
 }finally{worker.close();await host.close();}
});

for(const shape of ['html','unknown-code','type-only','oversize','malformed','split-json','no-body'] as const)test(`HTTP error inspection ${shape} preserves status, withholds arbitrary text and bounds input`,async()=>{
 const privateText='SYNTHETIC_PRIVATE_ERROR_CANARY';let cancelled=false;
 const body=shape==='html'?'<h1>'+privateText+'</h1>':shape==='unknown-code'?JSON.stringify({error:{code:privateText,message:privateText}}):shape==='type-only'?JSON.stringify({error:{type:'invalid_api_key',message:privateText}}):shape==='oversize'?JSON.stringify({error:{code:'permission_denied',message:privateText+'x'.repeat(17000)}}):shape==='malformed'?'{"error":':JSON.stringify({error:{code:'permission_denied',message:privateText}});
 const b=bridge(async()=>new Response(shape==='no-body'?null:new ReadableStream<Uint8Array>({start(c){
  if(shape==='split-json'){const data=new TextEncoder().encode(body);for(let i=0;i<data.length;i+=5)c.enqueue(data.slice(i,i+5));}else c.enqueue(new TextEncoder().encode(body));
  if(shape!=='oversize')c.close();
 },cancel(){cancelled=true;}}),{status:403,headers:{'content-type':'text/html'}}));
 try{const r=await b.worker.fetch(url,{method:'POST',body:'{}'});assert.equal(r.status,403);assert.equal(r.headers.get('content-type'),'application/json');const safe=await r.text();assert.equal(safe.includes(privateText),false);assert.deepEqual(JSON.parse(safe),{error:{...(shape==='split-json'?{code:'permission_denied'}:{}),message:'Provider request failed'}});if(shape==='oversize')assert.equal(cancelled,true);}finally{await b.close();}
});
test('HTTP error inspection stops a never-ending body and retains HTTP status',async()=>{
 let cancelled=false;const b=bridge(async()=>new Response(new ReadableStream<Uint8Array>({cancel(){cancelled=true;}}),{status:401}),40);
 try{const r=await b.worker.fetch(url,{method:'POST',body:'{}'});assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:{message:'Provider request failed'}});assert.equal(cancelled,true);}finally{await b.close();}
});
test('close during HTTP error inspection publishes no late head or body',async()=>{
 let reading=false,cancelled=false;const replies:WireBody[]=[];
 const host=new ModelHttp(url,()=>{},async()=>new Response(new ReadableStream<Uint8Array>({pull(){reading=true;},cancel(){cancelled=true;}}),{status:403}));
 host.receive({type:'model-http',url,method:'POST',headers:{},body:'{}'},async reply=>{replies.push(reply);});
 while(!reading)await new Promise<void>(r=>setImmediate(r));
 const closing=host.close();assert.equal(host.close(),closing);await closing;assert.equal(cancelled,true);assert.deepEqual(replies,[]);
});
