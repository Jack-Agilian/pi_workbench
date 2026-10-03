import { parseFullFileAccess, type FullFileAccess } from './file-access.ts';
import { parseBashParameters, type BashParameters } from './model-shell.ts';
import { parseFileToolRequest, type FileToolRequest } from './file-tools.ts';
import { parseModelSelection, parseModelOutcome, type ModelSelection, type ModelOutcome } from './model.ts';
// Workbench protocol, not Pi SDK API. No product database or SDK types on this channel.
import { parseShellOutcome, type ShellOutcome } from './shell.ts';
import { identifier, toolCallIdentity, sha256, type Dispatch } from './index.ts';
import { parsePresentation, type Presentation } from './presentation.ts';
export const IPC_VERSION = 12;
export const MAX_MESSAGE_BYTES = 65_536;
export interface ResourceSelection { root: string; id: string; files: readonly { path: string; sha256: string }[]; expectedSkillNames: readonly string[] }
export interface WorkerInit { fileAccess?: FullFileAccess; binding: Dispatch; workspace: string; agentDir: string; sessions: string; resources: ResourceSelection; deadline: number | null; model?: ModelSelection }
export type WireBody =
  | { type:'native-range'; phase:'start'|'end'; entryId:string|null }
  | { type: 'model-key'; key: string }
  | { type: 'model-outcome'; outcome: ModelOutcome }
  | { type: 'model-http'; url: string; method: 'POST'; headers: Record<string,string>; body: string }
  | { type: 'model-http-head'; status: number; headers: Record<string,string> }
  | { type: 'model-http-read' }
  | { type:'model-http-finish' } | { type:'model-http-finished' }
  | { type:'shell-operation'; toolCallId:string; parameters:BashParameters; resourceLock:string }
  | { type:'file-operation'; toolCallId:string; request:FileToolRequest; resourceLock:string }
  | { type:'file-result'; operationId:string; ok:boolean } | { type:'file-settled'; operationId:string }
  | { type: 'model-http-chunk'; data: string; end: boolean }
  | { type: 'model-http-error' }
  | { type: 'hello'; pid: number }
  | { type: 'init'; config: WorkerInit }
  | { type: 'session-reference'; nativeRef: string }
  | { type: 'session-reference-accepted' }
  | { type: 'ready'; resourceLock: string; nativeRef: string | null }
  | { type: 'start' } | { type: 'cancel' } | { type: 'close' }
  | { type: 'operation'; toolCallId: string; tool: 'write' | 'edit' | 'bash'; parametersDigest: string; target: string; resourceLock: string }
  | { type: 'grant'; operationId: string; parametersDigest: string; expiresAt: number; fileVersion: string | null }
  | { type: 'deny' }
  | { type: 'shell-exec'; operationId: string; parametersDigest: string }
  | { type: 'shell-result'; outcome: ShellOutcome }
  | { type: 'result'; operationId: string; ok: boolean }
  | { type: 'observation'; kind: 'activity' | 'idle' | 'diagnostic'; eventType: string; sourceType: string | null }
  | { type: 'presentation'; projection: Presentation }
  | { type: 'done'; ok: boolean }
  | { type: 'closed'; nativeRef: string | null }
  | { type: 'fault'; code: 'initialization_failed' | 'execution_failed' | 'protocol_failed' };
export interface Envelope { version: 12; instanceId: string; runtimeBindingId: string; requestId: string; body: WireBody }
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('invalid_record');
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => typeof key !== 'string') || Object.values(fields).some(f => !('value' in f))) throw new Error('invalid_record');
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
}
export function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const obj = record(value);
  if (Object.keys(obj).length !== keys.length || keys.some(key => !Object.hasOwn(obj, key))) throw new Error('unknown_field');
  return obj;
}
function string(value: unknown, max = 4096): string {
  if (typeof value !== 'string' || !value || value.length > max || value.includes('\0')) throw new Error('invalid_string'); return value;
}
function number(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error('invalid_number'); return value; }
function boolean(value: unknown) { if (typeof value !== 'boolean') throw new Error('invalid_boolean'); }
function nullablePath(value: unknown) { if (value !== null) string(value); }
export function parseEnvelope(value: unknown): Envelope {
  const obj = exact(value, ['version', 'instanceId', 'runtimeBindingId', 'requestId', 'body']);
  if (obj.version !== IPC_VERSION) throw new Error('protocol_version');
  identifier(obj.instanceId); identifier(obj.runtimeBindingId); identifier(obj.requestId);
  const b = record(obj.body);
  const check = (...keys: string[]) => exact(b, ['type', ...keys]);
  switch (b.type) {
    case 'native-range': check('phase','entryId'); if(b.phase!=='start'&&b.phase!=='end')throw new Error('invalid_native_phase'); if(b.entryId!==null)identifier(b.entryId); break;
    case 'model-key': check('key'); string(b.key, 8192); break;
    case 'model-outcome': check('outcome'); b.outcome = parseModelOutcome(b.outcome); obj.body = b; break;
    case 'model-http': check('url','method','headers','body'); string(b.url, 2048); if (b.method !== 'POST') throw new Error('model_http_method'); string(b.body, 24000); parseHeaders(b.headers); break;
    case 'model-http-head': check('status','headers'); number(b.status); if (Number(b.status)<100 || Number(b.status)>599) throw new Error('http_status'); parseHeaders(b.headers); break;
    case 'model-http-chunk': check('data','end'); if (typeof b.data !== 'string' || b.data.length > 24000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.data)) throw new Error('http_chunk'); boolean(b.end); break;
    case 'model-http-read': case 'model-http-error': case 'model-http-finish': case 'model-http-finished': check(); break;
    case 'shell-operation': check('toolCallId','parameters','resourceLock'); toolCallIdentity(b.toolCallId); parseBashParameters(b.parameters); sha256(b.resourceLock); break;
    case 'file-operation': check('toolCallId','request','resourceLock'); toolCallIdentity(b.toolCallId); parseFileToolRequest(b.request,'full'); sha256(b.resourceLock); break;
    case 'file-result': check('operationId','ok'); identifier(b.operationId); boolean(b.ok); break;
    case 'file-settled': check('operationId'); identifier(b.operationId); break;
    case 'hello': check('pid'); number(b.pid); break;
    case 'init': {
      check('config'); const c = exact(b.config, ['binding','workspace','agentDir','sessions','resources','deadline', ...(Object.hasOwn(Object(b.config), 'fileAccess') ? ['fileAccess'] : []), ...(Object.hasOwn(Object(b.config), 'model') ? ['model'] : [])]);
      if (c.model !== undefined) parseModelSelection(c.model);
      if (c.fileAccess !== undefined) parseFullFileAccess(c.fileAccess);
      for (const key of ['workspace','agentDir','sessions']) string(c[key]);
      if(c.deadline===null){if(!c.model || !parseModelSelection(c.model).fileTools || parseModelSelection(c.model).fileTools!.maxModelRequests!=null)throw new Error('invalid_deadline');}else number(c.deadline);
      const d = exact(c.binding, ['runId','threadId','runtimeBindingId','workerEpoch','sessionGeneration','workspaceId','nativeSessionRef','nativeSessionPersisted','input']);
      for (const key of ['runId','threadId','runtimeBindingId','workerEpoch','sessionGeneration','workspaceId']) identifier(d[key]); string(d.input, 16_384); nullablePath(d.nativeSessionRef); boolean(d.nativeSessionPersisted);
      const r = exact(c.resources, ['root','id','files','expectedSkillNames']); string(r.root); sha256(r.id);
      if (!Array.isArray(r.files) || r.files.length > 256 || !Array.isArray(r.expectedSkillNames) || r.expectedSkillNames.length > 64) throw new Error('resource_limit');
      for (const file of r.files) { const f = exact(file, ['path','sha256']); string(f.path); sha256(f.sha256); }
      for (const name of r.expectedSkillNames) string(name, 128); break;
    }
    case 'ready': check('resourceLock','nativeRef'); sha256(b.resourceLock); nullablePath(b.nativeRef); break;
    case 'session-reference': check('nativeRef'); string(b.nativeRef); break;
    case 'start': case 'cancel': case 'close': case 'deny': case 'session-reference-accepted': check(); break;
    case 'operation': check('toolCallId','tool','parametersDigest','target','resourceLock'); toolCallIdentity(b.toolCallId); if (typeof b.tool !== 'string' || !['write','edit','bash'].includes(b.tool)) throw new Error('tool_not_admitted'); sha256(b.parametersDigest); string(b.target); sha256(b.resourceLock); break;
    case 'grant': check('operationId','parametersDigest','expiresAt','fileVersion'); identifier(b.operationId); sha256(b.parametersDigest); number(b.expiresAt); if (b.fileVersion !== null) sha256(b.fileVersion); break;
    case 'shell-exec': check('operationId','parametersDigest'); identifier(b.operationId); sha256(b.parametersDigest); break;
    case 'shell-result': check('outcome'); b.outcome = parseShellOutcome(b.outcome); obj.body = b; break;
    case 'result': check('operationId','ok'); identifier(b.operationId); boolean(b.ok); break;
    case 'done': check('ok'); boolean(b.ok); break;
    case 'presentation': check('projection'); b.projection = parsePresentation(b.projection); obj.body = b; break;
    case 'closed': check('nativeRef'); nullablePath(b.nativeRef); break;
    case 'observation': check('kind','eventType','sourceType'); if (typeof b.kind !== 'string' || !['activity','idle','diagnostic'].includes(b.kind)) throw new Error('invalid_kind'); identifier(b.eventType); if (b.sourceType !== null) identifier(b.sourceType); break;
    case 'fault': check('code'); if (typeof b.code !== 'string' || !['initialization_failed','execution_failed','protocol_failed'].includes(b.code)) throw new Error('invalid_fault'); break;
    default: throw new Error('unknown_message');
  }
  if (new TextEncoder().encode(JSON.stringify(obj)).byteLength > MAX_MESSAGE_BYTES) throw new Error('message_too_large');
  // Entire closed union validated above. Parsing never grants authority from these identities.
  return obj as unknown as Envelope;
}

function parseHeaders(value: unknown): void { const h = record(value); if (Object.keys(h).length > 32 || JSON.stringify(h).length > 12000) throw new Error('http_headers'); for (const [key,val] of Object.entries(h)) if (!/^[!#$%&'*+.^_`|~a-z0-9-]+$/i.test(key) || typeof val !== 'string' || /[\r\n\0]/.test(val)) throw new Error('http_header'); }
