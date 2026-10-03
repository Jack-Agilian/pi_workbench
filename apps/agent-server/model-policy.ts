// Host-owned, versioned policy identity. Tool argument digests deliberately remain unchanged.
import { createHash } from 'node:crypto';
import { parseModelConfiguration, type ModelConfiguration } from '../../packages/app-contracts/model.ts';
export function policyText(raw: ModelConfiguration): string {
  const c = parseModelConfiguration(raw);
  return JSON.stringify({ schema: 'model-policy-v1', version:c.version, authorizationId:c.authorizationId,
    approved:c.approved, dataScope:c.dataScope, provider:c.provider, model:c.model, endpoint:c.endpoint,
    maxRequests:c.maxRequests??null, maxOutputTokens:c.maxOutputTokens??null, timeoutMs:c.timeoutMs, maxEstimatedCostUsd:c.maxEstimatedCostUsd??null,
    ...(c.shellTools ? {shellTools:{maxCommands:c.shellTools.maxCommands??null,timeoutMs:c.shellTools.timeoutMs??null,profile:c.shellTools.profile}} : {}),
    ...(c.fileTools ? {fileTools:{maxOperations:c.fileTools.maxOperations??null,maxModelRequests:c.fileTools.maxModelRequests??null,operationTimeoutMs:c.fileTools.operationTimeoutMs}} : {}),
    ...(c.httpIdleTimeoutMs === undefined ? {} : {httpIdleTimeoutMs:c.httpIdleTimeoutMs}),
    ...(c.openai ? {openai:{...(c.openai.maxTokens===undefined?{}:{maxTokens:c.openai.maxTokens}),api:c.openai.api,contextWindow:c.openai.contextWindow,inputUsdPerMillion:c.openai.inputUsdPerMillion,
      outputUsdPerMillion:c.openai.outputUsdPerMillion,...(c.openai.tokenLimitField ? {tokenLimitField:c.openai.tokenLimitField}: {})}} : {}) });
}
export const policyDigest = (c:ModelConfiguration):string => createHash('sha256').update(policyText(c)).digest('hex');
export const legacyPolicyDigest = (c:ModelConfiguration):string => createHash('sha256').update(JSON.stringify(parseModelConfiguration(c))).digest('hex');
export function assertTimeoutRevision(previous:ModelConfiguration, candidate:ModelConfiguration):void {
  const base={...previous};delete base.httpIdleTimeoutMs;
  if (!candidate.approved || policyText({...base,timeoutMs:candidate.timeoutMs,...(candidate.httpIdleTimeoutMs === undefined ? {} : {httpIdleTimeoutMs:candidate.httpIdleTimeoutMs})}) !== policyText(candidate)) throw new Error('model_revision_scope');
}

/** Explicitly authorized removal of count caps only. Costs, tools and identity stay bound. */
export function assertRequestCountRevision(previous:ModelConfiguration,candidate:ModelConfiguration):void {
  const expected={...previous,maxRequests:undefined,...(previous.fileTools?{fileTools:{...previous.fileTools,maxModelRequests:undefined}}:{})};
  if(!candidate.approved || policyText(expected)!==policyText(candidate))throw new Error('model_revision_scope');
}

/** Trusted, explicitly approved tool-scope change; never resets cost or request history. */
export function assertToolScopeRevision(previous:ModelConfiguration,candidate:ModelConfiguration):void {
  const expected={...previous};delete expected.fileTools;delete expected.shellTools;
  if(candidate.fileTools)expected.fileTools=candidate.fileTools;
  if(candidate.shellTools)expected.shellTools=candidate.shellTools;
  if(!candidate.approved || (previous.fileTools?.maxModelRequests??null)!==(candidate.fileTools?.maxModelRequests??null) || policyText(expected)!==policyText(candidate))throw new Error('model_revision_scope');
}

/** Explicit removal of the optional cost cap. No other authority changes. */
export function assertCostRevision(previous:ModelConfiguration,candidate:ModelConfiguration):void {
  if(!candidate.approved || policyText({...previous,maxEstimatedCostUsd:undefined})!==policyText(candidate))throw new Error('model_revision_scope');
}

/** User-approved removal of validation-only usage caps; service, data and API timeouts stay fixed. */
export function assertUsageDefaultsRevision(previous:ModelConfiguration,candidate:ModelConfiguration):void {
  const expected={...previous,maxRequests:undefined,maxEstimatedCostUsd:undefined,maxOutputTokens:undefined,
    ...(previous.fileTools?{fileTools:{...previous.fileTools,maxModelRequests:undefined,maxOperations:undefined}}:{}),
    ...(previous.shellTools?{shellTools:{...previous.shellTools,maxCommands:undefined,timeoutMs:undefined}}:{})};
  if(!candidate.approved || policyText(expected)!==policyText(candidate))throw new Error('model_revision_scope');
}
