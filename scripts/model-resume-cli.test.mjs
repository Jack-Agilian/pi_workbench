import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { mkdirSync,mkdtempSync,writeFileSync,readFileSync,rmSync,unlinkSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ProductCore } from '../apps/agent-server/core.ts';
import { legacyPolicyDigest } from '../apps/agent-server/model-policy.ts';
import { auditModelProfile } from '../apps/agent-server/model-audit.ts';
import { repository,sterileEnvironment } from '../apps/agent-server/worker-launcher.ts';
test('resume CLI isolated profile: exact requests/Session binding, immutable plan/report, no credential required to prepare',()=>{
 const root=mkdtempSync(join(tmpdir(),'resume-cli-'));const directory=join(root,'Library/Application Support/Pi Workbench'),profile=join(directory,'model-profile');
 mkdirSync(join(profile,'host'),{recursive:true});mkdirSync(join(profile,'workspace'));
 const config={version:1,authorizationId:'synthetic-resume-cli',approved:true,dataScope:'synthetic_non_sensitive',provider:'openai',model:'gpt-6-luna',endpoint:'https://synthetic.invalid/v1',maxRequests:4,maxOutputTokens:512,timeoutMs:30000,maxEstimatedCostUsd:1};
 const marker=createHash('sha256').update(config.authorizationId).digest('hex').slice(0,16);
 let core=new ProductCore(join(profile,'host/product.sqlite'),[{id:'demo-workspace',path:join(profile,'workspace')}]);
 try{
  writeFileSync(join(directory,'model.json'),JSON.stringify(config));
  const thread=core.handle({type:'threads.create',requestId:`live-${marker}-thread`,workspaceId:'demo-workspace',title:'SYNTHETIC'}).id;
  const first=core.handle({type:'runs.start',requestId:`live-${marker}-first`,threadId:thread,input:'This is a synthetic, non-sensitive integration check. Remember the synthetic token cedar-47 for my next message. Reply with exactly M1-LIVE-OK and nothing else.'}).id;
  const reserveLegacy=b=>{const fixture=new DatabaseSync(join(profile,'host/product.sqlite'));try{fixture.prepare('INSERT INTO model_requests VALUES (?,?,?,?,?,1)').run(b.runId,config.authorizationId,legacyPolicyDigest(config),0.1,'legacy:'+b.runId);}finally{fixture.close();}};
  const b=core.dispatchNext();core.markRunning(b);reserveLegacy(b);
  // Synthetic host metadata only, not a fabricated native JSONL or SDK fixture.
  core.bindNativeSession(b,join(profile,'synthetic-native-reference'));core.settle(b,'completed',{piIdle:true,hostClean:true});
  core.handle({type:'runs.start',requestId:`live-${marker}-resume`,threadId:thread,input:'SYNTHETIC failed request'});
  const b2=core.dispatchNext();core.markRunning(b2);reserveLegacy(b2);core.settle(b2,'failed',{piIdle:true,hostClean:true});
  const audit=auditModelProfile(profile,config,0.1);assert.equal(audit.used,2);assert.equal(audit.threadId,thread);assert.equal(audit.firstRunId,first);
  const original=join(profile,`live-validation-${marker}.json`);writeFileSync(original,JSON.stringify({provider:config.provider,model:config.model,hostClosed:true,stages:[{stage:'first',state:'completed',replyMatches:true}]}));
  const originalBytes=readFileSync(original);
  const cli=(args,status)=>{const r=spawnSync(process.execPath,['--import',join(repository,'scripts/probe-no-network.mjs'),join(repository,'scripts/validate-model-resume.mjs'),...args],{env:sterileEnvironment(root),cwd:root,encoding:'utf8',timeout:20000});assert.equal(r.status,status,r.stdout+r.stderr);return r.stdout+r.stderr;};
  cli(['prepare','synthetic-attempt'],0);const plan=join(profile,'live-resume-synthetic-attempt.plan.json');const bytes=readFileSync(plan);
  cli(['prepare','synthetic-attempt'],1);assert.deepEqual(readFileSync(plan),bytes);
  const result=join(profile,'live-resume-synthetic-attempt.result.json');
  const lock=join(profile,'live-validation.lock');writeFileSync(lock,'SYNTHETIC interrupted validator');
  assert.match(cli(['execute-approved','synthetic-attempt'],1),/resume_validation_locked/);
  assert.equal(readFileSync(lock,'utf8'),'SYNTHETIC interrupted validator');assert.equal(existsSync(result),false);
  assert.equal(core.modelAdmission(config,0.1).used,2);assert.equal(core.workerLaunches().length,0);
  unlinkSync(lock); // Test fixture only: the product never removes an unowned lock.
  writeFileSync(result,'{"syntheticExistingAttempt":true}');
  assert.match(cli(['execute-approved','synthetic-attempt'],1),/resume_attempt_already_started/);
  assert.equal(readFileSync(result,'utf8'),'{"syntheticExistingAttempt":true}');assert.deepEqual(readFileSync(original),originalBytes);
  assert.equal(core.modelAdmission(config,0.1).used,2);
  assert.throws(()=>auditModelProfile(profile,{...config,authorizationId:'wrong'},0.1),/missing/);
  const candidate={...config,maxRequests:undefined},previousFile=join(directory,'previous.json'),candidateFile=join(directory,'candidate.json');
  writeFileSync(previousFile,JSON.stringify(config));writeFileSync(candidateFile,JSON.stringify(candidate));
  const policy=action=>spawnSync(process.execPath,['--import',join(repository,'scripts/probe-no-network.mjs'),join(repository,'scripts/model-policy.mjs'),action,previousFile,candidateFile,'SYNTHETIC-unlimited'],{env:sterileEnvironment(root),cwd:root,encoding:'utf8',timeout:20000});
  assert.equal(policy('check').status,1);
  assert.equal(policy('check-requests').status,0);
  assert.equal(auditModelProfile(profile,candidate,0.1).status,'policy_required');
  const applied=policy('apply-approved-requests');assert.equal(applied.status,0,applied.stderr);
  assert.equal(policy('apply-approved-requests').status,0);
  const unlimited=auditModelProfile(profile,candidate,0.1);assert.equal(unlimited.remainingRequests,null);assert.equal(unlimited.status,'ready');assert.equal(unlimited.used,2);assert.equal(unlimited.reserved,0.2);

 }finally{core.close();rmSync(root,{recursive:true,force:true});}
});
