import './check-environment.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { parseModelConfiguration } from '../packages/app-contracts/model.ts';
import { describeModel } from '../packages/pi-adapter/model-catalog.ts';
const [action,pathArg,...rest]=process.argv.slice(2);
if(!['init','init-openai','init-compatible','init-auth','check'].includes(action)||rest.length)throw new Error('Usage: npm run model:config -- init|init-openai|init-compatible|init-auth|check [path]');
const path=pathArg?resolve(pathArg):join(homedir(),'Library/Application Support/Pi Workbench',action==='init-auth'?'auth.json':'model.json');
if(action.startsWith('init')){
 mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const config={version:1,authorizationId:randomUUID(),approved:false,dataScope:'synthetic_non_sensitive',provider:action==='init'?'FILL_PROVIDER':'openai',model:'FILL_MODEL_ID',endpoint:action==='init-openai'?'https://api.openai.com/v1':'https://FILL_APPROVED_ENDPOINT/v1',timeoutMs:1800000,httpIdleTimeoutMs:300000,
 ...(action==='init-compatible'?{openai:{api:'chat-completions',maxTokens:0,contextWindow:0,inputUsdPerMillion:0,outputUsdPerMillion:0,tokenLimitField:'max_tokens'}}:{})};
 writeFileSync(path,JSON.stringify(action==='init-auth'?{openai:{type:'api_key',key:''}}:config,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(action==='init-auth'?'Created private credential configuration (0600):':'Created non-secret configuration:',path);console.log(action==='init-auth'?'Fill the key locally; contents are never printed.':'Fill provider/model/endpoint and limits; approved=false keeps network disabled. Put keys only in sibling auth.json.');
}else{
 try{const config=parseModelConfiguration(JSON.parse(readFileSync(path,'utf8')));const catalog=await describeModel(config.provider,config.model,config.maxOutputTokens,config);if(catalog.endpoint!==config.endpoint)throw new Error('endpoint_mismatch');console.log(JSON.stringify({valid:true,approved:config.approved,provider:config.provider,model:config.model,maxRequests:config.maxRequests,totalTimeoutMs:config.timeoutMs,httpIdleTimeoutMs:config.httpIdleTimeoutMs??config.timeoutMs,maxEstimatedCostUsd:config.maxEstimatedCostUsd??null}));}
 catch{console.error('Configuration incomplete, unsupported or invalid. No model request was made.');process.exitCode=1;}
}
