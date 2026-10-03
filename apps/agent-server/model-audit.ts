// Trusted local read-only inspection. Database/profile paths never come from Renderer/Worker.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { type ModelConfiguration } from '../../packages/app-contracts/model.ts';
import { policyDigest, legacyPolicyDigest } from './model-policy.ts';
export function auditModelProfile(profile:string,config:ModelConfiguration,cost:number) {
  const db=new DatabaseSync(join(profile,'host/product.sqlite'),{readOnly:true,allowExtension:false});
  try {
    const rows=db.prepare('SELECT policy_digest,reserved_cost FROM model_requests WHERE authorization_id=?').all(config.authorizationId);
    const revisions=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='model_policy_revisions'").get()
      ? db.prepare('SELECT digest,legacy_digest FROM model_policy_revisions WHERE authorization_id=? ORDER BY seq').all(config.authorizationId):[];
    const digest=policyDigest(config);const known=new Set([digest,legacyPolicyDigest(config),...revisions.flatMap(r=>[r.digest,r.legacy_digest])]);
    const used=rows.length,reserved=rows.reduce((n,r)=>n+Number(r.reserved_cost),0);
    const status=(revisions.length && revisions.at(-1)!.digest!==digest)||rows.some(r=>!known.has(r.policy_digest))?'policy_required':(config.maxRequests!=null && used>=config.maxRequests)||(config.maxEstimatedCostUsd!=null && reserved+cost>config.maxEstimatedCostUsd)?'budget_exhausted':'ready';
    const active=Number(db.prepare("SELECT count(*) AS n FROM runs WHERE state IN ('queued','starting','running','cancelling','unknown')").get()!.n);
    const marker=createHash('sha256').update(config.authorizationId).digest('hex').slice(0,16);
    const request=(stage:string)=>{
      const row=db.prepare('SELECT command,response FROM requests WHERE id=?').get(`live-${marker}-${stage}`);
      if(!row || typeof row.command!=='string'||typeof row.response!=='string')throw new Error('original_request_missing');
      return {command:JSON.parse(row.command),ack:JSON.parse(row.response)};
    };
    const first=request('first');const thread=request('thread');
    if(first.command.input!=='This is a synthetic, non-sensitive integration check. Remember the synthetic token cedar-47 for my next message. Reply with exactly M1-LIVE-OK and nothing else.'||first.command.type!=='runs.start'||thread.command.type!=='threads.create'||first.command.threadId!==thread.ack.id)throw new Error('original_binding_mismatch');
    const run=db.prepare('SELECT thread_id,state FROM runs WHERE id=?').get(first.ack.id);
    const reservation=db.prepare('SELECT authorization_id FROM model_requests WHERE run_id=?').get(first.ack.id);
    const native=db.prepare('SELECT native_ref,native_persisted FROM threads WHERE id=?').get(thread.ack.id);
    if(run?.state!=='completed'||run.thread_id!==thread.ack.id||reservation?.authorization_id!==config.authorizationId||native?.native_persisted!==1||typeof native.native_ref!=='string')throw new Error('original_first_not_proven');
    return {status,used,reserved,active,marker,policyDigest:digest,threadId:String(thread.ack.id),firstRunId:String(first.ack.id),nativeSessionRef:native.native_ref,
      remainingRequests:config.maxRequests==null?null:Math.max(0,config.maxRequests-used),remainingReservedUsd:config.maxEstimatedCostUsd==null?null:Math.max(0,config.maxEstimatedCostUsd-reserved)};
  }finally{db.close();}
}
