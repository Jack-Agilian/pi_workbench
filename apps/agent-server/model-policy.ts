// Host-owned, versioned policy identity. Tool argument digests deliberately remain unchanged.
import { createHash } from 'node:crypto';
import { parseModelConfiguration, type ModelConfiguration } from '../../packages/app-contracts/model.ts';
export function policyText(raw: ModelConfiguration): string {
  const c = parseModelConfiguration(raw);
  return JSON.stringify({ schema: 'model-policy-v1', version:c.version, authorizationId:c.authorizationId,
    approved:c.approved, dataScope:c.dataScope, provider:c.provider, model:c.model, endpoint:c.endpoint,
    maxRequests:c.maxRequests, maxOutputTokens:c.maxOutputTokens, timeoutMs:c.timeoutMs, maxEstimatedCostUsd:c.maxEstimatedCostUsd,
    ...(c.shellTools ? {shellTools:{maxCommands:c.shellTools.maxCommands,timeoutMs:c.shellTools.timeoutMs,profile:c.shellTools.profile}} : {}),
    ...(c.fileTools ? {fileTools:{maxOperations:c.fileTools.maxOperations,maxModelRequests:c.fileTools.maxModelRequests,operationTimeoutMs:c.fileTools.operationTimeoutMs}} : {}),
    ...(c.httpIdleTimeoutMs === undefined ? {} : {httpIdleTimeoutMs:c.httpIdleTimeoutMs}),
    ...(c.openai ? {openai:{api:c.openai.api,contextWindow:c.openai.contextWindow,inputUsdPerMillion:c.openai.inputUsdPerMillion,
      outputUsdPerMillion:c.openai.outputUsdPerMillion,...(c.openai.tokenLimitField ? {tokenLimitField:c.openai.tokenLimitField}: {})}} : {}) });
}
export const policyDigest = (c:ModelConfiguration):string => createHash('sha256').update(policyText(c)).digest('hex');
export const legacyPolicyDigest = (c:ModelConfiguration):string => createHash('sha256').update(JSON.stringify(parseModelConfiguration(c))).digest('hex');
export function assertTimeoutRevision(previous:ModelConfiguration, candidate:ModelConfiguration):void {
  const base={...previous};delete base.httpIdleTimeoutMs;
  if (!candidate.approved || policyText({...base,timeoutMs:candidate.timeoutMs,...(candidate.httpIdleTimeoutMs === undefined ? {} : {httpIdleTimeoutMs:candidate.httpIdleTimeoutMs})}) !== policyText(candidate)) throw new Error('model_revision_scope');
}
