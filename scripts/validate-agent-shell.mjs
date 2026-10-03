// Manual real-model acceptance through the ordinary DesktopHost/Worker chain.
// Every tool decision is entered at the terminal; this does not implement an Agent loop.
import './check-environment.mjs';
import assert from 'node:assert/strict';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, openSync, closeSync, unlinkSync, renameSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { HostClient } from '../apps/desktop/host-client.ts';
import { repository } from '../apps/agent-server/worker-launcher.ts';
import { parseModelConfiguration } from '../packages/app-contracts/model.ts';
import { policyDigest } from '../apps/agent-server/model-policy.ts';
import { describeModel } from '../packages/pi-adapter/model-catalog.ts';
import { fileRunDuration } from '../packages/app-contracts/file-tools.ts';
import { displayText } from '../packages/app-contracts/presentation.ts';
import { auditLedger, runEvidence } from './file-acceptance-plan.mjs';
const [action,attempt,workspaceArgument,...extra]=process.argv.slice(2);
assert.ok(action==='--execute-approved' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(attempt??'') && workspaceArgument && !extra.length,
 'Usage: validate:agent-shell --execute-approved attempt-id /approved/synthetic/workspace');
assert.ok(stdin.isTTY && stdout.isTTY,'interactive_terminal_required');
const directory=join(homedir(),'Library/Application Support/Pi Workbench'),configPath=join(directory,'model.json'),profile=join(directory,'model-profile');
const config=parseModelConfiguration(JSON.parse(readFileSync(configPath,'utf8'))),workspace=realpathSync(workspaceArgument);
assert.ok(config.approved && config.dataScope==='synthetic_non_sensitive' && config.fileTools && config.shellTools,'approved_tool_scope_required');
assert.equal(config.maxRequests??null,null,'product_request_count_must_be_uncapped');assert.equal(config.fileTools.maxModelRequests??null,null,'product_request_count_must_be_uncapped');
assert.ok(statSync(workspace).isDirectory());
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const state=path=>existsSync(path)?{digest:hash(readFileSync(path)),mtime:statSync(path,{bigint:true}).mtimeNs.toString()}:null;
const seeds=Object.fromEntries(['README.md','data.md','check.sh'].map(name=>[name,state(join(workspace,name))]));
assert.ok(Object.values(seeds).every(Boolean),'synthetic_project_required');
assert.ok(['report.md','refused.txt','cancel-started.txt','cancel-late.txt'].every(name=>!existsSync(join(workspace,name))),'fresh_synthetic_outputs_required');
assert.equal(execFileSync('git',['-C',repository,'status','--porcelain'],{encoding:'utf8'}).trim(),'','worktree_must_be_clean');
const commit=execFileSync('git',['-C',repository,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
let owners='';try{owners=execFileSync('/usr/sbin/lsof',['-t','--',join(profile,'host/product.sqlite')],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch(e){assert.equal(e.status,1,'profile_owner_check_failed');}assert.equal(owners,'','close_other_profile_hosts');
const catalog=await describeModel(config.provider,config.model,config.maxOutputTokens,config);
assert.equal(catalog.endpoint,config.endpoint);const before=auditLedger(profile,config,catalog.reserveCostUsd);assert.equal(before.active,0);
assert.ok(before.remainingReservedUsd===null || before.remainingReservedUsd>=catalog.reserveCostUsd,'cost_budget_insufficient');
const resultPath=join(profile,`agent-task-${attempt}.json`),lockPath=join(profile,'live-validation.lock'),nonce=randomUUID();
assert.equal(existsSync(resultPath),false,'attempt_already_exists');
const lock=openSync(lockPath,'wx',0o600);writeFileSync(lock,JSON.stringify({nonce,pid:process.pid,attempt}));closeSync(lock);
const result={version:1,attempt,commit,startedAt:new Date().toISOString(),model:config.model,provider:config.provider,policyDigest:policyDigest(config),workspace,seedDigests:seeds,
 before,stages:[],completed:false,hostClosed:false};
const save=()=>{const temp=resultPath+'.'+nonce+'.tmp';writeFileSync(temp,JSON.stringify(result,null,2)+'\n',{mode:0o600});renameSync(temp,resultPath);};
const rl=createInterface({input:stdin,output:stdout}),client=new HostClient(process.execPath,repository,profile,'--model',configPath);
const pause=()=>new Promise(r=>setTimeout(r,100));let selectedWorkspace,normalThread,normalNative,reportState;
const prompts={
 normal:'This is a synthetic non-sensitive offline project. Inspect README.md and the project files, use Bash to run the existing check.sh, and use the write tool to create report.md summarizing the actual check result with its count, sum and synthetic marker. Do not modify the input files or check script. Work only in this workspace, with no network. Every tool operation requires approval. Do not invent check results. Finish with a short summary.',
 deny:'Synthetic refusal check. Request a Bash command that creates refused.txt containing a SYNTHETIC note. Wait for approval. Never retry a refusal; do not access other files.',
 cancel:'Synthetic active cancellation check. Request exactly this Bash command: printf started > cancel-started.txt; sleep 20; printf late > cancel-late.txt . Do not include the final sentence punctuation in the command. Set timeout to 30 seconds. Wait for approval; never retry cancellation.',
 resume:'Without calling tools or rereading files, recall the count, sum and synthetic marker from the preceding successful check. Reply briefly in this same conversation.'
};
try{
 save();await client.connect();await client.selectWorkspace(workspace);const home=await client.request({type:'home'});assert.equal(home.model.status,'ready');assert.equal(home.recovery,'ready');selectedWorkspace=home.workspaces.selectedId;
 console.log(JSON.stringify({commit,model:config.model,requestCount:'uncapped',workspace}));
 for(const stage of ['normal','deny','cancel','resume']){
  assert.equal(policyDigest(parseModelConfiguration(JSON.parse(readFileSync(configPath,'utf8')))),result.policyDigest,'configuration_changed');
  assert.equal(execFileSync('git',['-C',repository,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),commit,'code_changed');
  if(stage==='resume')await client.reconnect();
  const now=await client.request({type:'home'});assert.equal(now.model.status,'ready');assert.equal(now.recovery,'ready');assert.equal(now.activeRuns.length,0);
  const threadId=stage==='resume'?normalThread:(await client.request({type:'command',command:{type:'threads.create',requestId:`agent-${attempt}-${stage}-thread`,workspaceId:selectedWorkspace,title:`Synthetic Agent task ${stage}`}})).id;
  if(stage==='normal')normalThread=threadId;
  const record={stage,threadId,decisions:[]};result.stages.push(record);save();
  const command={type:'runs.start',requestId:`agent-${attempt}-${stage}`,threadId,input:prompts[stage]};record.runId=(await client.request({type:'command',command})).id;save();
  assert.equal((await client.request({type:'command',command})).id,record.runId,'duplicate_run_start');
  const duration=fileRunDuration(config.fileTools,config.timeoutMs,{total:config.maxEstimatedCostUsd,perRequest:catalog.reserveCostUsd});
  const deadline=duration===null?null:Date.now()+duration+15000;
  let snapshot,run,cancelled=false;const decided=new Set();
  while((deadline===null || Date.now()<deadline)){
   snapshot=await client.request({type:'thread',threadId});run=snapshot.runs.find(r=>r.id===record.runId);
   if(run && ['completed','failed','cancelled','unknown'].includes(run.state))break;
   for(const op of snapshot.operations.filter(o=>o.runId===record.runId&&o.state==='pending')){
    if(decided.has(op.id))continue;
    console.log(displayText(JSON.stringify({stage,operation:op.id,tool:op.tool,path:op.artifactPath,command:op.shell?.intent.command,preview:op.file?.preview,digest:op.parametersDigest,deadline:op.deadline}),8000));
    const choice=await rl.question('Review exact operation; type allow, deny or stop: ',{signal:AbortSignal.timeout(Math.max(1,op.deadline-Date.now()))});
    assert.ok(['allow','deny'].includes(choice),'operator_stopped');if(stage==='deny')assert.equal(choice,'deny');if(stage==='resume')assert.equal(choice,'deny','resume_must_not_run_tools');
    record.decisions.push({operationId:op.id,parametersDigest:op.parametersDigest,choice});save();decided.add(op.id);
    const approve={type:'approvals.resolve',requestId:`agent-${attempt}-${stage}-${decided.size}`,operationId:op.id,parametersDigest:op.parametersDigest,decision:choice};
    await client.request({type:'command',command:approve});await client.request({type:'command',command:approve});
   }
   if(stage==='cancel'&&!cancelled&&existsSync(join(workspace,'cancel-started.txt'))&&snapshot.operations.some(o=>o.runId===record.runId&&o.state==='executing')){
    await client.request({type:'command',command:{type:'runs.cancel',requestId:`agent-${attempt}-cancel-active`,runId:record.runId}});cancelled=true;record.activeCancellation=true;save();
   }
   await pause();
  }
  assert.ok(run && ['completed','failed','cancelled','unknown'].includes(run.state),'validation_deadline');record.state=run.state;
  record.snapshot=snapshot;record.evidence=runEvidence(profile,record.runId);save();
  assert.equal(run.state,stage==='deny'?'failed':stage==='cancel'?'cancelled':'completed');
  for(const [name,original] of Object.entries(seeds))assert.deepEqual(state(join(workspace,name)),original,'seed_changed');
  assert.equal(existsSync(join(workspace,'refused.txt')),false);assert.equal(existsSync(join(workspace,'cancel-late.txt')),false);
  if(stage==='normal'){
   assert.ok(snapshot.operations.some(o=>o.runId===record.runId&&o.tool==='bash'&&o.state==='succeeded'),'real_check_bash_required');
   assert.ok(snapshot.artifacts.some(a=>a.path==='report.md'),'registered_report_required');
   const text=readFileSync(join(workspace,'report.md'),'utf8');assert.match(text,/\b3\b/);assert.match(text,/\b10\b/);assert.match(text,/cedar-shell-30/);assert.match(text,/pass/i);
   reportState=state(join(workspace,'report.md'));normalNative=record.evidence.nativeRef;assert.ok(record.evidence.nativePersisted&&normalNative);
  }else{assert.deepEqual(state(join(workspace,'report.md')),reportState,'report_rewritten');}
  if(stage==='deny')assert.ok(record.evidence.operations.length===1&&record.evidence.operations[0].state==='denied');
  if(stage==='cancel')assert.ok(cancelled&&record.evidence.operations.some(o=>o.state==='failed'));
  if(stage==='resume'){
   assert.equal(record.evidence.nativeRef,normalNative);assert.equal(record.evidence.operations.length,0);
   const response=snapshot.presentations.find(p=>p.runId===record.runId)?.value.messages.filter(m=>m.role==='assistant').at(-1)?.text??'';
   assert.match(response,/cedar-shell-30/);assert.match(response,/\b10\b/);assert.match(response,/\b3\b/);
  }
  record.passed=true;save();console.log(JSON.stringify({stage,state:run.state,passed:true,requests:record.evidence.requests.length}));
 }
 result.completed=true;
}catch{result.failure='stopped_inspect_durable_task';process.exitCode=1;}
finally{
 rl.close();try{await client.close();result.hostClosed=true;}catch{result.completed=false;process.exitCode=1;}
 try{result.after=auditLedger(profile,config,catalog.reserveCostUsd);assert.equal(result.before.priorAuthorizationsDigest,result.after.priorAuthorizationsDigest);}catch{result.completed=false;process.exitCode=1;}
 result.finishedAt=new Date().toISOString();save();
 if(result.hostClosed&&JSON.parse(readFileSync(lockPath,'utf8')).nonce===nonce)unlinkSync(lockPath);
 console.log(JSON.stringify({completed:result.completed,hostClosed:result.hostClosed,resultPath}));
}
