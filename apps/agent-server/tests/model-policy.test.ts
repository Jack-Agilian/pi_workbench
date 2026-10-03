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
  if(legacy){const fixture=new DatabaseSync(path);try{fixture.prepare('INSERT INTO model_requests VALUES (?,?,?,?,?,1)').run(run,c.authorizationId,legacyPolicyDigest(c),0.1,'legacy:'+run);}finally{fixture.close();}}else core.reserveConfiguredModelRequest(binding,c,0.1);
  core.settle(binding,'completed',{piIdle:true,hostClean:true});return run;
 }
 try{
  reserve(true);reserve(true);core.close();
  const old=new DatabaseSync(path);old.exec(`DROP TABLE run_native_ranges; ALTER TABLE threads DROP COLUMN title_revision; ALTER TABLE threads DROP COLUMN permission_mode; ALTER TABLE threads DROP COLUMN permission_revision; ALTER TABLE runs DROP COLUMN permission_mode; ALTER TABLE runs DROP COLUMN permission_revision; ALTER TABLE approvals DROP COLUMN source; DROP TABLE desktop_workspace; DROP TABLE model_shell_operations; DROP TABLE file_operations; DROP TABLE model_policy_revisions; ALTER TABLE model_requests RENAME TO model_requests_v8; CREATE TABLE model_requests(run_id TEXT PRIMARY KEY REFERENCES runs(id),authorization_id TEXT NOT NULL,policy_digest TEXT NOT NULL,reserved_cost REAL NOT NULL) STRICT; INSERT INTO model_requests SELECT run_id,authorization_id,policy_digest,reserved_cost FROM model_requests_v8; DROP TABLE model_requests_v8; PRAGMA user_version=6;`);const before=old.prepare('SELECT run_id,authorization_id,policy_digest,reserved_cost FROM model_requests ORDER BY rowid').all();old.close();
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
  const db=new DatabaseSync(path,{readOnly:true});try{assert.deepEqual(db.prepare('SELECT run_id,authorization_id,policy_digest,reserved_cost FROM model_requests ORDER BY rowid LIMIT 2').all(),before);assert.equal(db.prepare('SELECT count(*) n FROM model_requests').get()!.n,4);}finally{db.close();}
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

test('explicit total deadline is independent of Pi idle default; unbounded timeout remains rejected',()=>{
 assert.equal(parseModelConfiguration({...config,timeoutMs:300000}).timeoutMs,300000);
 assert.throws(()=>parseModelConfiguration({...config,timeoutMs:86400001}));
 assert.throws(()=>parseModelConfiguration({...config,timeoutMs:0}));
});

test('idle and total limits are independent policy fields; revisions preserve all non-timeout authority',()=>{
 const long=parseModelConfiguration({...config,timeoutMs:1800000,httpIdleTimeoutMs:300000});
 assert.equal(long.timeoutMs,1800000);assert.equal(long.httpIdleTimeoutMs,300000);
 assert.notEqual(policyDigest(long),policyDigest({...long,httpIdleTimeoutMs:600000}));
 assert.equal(policyDigest(long),policyDigest(parseModelConfiguration(Object.fromEntries(Object.entries(long).reverse()))));
 assert.throws(()=>parseModelConfiguration({...long,httpIdleTimeoutMs:0}));
 assert.throws(()=>parseModelConfiguration({...long,httpIdleTimeoutMs:86400001}));
});

test('explicit idle/total revision reuses existing authorization and retains prior reservations',()=>{
 const dir=mkdtempSync(join(tmpdir(),'model-idle-revision-'));const core=new ProductCore(join(dir,'db'),[{id:'ws',path:dir}]);
 try{
  const thread=core.handle({type:'threads.create',requestId:'t',workspaceId:'ws',title:'SYNTHETIC'}).id;
  core.handle({type:'runs.start',requestId:'r',threadId:thread,input:'SYNTHETIC'});const b=core.dispatchNext()!;core.markRunning(b);core.reserveConfiguredModelRequest(b,config,0.1);core.settle(b,'completed',{piIdle:true,hostClean:true});
  const candidate={...config,timeoutMs:1800000,httpIdleTimeoutMs:300000};
  assert.equal(core.modelAdmission(candidate,0.1).status,'policy_required');core.reviseModelPolicy(config,candidate,'idle-total-approved');
  assert.deepEqual(core.modelAdmission(candidate,0.1),{status:'ready',used:1,reserved:0.1});
  assert.throws(()=>core.reviseModelPolicy(candidate,{...candidate,maxRequests:5},'expand'),/scope/);
  assert.equal(core.modelAdmission(config,0.1).status,'policy_required');
 }finally{core.close();rmSync(dir,{recursive:true,force:true});}
});

import { fileRunDuration, parseFileToolPolicy } from '../../../packages/app-contracts/file-tools.ts';
test('unlimited request-count revision preserves history, identity and cost gate across reopen',()=>{
 const dir=mkdtempSync(join(tmpdir(),'model-unlimited-')),path=join(dir,'db');let core=new ProductCore(path,[{id:'ws',path:dir}]);
 const previous={...config,fileTools:{maxOperations:8,maxModelRequests:4,operationTimeoutMs:1000}};
 const candidate=parseModelConfiguration({...previous,maxRequests:undefined,fileTools:{...previous.fileTools,maxModelRequests:undefined}});
 try{
  const threadId=core.handle({type:'threads.create',requestId:'t',workspaceId:'ws',title:'SYNTHETIC'}).id;
  core.handle({type:'runs.start',requestId:'r',threadId,input:'SYNTHETIC budget'});
  const b=core.dispatchNext()!;core.markRunning(b);
  for(let sequence=1;sequence<=4;sequence++)core.reserveConfiguredModelRequest(b,previous,1/32,{id:'old-'+sequence,sequence});
  // Host-only ledger fixture. Does not claim SDK/process cleanup.
  core.settle(b,'completed',{piIdle:true,hostClean:true});
  const rows=()=>{const db=new DatabaseSync(path,{readOnly:true});try{return db.prepare('SELECT * FROM model_requests ORDER BY rowid LIMIT 4').all();}finally{db.close();}};
  const before=rows();assert.equal(core.modelAdmission(previous,1/32).status,'budget_exhausted');
  assert.equal(core.modelAdmission(candidate,1/32).status,'policy_required');
  assert.throws(()=>core.reviseModelPolicy(previous,candidate,'timeout-cannot-expand'),/scope/);
  for(const bad of [{...candidate,maxEstimatedCostUsd:2},{...candidate,timeoutMs:1800000},{...candidate,authorizationId:'new'},{...candidate,fileTools:{...candidate.fileTools!,maxOperations:16}}])
   assert.throws(()=>core.reviseModelPolicy(previous,bad,'bad','request-count'),/scope/);
  core.reviseModelPolicy(previous,candidate,'unlimited-approved','request-count');
  core.reviseModelPolicy(previous,candidate,'unlimited-approved','request-count');
  assert.deepEqual(core.modelAdmission(candidate,1/32),{status:'ready',used:4,reserved:4/32});
  core.close();core=new ProductCore(path,[]);
  core.handle({type:'runs.start',requestId:'r2',threadId,input:'SYNTHETIC continuation'});const next=core.dispatchNext()!;core.markRunning(next);
  for(let sequence=1;sequence<=28;sequence++)core.reserveConfiguredModelRequest(next,candidate,1/32,{id:'new-'+sequence,sequence});
  assert.equal(core.reserveConfiguredModelRequest(next,candidate,1/32,{id:'new-28',sequence:28}),false);
  assert.throws(()=>core.reserveConfiguredModelRequest(next,candidate,1/32,{id:'new-29',sequence:29}),/budget/);
  assert.deepEqual(core.modelAdmission(candidate,1/32),{status:'budget_exhausted',used:32,reserved:1});
  assert.deepEqual(rows(),before);assert.equal(core.modelAdmission(previous,0).status,'policy_required');
 }finally{core.close();rmSync(dir,{recursive:true,force:true});}
});
test('count null is explicit; malformed caps fail; cost-derived Run envelope does not cap LLM count',()=>{
 const files={maxOperations:8,operationTimeoutMs:1000};
 assert.equal(parseModelConfiguration({...config,maxRequests:undefined,fileTools:files}).maxRequests,undefined);
 assert.equal(parseFileToolPolicy(files).maxModelRequests,undefined);
 assert.equal(parseModelConfiguration({...config,maxRequests:null,fileTools:files}).maxRequests,null);
 for(const bad of [0,-1,'unlimited',false,Infinity,21]){
  assert.throws(()=>parseModelConfiguration({...config,maxRequests:bad}));
  assert.throws(()=>parseFileToolPolicy({...files,maxModelRequests:bad}));
 }
 assert.equal(fileRunDuration(files,1800000),null);
 assert.throws(()=>fileRunDuration(files,1800000,{total:1,perRequest:0}),/budget/);
 assert.equal(fileRunDuration(files,1800000,{total:1,perRequest:0.01}),5000+100*1801000+8*2000);
});

test('explicit tool scope reuses consumed authorization; cannot expand cost, counts, identity or timeout',()=>{
 const dir=mkdtempSync(join(tmpdir(),'model-tool-policy-')),path=join(dir,'db');let core=new ProductCore(path,[{id:'ws',path:dir}]);
 const previous={...config,maxRequests:undefined};
 const candidate=parseModelConfiguration({...previous,fileTools:{maxOperations:8,operationTimeoutMs:300000},shellTools:{maxCommands:6,timeoutMs:10000,profile:'restricted-bash-v1'}});
 try{
  const threadId=core.handle({type:'threads.create',requestId:'t',workspaceId:'ws',title:'SYNTHETIC'}).id;
  core.handle({type:'runs.start',requestId:'r',threadId,input:'SYNTHETIC'});const b=core.dispatchNext()!;core.markRunning(b);
  core.reserveConfiguredModelRequest(b,previous,0.125);core.settle(b,'completed',{piIdle:true,hostClean:true});
  for(const scope of ['timeout','request-count'] as const)assert.throws(()=>core.reviseModelPolicy(previous,candidate,'wrong-'+scope,scope),/scope/);
  for(const bad of [{...candidate,maxEstimatedCostUsd:2},{...candidate,timeoutMs:1800000},{...candidate,authorizationId:'new'},{...candidate,maxRequests:4},{...candidate,fileTools:{...candidate.fileTools!,maxModelRequests:4}}])assert.throws(()=>core.reviseModelPolicy(previous,bad,'wrong-tools','tools'),/scope/);
  assert.equal(core.modelAdmission(candidate,0.125).status,'policy_required');
  core.reviseModelPolicy(previous,candidate,'tools-approved','tools');core.reviseModelPolicy(previous,candidate,'tools-approved','tools');
  core.close();core=new ProductCore(path,[]);assert.deepEqual(core.modelAdmission(candidate,0.125),{status:'ready',used:1,reserved:0.125});
  core.reviseModelPolicy(candidate,previous,'tools-revoked','tools');assert.deepEqual(core.modelAdmission(previous,0.125),{status:'ready',used:1,reserved:0.125});
 }finally{core.close();rmSync(dir,{recursive:true,force:true});}
});

test('optional cost cap: explicit revision, immutable ledger, re-open and independent count/tool/time fences',()=>{
 const dir=mkdtempSync(join(tmpdir(),'model-cost-')),path=join(dir,'db');let core=new ProductCore(path,[{id:'ws',path:dir}]);
 const previous={...config,maxRequests:undefined,fileTools:{maxOperations:8,operationTimeoutMs:1000}};
 const candidate={...previous,maxEstimatedCostUsd:undefined};
 try{
  const threadId=core.handle({type:'threads.create',requestId:'t',workspaceId:'ws',title:'SYNTHETIC'}).id;
  core.handle({type:'runs.start',requestId:'r',threadId,input:'SYNTHETIC'});const b=core.dispatchNext()!;core.markRunning(b);
  core.reserveConfiguredModelRequest(b,previous,1);core.settle(b,'completed',{piIdle:true,hostClean:true}); // Module-only synthetic settlement.
  const rows=()=>{const db=new DatabaseSync(path,{readOnly:true});try{return db.prepare('SELECT * FROM model_requests ORDER BY rowid').all();}finally{db.close();}};
  const before=rows();assert.equal(core.modelAdmission(previous,0.1).status,'budget_exhausted');
  for(const scope of ['timeout','request-count','tools'] as const)assert.throws(()=>core.reviseModelPolicy(previous,candidate,'wrong-'+scope,scope),/scope/);
  for(const bad of [{...candidate,timeoutMs:1800000},{...candidate,authorizationId:'new'},{...candidate,fileTools:{...candidate.fileTools,maxOperations:16}},{...candidate,maxRequests:20},{...candidate,maxEstimatedCostUsd:10}])assert.throws(()=>core.reviseModelPolicy(previous,bad,'wrong','cost'),/scope/);
  assert.equal(core.modelAdmission(candidate,0).status,'policy_required');core.reviseModelPolicy(previous,candidate,'cost-approved','cost');core.reviseModelPolicy(previous,candidate,'cost-approved','cost');
  core.close();core=new ProductCore(path,[]);assert.deepEqual(core.modelAdmission(candidate,100),{status:'ready',used:1,reserved:1});assert.deepEqual(rows(),before);
  core.handle({type:'runs.start',requestId:'r2',threadId,input:'SYNTHETIC continuation'});const n=core.dispatchNext()!;core.markRunning(n);core.reserveConfiguredModelRequest(n,candidate,100);
  assert.deepEqual(core.modelAdmission(candidate,100),{status:'ready',used:2,reserved:101});
  assert.equal(policyDigest(candidate),policyDigest({...candidate,maxEstimatedCostUsd:null}));
  for(const bad of [0,-1,false,'unlimited',Infinity,NaN])assert.throws(()=>parseModelConfiguration({...candidate,maxEstimatedCostUsd:bad}));
 }finally{core.close();rmSync(dir,{recursive:true,force:true});}
});

test('product-default revision removes validation caps together, retaining API timeouts and security scope',()=>{
 const previous={...config,fileTools:{maxOperations:8,maxModelRequests:4,operationTimeoutMs:300000},shellTools:{maxCommands:6,timeoutMs:30000,profile:'restricted-bash-v1' as const}};
 const candidate=parseModelConfiguration({...previous,maxRequests:undefined,maxEstimatedCostUsd:undefined,maxOutputTokens:undefined,fileTools:{operationTimeoutMs:300000},shellTools:{profile:'restricted-bash-v1'}});
 const dir=mkdtempSync(join(tmpdir(),'usage-defaults-'));const core=new ProductCore(join(dir,'db'),[]);
 try{
  for(const bad of [{...candidate,endpoint:'https://other.invalid'},{...candidate,timeoutMs:1800000},{...candidate,fileTools:{operationTimeoutMs:600000}},{...candidate,maxOutputTokens:8192}])assert.throws(()=>core.reviseModelPolicy(previous,bad,'bad','usage-defaults'),/scope/);
  core.reviseModelPolicy(previous,candidate,'defaults','usage-defaults');core.reviseModelPolicy(previous,candidate,'defaults','usage-defaults');
  assert.equal(core.modelAdmission(candidate,100).status,'ready');assert.equal(candidate.timeoutMs,previous.timeoutMs);
 }finally{core.close();rmSync(dir,{recursive:true,force:true});}
});
