import './check-environment.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseModelConfiguration } from '../packages/app-contracts/model.ts';
import { assertTimeoutRevision,assertRequestCountRevision,policyDigest } from '../apps/agent-server/model-policy.ts';
import { ProductCore } from '../apps/agent-server/core.ts';
// The application profile is fixed, not an IPC argument. No credentials or networking.
const [action,previousFile,candidateFile,revisionId,...extra]=process.argv.slice(2);
if(!['check','apply-approved','check-requests','apply-approved-requests'].includes(action)||!previousFile||!candidateFile||!revisionId||extra.length)throw new Error('Usage: model:policy check|apply-approved|check-requests|apply-approved-requests previous.json candidate.json revision-id');
const previous=parseModelConfiguration(JSON.parse(readFileSync(previousFile,'utf8')));
const candidate=parseModelConfiguration(JSON.parse(readFileSync(candidateFile,'utf8')));
const scope=action.endsWith('-requests')?'request-count':'timeout';
if(scope==='request-count')assertRequestCountRevision(previous,candidate);else assertTimeoutRevision(previous,candidate);
const result={revisionId,scope,previousDigest:policyDigest(previous),candidateDigest:policyDigest(candidate),previousTimeoutMs:previous.timeoutMs,candidateTimeoutMs:candidate.timeoutMs,previousHttpIdleTimeoutMs:previous.httpIdleTimeoutMs??previous.timeoutMs,candidateHttpIdleTimeoutMs:candidate.httpIdleTimeoutMs??candidate.timeoutMs,requests:candidate.maxRequests,budgetUsd:candidate.maxEstimatedCostUsd,applied:false};
if(action==='apply-approved'||action==='apply-approved-requests'){
 const profile=join(homedir(),'Library/Application Support/Pi Workbench/model-profile');
 const core=new ProductCore(join(profile,'host/product.sqlite'),[]);
 try{core.reviseModelPolicy(previous,candidate,revisionId,scope);result.applied=true;}finally{core.close();}
}
console.log(JSON.stringify(result));
