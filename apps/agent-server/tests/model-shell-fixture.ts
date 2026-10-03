// Synthetic provider bytes, actual Pi tools / guardian / filesystem. Never uses a real account.
import type { ModelExecutionPlan } from '../worker-supervisor.ts';
import { join } from 'node:path';
import { createScenario, until } from './scenario.ts';
import { repository } from '../worker-launcher.ts';
import { parseModelConfiguration, type ModelSelection } from '../../../packages/app-contracts/model.ts';
export const entry={path:join(repository,'packages/pi-adapter/model-worker.ts')};
export function setupShell(api:'responses'|'chat-completions'='chat-completions',uncapped=false){
 const f=createScenario('normal',false,'model-shell-');
 const model:ModelSelection={mode:'live',provider:'openai',model:'SYNTHETIC-shell-model',endpoint:'https://synthetic.invalid/v1',maxOutputTokens:1024,timeoutMs:5000,openai:{api,contextWindow:8192,inputUsdPerMillion:1,outputUsdPerMillion:1},fileTools:{maxOperations:8,maxModelRequests:4,operationTimeoutMs:15000},shellTools:{maxCommands:4,timeoutMs:10000,profile:'restricted-bash-v1'}};
 const {mode,...policy}=model;
 const configuration=parseModelConfiguration({...policy,version:1,authorizationId:'SYNTHETIC-shell-authorization',approved:true,dataScope:'synthetic_non_sensitive',maxRequests:4,maxEstimatedCostUsd:1});
 const access={configuration,key:'SYNTHETIC-key',requestUrl:model.endpoint+(api==='responses'?'/responses':'/chat/completions'),reserveCostUsd:0.01};
 if(uncapped){delete configuration.maxEstimatedCostUsd;delete configuration.maxRequests;delete model.fileTools!.maxModelRequests;}
 const plan:ModelExecutionPlan={tool:'none',model,deadline:uncapped?null:Date.now()+45000};
 return {f,model,access,plan};
}

export async function approveShell(f:ReturnType<typeof createScenario>,decision:'allow'|'deny'='allow'){
 await until(()=>f.core.snapshot(f.thread).operations.some(o=>o.state==='pending'),'shell-approval');
 const op=f.core.snapshot(f.thread).operations.find(o=>o.state==='pending')!;
 const command={type:'approvals.resolve' as const,requestId:'approve-'+op.id,operationId:op.id,parametersDigest:op.parametersDigest,decision};
 f.supervisor.command(command);f.supervisor.command(command);return op;
}
