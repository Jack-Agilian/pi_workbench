import { resumeStages } from './model-resume-stages.mjs';
// Explicit additive continuation. Preparation is read-only with respect to the product database.
import './check-environment.mjs';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,existsSync,openSync,closeSync,unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { identifier } from '../packages/app-contracts/index.ts';
import { parseModelConfiguration } from '../packages/app-contracts/model.ts';
import { auditModelProfile } from '../apps/agent-server/model-audit.ts';
import { HostClient } from '../apps/desktop/host-client.ts';
import { repository } from '../apps/agent-server/worker-launcher.ts';
import { describeModel } from '../packages/pi-adapter/model-catalog.ts';
const [action,attemptId,...extra]=process.argv.slice(2);
if(!['prepare','execute-approved'].includes(action)||!attemptId||extra.length)throw new Error('Usage: validate:model-resume prepare|execute-approved attempt-id');
identifier(attemptId);assert.ok(attemptId.length<=64,'attempt-id too long');
const directory=join(homedir(),'Library/Application Support/Pi Workbench'),profile=join(directory,'model-profile'),configPath=join(directory,'model.json');
const planPath=join(profile,`live-resume-${attemptId}.plan.json`),resultPath=join(profile,`live-resume-${attemptId}.result.json`),lock=join(profile,'live-validation.lock');
if(action==='execute-approved'){
 // An interrupted attempt may already have changed the ledger. Diagnose it before
 // checking a new plan, and never steal its lock or load credentials to replay it.
 assert.equal(existsSync(resultPath),false,'resume_attempt_already_started: inspect the saved result and product audit; do not delete records or replay');
 assert.equal(existsSync(lock),false,'resume_validation_locked: another or interrupted validator owns the profile; inspect its process, result and product audit before recovery');
}
const config=parseModelConfiguration(JSON.parse(readFileSync(configPath,'utf8')));
assert.equal(config.approved,true);
const catalog=await describeModel(config.provider,config.model,config.maxOutputTokens,config);
const audit=auditModelProfile(profile,config,catalog.reserveCostUsd);
const originalPath=join(profile,`live-validation-${audit.marker}.json`),originalBytes=readFileSync(originalPath),original=JSON.parse(originalBytes);
assert.equal(original.stages?.find(s=>s.stage==='first')?.replyMatches,true);
assert.equal(original.stages?.find(s=>s.stage==='first')?.state,'completed');
assert.equal(original.hostClosed,true);assert.equal(original.provider,config.provider);assert.equal(original.model,config.model);
assert.equal(audit.active,0);assert.equal(audit.status,'ready');
assert.ok((audit.remainingRequests===null || audit.remainingRequests>=2) && audit.remainingReservedUsd>=catalog.reserveCostUsd*2,'Two bounded new requests must fit the existing authorization');
const plan={version:1,attemptId,authorizationId:config.authorizationId,originalSha256:createHash('sha256').update(originalBytes).digest('hex'),audit,
 timeoutMs:config.timeoutMs,httpIdleTimeoutMs:config.httpIdleTimeoutMs??config.timeoutMs,reservePerRequestUsd:catalog.reserveCostUsd,maxNewRequests:2,stages:['resume','cancel']};
if(action==='prepare'){
 writeFileSync(planPath,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({prepared:true,attemptId,used:audit.used,newRequests:2,timeoutMs:config.timeoutMs,planPath}));
}else{
 assert.deepEqual(JSON.parse(readFileSync(planPath,'utf8')),plan,'Plan/config/ledger changed: prepare a reviewed new plan before executing');
 closeSync(openSync(lock,'wx',0o600));
 const result={attemptId,threadId:audit.threadId,firstRunId:audit.firstRunId,nativeSessionRef:audit.nativeSessionRef,startedAt:new Date().toISOString(),stages:[],completed:false,hostClosed:false};
 let client,started=false;
 const save=()=>writeFileSync(resultPath,JSON.stringify(result,null,2)+'\n',{mode:0o600});
 try{
  writeFileSync(resultPath,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});started=true;
  client=new HostClient(process.execPath,repository,profile,'--model',configPath);
  await client.connect();const home=await client.request({type:'home'});assert.equal(home.model?.status,'ready');assert.equal(home.recovery,'ready');assert.equal(home.activeRuns.length,0);
  await resumeStages({client,threadId:audit.threadId,attemptId,timeoutMs:config.timeoutMs,result,save});
  result.completed=true;
 }catch{result.failure='resume_validation_stopped_inspect_audit';process.exitCode=1;}
 finally{
  if(client)try{await client.close();result.hostClosed=true;}catch{result.completed=false;process.exitCode=1;}
  if(started)try{result.finalAudit=auditModelProfile(profile,config,catalog.reserveCostUsd);}catch{result.completed=false;process.exitCode=1;}
  result.finishedAt=new Date().toISOString();if(started)save();unlinkSync(lock);
 }
 console.log(JSON.stringify({attemptId,completed:result.completed,hostClosed:result.hostClosed,resultPath}));
}
