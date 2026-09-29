// SYNTHETIC provider only; this actual App Server is SIGKILLed externally.
import { existsSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScenario,until } from './scenario.ts';
import { syntheticReply } from './file-agent-fixture.ts';
import { parseModelConfiguration,type ModelSelection } from '../../../packages/app-contracts/model.ts';
const f=createScenario(),phase=process.argv[3];
const model:ModelSelection={mode:'live',provider:'openai',model:'SYNTHETIC',endpoint:'https://synthetic.invalid/v1',maxOutputTokens:1024,timeoutMs:5000,openai:{api:'chat-completions',contextWindow:8192,inputUsdPerMillion:1,outputUsdPerMillion:1},fileTools:{maxOperations:4,maxModelRequests:3,operationTimeoutMs:30000}};
const {mode:_mode,...fields}=model;
const configuration=parseModelConfiguration({version:1,authorizationId:'SYNTHETIC-host-kill',approved:true,dataScope:'synthetic_non_sensitive',...fields,maxRequests:3,maxEstimatedCostUsd:1});
const fixture=join(import.meta.dirname,'file-agent-worker.ts');
void f.supervisor.startNext({tool:'none',model,deadline:Date.now()+60000},{path:fixture,extraRead:[fixture],args:['after-write']},{key:'SYNTHETIC_KEY',configuration,requestUrl:model.endpoint+'/chat/completions',reserveCostUsd:0.01,fetch:async()=>new Response(syntheticReply('chat-completions',1,[{tool:'write',parameters:{path:'report.md',content:'# SYNTHETIC host death\n'}}]),{headers:{'content-type':'text/event-stream'}})})?.catch(()=>{});
await until(()=>f.core.snapshot(f.thread).operations.some(o=>o.state==='pending'),'approval');
if(phase==='after-write'){
 const op=f.core.snapshot(f.thread).operations[0]!;
 f.supervisor.command({type:'approvals.resolve',requestId:'allow',operationId:op.id,parametersDigest:op.parametersDigest,decision:'allow'});
 await until(()=>existsSync(join(f.cwd,'.file-agent-stage')),'written');
}
writeFileSync(process.argv[2]!,JSON.stringify({root:f.root,cwd:f.cwd,database:f.database,thread:f.thread,resources:f.resources,workerPid:f.supervisor.workerPid}),{mode:0o600});
setInterval(()=>{},1000);
