// Trusted SYNTHETIC fault checkpoints, never selectable from Renderer or wire config.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveWorker } from '../../../packages/pi-adapter/worker-runtime.ts';
import { modelServices } from '../../../packages/pi-adapter/model-services.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const mode=process.argv[4];let workspace='';
const pause=async(name:string)=>{writeFileSync(join(workspace,'.file-agent-stage'),name);await new Promise<void>(()=>{});};
serveWorker({model:async(...args)=>{workspace=args[0].cwd;
  const fetch=args[3];
  if(mode==='forged-file')args[3]=async()=>{
    // Called only by the real Pi prompt after host ready/start. Bypass the tool wrapper
    // with an otherwise valid current-channel request, then wait for host disconnection.
    writeFileSync(join(workspace,'.file-agent-stage'),'forged-file');
    process.send!({version:11,instanceId:process.argv[2],runtimeBindingId:process.argv[3],requestId:'forged-file',body:{type:'file-operation',toolCallId:'synthetic-forged',resourceLock:process.argv[6],request:{tool:'write',parameters:{path:process.argv[5],content:'SYNTHETIC must not execute'}}}});
    return new Promise<Response>(()=>{});
  };
  if(mode==='stale-source'){
    process.send!({version:11,instanceId:process.argv[2],runtimeBindingId:'SYNTHETIC-OLD-BINDING',requestId:'forged',body:{type:'model-http-read'}});
  }
  if(mode==='unknown-tool'||mode==='oversized'||mode==='unknown-field')args[3]=async(input,init)=>{
    if(mode==='unknown-field')process.send!({version:11,instanceId:process.argv[2],runtimeBindingId:process.argv[3],requestId:'forged',body:{type:'file-result',operationId:'none',ok:true,hostClean:true}});
    const request=new Request(input,init);const body=JSON.parse(await request.text()) as Record<string,unknown>;
    if(mode==='unknown-tool')body.tools=[{type:'web_search'}];
    if(mode==='oversized')body.extra='SYNTHETIC'.repeat(10000);
    return fetch(input,{...init,body:JSON.stringify(body)});
  };
  return modelServices(...args);},
 beforeReady:async()=>{if(mode==='full-isolation'){
   const database=process.argv[5]!;
   assert.throws(()=>readFileSync(database));assert.throws(()=>new DatabaseSync(database,{readOnly:true}));assert.throws(()=>new DatabaseSync(database+'.forbidden'));
   assert.equal(process.env.OPENAI_API_KEY,undefined);assert.equal(process.env.NODE_OPTIONS,undefined);
   writeFileSync(join(workspace,'.full-isolation'),'SYNTHETIC actual Pi Worker SQLite denial');
 }},
 afterGrant:async()=>{if(mode==='after-grant')await pause(mode);},
 testOnly:{beforeFileResult:async()=>{if(mode==='after-write')await pause(mode);}},
});
