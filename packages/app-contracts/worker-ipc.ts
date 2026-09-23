// Workbench protocol, not Pi SDK API. No product database or SDK types on this channel.
import { identifier, sha256, type Dispatch } from './index.ts';
export const IPC_VERSION = 1;
export const MAX_MESSAGE_BYTES = 65_536;
export interface ResourceSelection { root: string; id: string; files: readonly { path: string; sha256: string }[]; expectedSkillNames: readonly string[] }
export interface WorkerInit { binding: Dispatch; workspace: string; agentDir: string; sessions: string; resources: ResourceSelection; deadline: number }
export type WireBody =
  | { type: 'hello'; pid: number }
  | { type: 'init'; config: WorkerInit }
  | { type: 'ready'; resourceLock: string; nativeRef: string | null }
  | { type: 'start' } | { type: 'cancel' } | { type: 'close' }
  | { type: 'operation'; toolCallId: string; tool: 'write' | 'edit'; parametersDigest: string; target: string; resourceLock: string }
  | { type: 'grant'; operationId: string; parametersDigest: string; expiresAt: number; fileVersion: string | null }
  | { type: 'deny' }
  | { type: 'result'; operationId: string; ok: boolean }
  | { type: 'observation'; kind: 'activity' | 'idle' | 'diagnostic'; eventType: string; sourceType: string | null }
  | { type: 'done'; ok: boolean }
  | { type: 'closed'; nativeRef: string | null }
  | { type: 'fault'; code: 'initialization_failed' | 'execution_failed' | 'protocol_failed' };
export interface Envelope { version: 1; instanceId: string; runtimeBindingId: string; requestId: string; body: WireBody }
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
    case 'hello': check('pid'); number(b.pid); break;
    case 'init': {
      check('config'); const c = exact(b.config, ['binding','workspace','agentDir','sessions','resources','deadline']);
      for (const key of ['workspace','agentDir','sessions']) string(c[key]); number(c.deadline);
      const d = exact(c.binding, ['runId','threadId','runtimeBindingId','workerEpoch','sessionGeneration','workspaceId','nativeSessionRef','input']);
      for (const key of ['runId','threadId','runtimeBindingId','workerEpoch','sessionGeneration','workspaceId']) identifier(d[key]); string(d.input, 16_384); nullablePath(d.nativeSessionRef);
      const r = exact(c.resources, ['root','id','files','expectedSkillNames']); string(r.root); sha256(r.id);
      if (!Array.isArray(r.files) || r.files.length > 256 || !Array.isArray(r.expectedSkillNames) || r.expectedSkillNames.length > 64) throw new Error('resource_limit');
      for (const file of r.files) { const f = exact(file, ['path','sha256']); string(f.path); sha256(f.sha256); }
      for (const name of r.expectedSkillNames) string(name, 128); break;
    }
    case 'ready': check('resourceLock','nativeRef'); sha256(b.resourceLock); nullablePath(b.nativeRef); break;
    case 'start': case 'cancel': case 'close': case 'deny': check(); break;
    case 'operation': check('toolCallId','tool','parametersDigest','target','resourceLock'); identifier(b.toolCallId); if (!['write','edit'].includes(String(b.tool))) throw new Error('tool_not_admitted'); sha256(b.parametersDigest); string(b.target); sha256(b.resourceLock); break;
    case 'grant': check('operationId','parametersDigest','expiresAt','fileVersion'); identifier(b.operationId); sha256(b.parametersDigest); number(b.expiresAt); if (b.fileVersion !== null) sha256(b.fileVersion); break;
    case 'result': check('operationId','ok'); identifier(b.operationId); boolean(b.ok); break;
    case 'done': check('ok'); boolean(b.ok); break;
    case 'closed': check('nativeRef'); nullablePath(b.nativeRef); break;
    case 'observation': check('kind','eventType','sourceType'); if (!['activity','idle','diagnostic'].includes(String(b.kind))) throw new Error('invalid_kind'); identifier(b.eventType); if (b.sourceType !== null) identifier(b.sourceType); break;
    case 'fault': check('code'); if (!['initialization_failed','execution_failed','protocol_failed'].includes(String(b.code))) throw new Error('invalid_fault'); break;
    default: throw new Error('unknown_message');
  }
  if (new TextEncoder().encode(JSON.stringify(obj)).byteLength > MAX_MESSAGE_BYTES) throw new Error('message_too_large');
  // Entire closed union validated above. Parsing never grants authority from these identities.
  return obj as unknown as Envelope;
}
