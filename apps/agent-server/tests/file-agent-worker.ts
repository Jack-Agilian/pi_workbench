// Trusted SYNTHETIC fault checkpoints, never selectable from Renderer or wire config.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveWorker } from '../../../packages/pi-adapter/worker-runtime.ts';
import { modelServices } from '../../../packages/pi-adapter/model-services.ts';
const mode=process.argv[4];let workspace='';
const pause=async(name:string)=>{writeFileSync(join(workspace,'.file-agent-stage'),name);await new Promise<void>(()=>{});};
serveWorker({model:async(...args)=>{workspace=args[0].cwd;
  const fetch=args[3];
  if(mode==='stale-source'){
    process.send!({version:8,instanceId:process.argv[2],runtimeBindingId:'SYNTHETIC-OLD-BINDING',requestId:'forged',body:{type:'model-http-read'}});
  }
  if(mode==='unknown-tool'||mode==='oversized'||mode==='unknown-field')args[3]=async(input,init)=>{
    if(mode==='unknown-field')process.send!({version:8,instanceId:process.argv[2],runtimeBindingId:process.argv[3],requestId:'forged',body:{type:'file-result',operationId:'none',ok:true,hostClean:true}});
    const request=new Request(input,init);const body=JSON.parse(await request.text()) as Record<string,unknown>;
    if(mode==='unknown-tool')body.tools=[{type:'web_search'}];
    if(mode==='oversized')body.extra='SYNTHETIC'.repeat(10000);
    return fetch(input,{...init,body:JSON.stringify(body)});
  };
  return modelServices(...args);},
 afterGrant:async()=>{if(mode==='after-grant')await pause(mode);},
 testOnly:{beforeFileResult:async()=>{if(mode==='after-write')await pause(mode);}},
});
