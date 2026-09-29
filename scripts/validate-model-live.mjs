// Explicit manual acceptance driver; never part of automatic tests. Uses product commands only.
import './check-environment.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { HostClient } from '../apps/desktop/host-client.ts';
import { repository } from '../apps/agent-server/worker-launcher.ts';
import { parseModelConfiguration } from '../packages/app-contracts/model.ts';
import { describeModel } from '../packages/pi-adapter/model-catalog.ts';
const args=process.argv.slice(2);
if(args.length!==1||args[0]!=='--execute-approved')throw new Error('Explicit --execute-approved required; this command sends up to three real model requests.');
const directory=join(homedir(),'Library/Application Support/Pi Workbench');const configPath=join(directory,'model.json');
const config=parseModelConfiguration(JSON.parse(readFileSync(configPath,'utf8')));
assert.equal(config.approved,true,'Configuration must explicitly approve this authorization.');
assert.equal(config.dataScope,'synthetic_non_sensitive');
const catalog=await describeModel(config.provider,config.model,config.maxOutputTokens,config);assert.equal(catalog.endpoint,config.endpoint);
// Reuse the normal product profile and budget ledger, never reset limits by changing databases.
const profile=join(directory,'model-profile');mkdirSync(profile,{recursive:true,mode:0o700});
const marker=createHash('sha256').update(config.authorizationId).digest('hex').slice(0,16);
const reportPath=join(profile,`live-validation-${marker}.json`);const lock=join(profile,'live-validation.lock');
assert.equal(existsSync(reportPath),false,'This authorization already has a validation attempt; inspect its durable report before any further call.');
const fd=openSync(lock,'wx',0o600);closeSync(fd);
const report={startedAt:new Date().toISOString(),provider:config.provider,model:config.model,priceSource:catalog.priceSource,reservePerRequestUsd:catalog.reserveCostUsd,limits:{requests:config.maxRequests,estimatedUsd:config.maxEstimatedCostUsd,outputTokens:config.maxOutputTokens},stages:[],completed:false};
const save=()=>writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});save();
const client=new HostClient(process.execPath,repository,profile,'--model',configPath);let threadId;
const snapshot=()=>client.request({type:'thread',threadId});
const pause=()=>new Promise(r=>setTimeout(r,40));
async function run(stage,input,cancel=false){
 const start=Date.now();const ack=await client.request({type:'command',command:{type:'runs.start',requestId:`live-${marker}-${stage}`,threadId,input}});let cancelSent=false,observedStream=false;let value;
 while(Date.now()-start<config.timeoutMs+20000){
  const snap=await snapshot();const current=snap.runs.find(r=>r.id===ack.id);const messages=snap.presentations.find(p=>p.runId===ack.id)?.value.messages??[];const assistant=messages.filter(m=>m.role==='assistant').at(-1);
  if(current?.state==='running'&&assistant?.text){observedStream=true;if(cancel&&!cancelSent){await client.request({type:'command',command:{type:'runs.cancel',requestId:`live-${marker}-cancel`,runId:ack.id}});cancelSent=true;}}
  if(current&&['completed','failed','cancelled','unknown'].includes(current.state)){value={stage,state:current.state,observedStream,cancelSent,milliseconds:Date.now()-start,outcome:snap.modelOutcomes?.find(o=>o.runId===ack.id)?.value,zeroOperations:snap.operations.length===0,replyMatches:cancel?null:stage==='first'?assistant?.text.trim()==='M1-LIVE-OK':assistant?.text.includes('cedar-47')===true};break;}
  await pause();
 }
 if(!value)throw new Error('validation_deadline');report.stages.push(value);save();console.log(JSON.stringify(value));
 assert.equal(value.zeroOperations,true);assert.equal(value.state,cancel?'cancelled':'completed');if(!cancel)assert.equal(value.replyMatches,true);else assert.equal(cancelSent,true,'A completed response is not active cancellation evidence.');
}
try{
 await client.connect();const home=await client.request({type:'home'});assert.equal(home.model?.status,'ready');assert.equal(home.recovery,'ready');assert.equal(home.activeRuns.length,0);
 const ack=await client.request({type:'command',command:{type:'threads.create',requestId:`live-${marker}-thread`,workspaceId:'demo-workspace',title:'M1 live acceptance · synthetic inputs'}});threadId=ack.id;
 await run('first','This is a synthetic, non-sensitive integration check. Remember the synthetic token cedar-47 for my next message. Reply with exactly M1-LIVE-OK and nothing else.');
 await client.reconnect();report.reconnected=true;save();
 await run('resume','What synthetic token did I ask you to remember? Reply with that token only.');
 await run('cancel','Write a long numbered list from 1 to 200, spelling every integer in English and adding a short sentence for each. This is a synthetic cancellation test. Do not summarize or skip numbers.',true);
 report.completed=true;
}catch{report.failure='validation_failed_inspect_stage_and_native_audit';process.exitCode=1;}
finally{
 try{await client.close();report.hostClosed=true;}catch{report.hostClosed=false;report.completed=false;process.exitCode=1;}
 report.finishedAt=new Date().toISOString();save();unlinkSync(lock);console.log(JSON.stringify({completed:report.completed,hostClosed:report.hostClosed,report:resolve(reportPath)}));
}
