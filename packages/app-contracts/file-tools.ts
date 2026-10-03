// Bounded product policy/intent, not Pi SDK objects. Markdown-only for this increment.
import { exact, record } from './worker-ipc.ts';
// maxModelRequests is optional legacy/validation compatibility; omission means no count cap.
export interface FileToolPolicy { maxOperations?: number | null; maxModelRequests?: number | null; operationTimeoutMs: number }
export type FileToolRequest =
 | { tool:'read'; parameters:{path:string;offset?:number;limit?:number} }
 | { tool:'write'; parameters:{path:string;content:string} }
 | { tool:'edit'; parameters:{path:string;edits:{oldText:string;newText:string}[]} };
export interface FileOperationPlan { request:FileToolRequest; fileVersion:string|null; expectedDigest:string|null; resourceLock:string; deadline:number; approvalDigest:string }
export interface FileOperationView { fileVersion:string|null; resourceLock:string; summary:string; preview:string }
export function parseFileToolPolicy(value:unknown):FileToolPolicy {
 const r=exact(value,[...(Object.hasOwn(Object(value),'maxOperations')?['maxOperations']:[]),...(Object.hasOwn(Object(value),'maxModelRequests')?['maxModelRequests']:[]),'operationTimeoutMs']);
 if(r.maxModelRequests != null && (typeof r.maxModelRequests !== 'number'||!Number.isSafeInteger(r.maxModelRequests)||r.maxModelRequests<1||r.maxModelRequests>20))throw new Error('file_tool_policy');
 for(const [key,min,max] of [['maxOperations',1,16],['operationTimeoutMs',100,3600000]] as const)
  if(!(key==='maxOperations' && r[key]==null) && (typeof r[key]!=='number'||!Number.isSafeInteger(r[key])||r[key]<min||r[key]>max))throw new Error('file_tool_policy');
 return r as unknown as FileToolPolicy;
}
export function parseFileToolRequest(value:unknown):FileToolRequest {
 const r=exact(value,['tool','parameters']),p=record(r.parameters);
 if(typeof p.path!=='string'||!p.path||p.path.length>1024||p.path.startsWith('/')||/^[@~]/.test(p.path)||/[\u0000-\u001f\u00a0\u202f]/.test(p.path)||!p.path.endsWith('.md'))throw new Error('file_tool_path');
 const text=(s:unknown)=>{if(typeof s!=='string'||s.includes('\0')||byteLength(s)>16000)throw new Error('file_tool_text');};
 if(r.tool==='read'){
  exact(p,['path',...(Object.hasOwn(p,'offset')?['offset']:[]),...(Object.hasOwn(p,'limit')?['limit']:[])]);
  for(const key of ['offset','limit'])if(p[key]!==undefined&&(typeof p[key]!=='number'||!Number.isSafeInteger(p[key])||p[key]<1||p[key]>10000))throw new Error('file_read_limit');
 }else if(r.tool==='write'){exact(p,['path','content']);text(p.content);}
 else if(r.tool==='edit'){
  exact(p,['path','edits']);if(!Array.isArray(p.edits)||!p.edits.length||p.edits.length>16)throw new Error('file_edit_limit');
  for(const e of p.edits){const x=exact(e,['oldText','newText']);text(x.oldText);text(x.newText);}
 }else throw new Error('file_tool_not_admitted');
 if(byteLength(JSON.stringify(r))>18000)throw new Error('file_tool_size');
 return r as unknown as FileToolRequest;
}
const byteLength=(s:string)=>new TextEncoder().encode(s).byteLength;
/** A Run budget envelope, not a per-request timer. Each phase is enforced independently. */
export function fileRunDuration(policy:FileToolPolicy,requestTimeoutMs:number,costBudget?:{total?:number|null;perRequest:number}):number|null {
 // No count or cost cap means no whole-Run deadline. Host phase timers remain mandatory.
 if(policy.maxOperations==null || policy.maxModelRequests==null && costBudget?.total==null)return null;
 const requests=policy.maxModelRequests ?? (costBudget?.total!=null && costBudget.perRequest>0 ? Math.ceil(costBudget.total/costBudget.perRequest) : NaN);
 const duration=5000+requests*(requestTimeoutMs+1000)+policy.maxOperations*(policy.operationTimeoutMs+1000);
 if(!Number.isSafeInteger(duration)||duration<5000||duration>Number.MAX_SAFE_INTEGER-Date.now())throw new Error('model_run_budget');
 return duration;
}
