import './check-environment.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { parseModelConfiguration } from '../packages/app-contracts/model.ts';
import { describeModel } from '../packages/pi-adapter/model-catalog.ts';
const [action,pathArg,...rest]=process.argv.slice(2);
if(!['init','check'].includes(action)||rest.length)throw new Error('Usage: npm run model:config -- init|check [configuration-path]');
const path=pathArg?resolve(pathArg):join(homedir(),'Library/Application Support/Pi Workbench/model.json');
if(action==='init'){
 mkdirSync(dirname(path),{recursive:true,mode:0o700});
 writeFileSync(path,JSON.stringify({version:1,authorizationId:randomUUID(),approved:false,dataScope:'synthetic_non_sensitive',provider:'FILL_PROVIDER',model:'FILL_MODEL_ID',endpoint:'https://FILL_APPROVED_ENDPOINT',maxRequests:4,maxOutputTokens:512,timeoutMs:30000,maxEstimatedCostUsd:1},null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('Created non-secret configuration:',path);console.log('Fill provider/model/endpoint and limits; approved=false keeps network disabled. Never add an API key.');
}else{
 try{const config=parseModelConfiguration(JSON.parse(readFileSync(path,'utf8')));const catalog=await describeModel(config.provider,config.model,config.maxOutputTokens);if(catalog.endpoint!==config.endpoint)throw new Error('endpoint_mismatch');console.log(JSON.stringify({valid:true,approved:config.approved,provider:config.provider,model:config.model,maxRequests:config.maxRequests,reservePerRequestUsd:catalog.reserveCostUsd,priceSource:catalog.priceSource}));}
 catch{console.error('Configuration incomplete, unsupported or invalid. No model request was made.');process.exitCode=1;}
}
