import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ProductCore } from '../core.ts';
import { policyDigest,legacyPolicyDigest } from '../model-policy.ts';
import { parseModelConfiguration } from '../../../packages/app-contracts/model.ts';
const config=parseModelConfiguration({version:1,authorizationId:'synthetic-policy-review',approved:true,dataScope:'synthetic_non_sensitive',provider:'openai',model:'synthetic',endpoint:'https://synthetic.invalid/v1',maxRequests:4,maxOutputTokens:512,timeoutMs:30000,maxEstimatedCostUsd:1,openai:{api:'responses',contextWindow:4096,inputUsdPerMillion:1,outputUsdPerMillion:2}});
const reordered=parseModelConfiguration(Object.fromEntries(Object.entries({...config,openai:Object.fromEntries(Object.entries(config.openai!).reverse())}).reverse()));
test('R01 canonical top-level and nested order; semantic change differs',()=>{
 assert.notEqual(legacyPolicyDigest(config),legacyPolicyDigest(reordered));assert.equal(policyDigest(config),policyDigest(reordered));
 assert.notEqual(policyDigest(config),policyDigest({...config,timeoutMs:90000}));
});
test('R01/R02 actual ProductCore: legacy 2/4, migration, explicit timeout revision, reopen, exhaustion',()=>{
 const dir=mkdtempSync(join(tmpdir(),'model-policy-'));const path=join(dir,'db');let core=new ProductCore(path,[{id:'ws',path:dir}]);
 const thread=core.handle({type:'threads.create',requestId:'thread',workspaceId:'ws',title:'SYNTHETIC policy'}).id;
 let seq=0;
 function reserve(legacy=false,c=config){
  const run=core.handle({type:'runs.start',requestId:`request-${++seq}`,threadId:thread,input:'SYNTHETIC'}).id;
  const binding=core.dispatchNext()!;core.markRunning(binding);
  if(legacy){const fixture=new DatabaseSync(path);try{fixture.prepare('INSERT INTO model_requests VALUES (?,?,?,?)').run(run,c.authorizationId,legacyPolicyDigest(c),0.1);}finally{fixture.close();}}else core.reserveConfiguredModelRequest(binding,c,0.1);
  core.settle(binding,'completed',{piIdle:true,hostClean:true});return run;
 }
 try{
  reserve(true);reserve(true);core.close();
  const old=new DatabaseSync(path);old.exec('DROP TABLE model_policy_revisions; PRAGMA user_version=6;');const before=old.prepare('SELECT * FROM model_requests ORDER BY rowid').all();old.close();
  core=new ProductCore(path,[]);assert.equal(core.modelAdmission(reordered,0.1).status,'policy_required');
  assert.throws(()=>core.reviseModelPolicy(reordered,{...reordered,timeoutMs:90000},'bad-proof'),/unproven/);
  core.reviseModelPolicy(config,reordered,'legacy-proof');assert.equal(core.modelAdmission(reordered,0.1).status,'ready');
  const changed={...reordered,timeoutMs:90000};assert.equal(core.modelAdmission(changed,0.1).status,'policy_required');
  for(const c of [{...changed,maxRequests:5},{...changed,maxEstimatedCostUsd:2},{...changed,authorizationId:'new-id'},{...changed,endpoint:'https://other.invalid'}])assert.throws(()=>core.reviseModelPolicy(reordered,c,'scope-denial'),/scope/);
  core.reviseModelPolicy(reordered,changed,'timeout-approved');core.reviseModelPolicy(reordered,changed,'timeout-approved');
  assert.throws(()=>core.reviseModelPolicy(reordered,{...changed,timeoutMs:80000},'timeout-approved'),/conflict/);
  assert.deepEqual(core.modelAdmission(changed,0.1),{status:'ready',used:2,reserved:0.2});
  core.close();core=new ProductCore(path,[]);reserve(false,changed);reserve(false,changed);
  assert.equal(core.modelAdmission(changed,0.1).status,'budget_exhausted');
  const db=new DatabaseSync(path,{readOnly:true});try{assert.deepEqual(db.prepare('SELECT * FROM model_requests ORDER BY rowid LIMIT 2').all(),before);assert.equal(db.prepare('SELECT count(*) n FROM model_requests').get()!.n,4);}finally{db.close();}
 }finally{core.close();rmSync(dir,{recursive:true,force:true});}
});

test('policy revision refuses queued work; first canonical reservation accepts reordered configuration',()=>{
 const dir=mkdtempSync(join(tmpdir(),'model-policy-busy-'));const core=new ProductCore(join(dir,'db'),[{id:'ws',path:dir}]);
 try{
  const thread=core.handle({type:'threads.create',requestId:'t',workspaceId:'ws',title:'SYNTHETIC'}).id;
  core.handle({type:'runs.start',requestId:'r',threadId:thread,input:'SYNTHETIC'});
  assert.throws(()=>core.reviseModelPolicy(config,{...config,timeoutMs:90000},'busy'),/busy/);
  const binding=core.dispatchNext()!;core.markRunning(binding);core.reserveConfiguredModelRequest(binding,config,0.1);
  assert.equal(core.modelAdmission(reordered,0.1).status,'ready');
  assert.throws(()=>core.reserveConfiguredModelRequest(binding,reordered,0.1));assert.equal(core.modelAdmission(reordered,0.1).used,1);
 }finally{core.close();rmSync(dir,{recursive:true,force:true});}
});

test('Pi documented 5-minute policy ceiling is accepted; unbounded timeout remains rejected',()=>{
 assert.equal(parseModelConfiguration({...config,timeoutMs:300000}).timeoutMs,300000);
 assert.throws(()=>parseModelConfiguration({...config,timeoutMs:300001}));
 assert.throws(()=>parseModelConfiguration({...config,timeoutMs:0}));
});
