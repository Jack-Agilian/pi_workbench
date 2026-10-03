// SYNTHETIC protocol producer; tests real IPC and cancellation, not a Pi fixture.
import { parseEnvelope, type WireBody, type WorkerInit } from '../../../packages/app-contracts/worker-ipc.ts';
const instanceId=process.argv[2]!,runtimeBindingId=process.argv[3]!;
const send=(body:WireBody,requestId:string)=>new Promise<void>((resolve,reject)=>process.send!({version:9,instanceId,runtimeBindingId,requestId,body},error=>error?reject(error):resolve()));
let config:WorkerInit;
const presentation=(text:string):WireBody=>({type:'presentation',projection:{messages:[{id:'synthetic-display',role:'assistant',text,truncated:false}],omitted:false}});
process.on('message',raw=>{void (async()=>{
 const {body}=parseEnvelope(raw);
 if(body.type==='init'){config=body.config;await send({type:'ready',nativeRef:null,resourceLock:config.resources.id},'ready');}
 if(body.type==='start'){
  // Match paced display traffic; a flood that ignores transport backpressure is intentionally rejected.
  for(let i=1;i<=300;i++){await send(presentation('SYNTHETIC '+i),'presentation-'+i);await new Promise(r=>setTimeout(r,10));}
  await send(presentation('SYNTHETIC latest'),'presentation-301');await send(presentation('SYNTHETIC stale'),'presentation-1');
  const operation:WireBody={type:'operation',toolCallId:'synthetic-duplicate',tool:'write',target:'report.md',parametersDigest:process.argv[4]!,resourceLock:config.resources.id};
  await send(operation,'duplicate-control');await send(operation,'duplicate-control');
 }
 if(body.type==='cancel')await send({type:'done',ok:false},'done');
 if(body.type==='close'){await send({type:'closed',nativeRef:null},'closed');process.disconnect();}
 })().catch(()=>{if(process.connected)process.disconnect();});});
await send({type:'hello',pid:process.pid},'hello');
