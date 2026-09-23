// Product-only JSON contracts. No Pi, Node or Electron types cross this boundary.
export type RunState = 'queued' | 'starting' | 'running' | 'cancelling' | 'unknown' | 'completed' | 'failed' | 'cancelled';
export type OperationState = 'pending' | 'approved' | 'executing' | 'unknown' | 'succeeded' | 'failed' | 'denied';
export type Command =
  | { type: 'threads.create'; requestId: string; workspaceId: string; title: string }
  | { type: 'runs.start'; requestId: string; threadId: string; input: string }
  | { type: 'runs.cancel'; requestId: string; runId: string }
  | { type: 'approvals.resolve'; requestId: string; operationId: string; parametersDigest: string; decision: 'allow' | 'deny' };
export interface Ack { accepted: true; id: string }
export interface ThreadView { id: string; workspaceId: string; title: string }
export interface RunView { id: string; threadId: string; state: RunState }
export interface OperationView { id: string; runId: string; toolCallId: string; tool: string; parametersDigest: string; artifactPath: string | null; deadline: number; state: OperationState }
export interface ArtifactView { id: string; runId: string; operationId: string; path: string; version: number; digest: string; bytes: number }
export interface RuntimeObservation { kind: 'activity' | 'idle' | 'diagnostic'; eventType: string; sourceType: string | null }
export interface ProductEvent { seq: number; runSeq: number; threadId: string; runId: string; kind: string; entityId: string; eventType: string | null; sourceType: string | null }
export interface Snapshot { cursor: number; thread: ThreadView; runs: RunView[]; operations: OperationView[]; artifacts: ArtifactView[] }
export interface Binding { runId: string; threadId: string; runtimeBindingId: string; workerEpoch: string; sessionGeneration: string }
export interface Dispatch extends Binding { input: string; workspaceId: string; nativeSessionRef: string | null; nativeSessionPersisted: boolean }

export function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(value)) throw new Error('invalid_identifier');
  return value;
}
export function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('invalid_digest');
  return value;
}
function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || value.includes('\0')) throw new Error('invalid_text');
  return value;
}
/** Normalize into a new object: fixed field order for durable idempotency, reject unknown authority fields. */
export function parseCommand(value: unknown): Command {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('invalid_command');
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Object.values(fields).some(field => !('value' in field)) || Reflect.ownKeys(value).some(key => typeof key !== 'string')) throw new Error('invalid_command');
  const command: Record<string, unknown> = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
  const requestId = identifier(command.requestId);
  let result: Command;
  switch (command.type) {
    case 'threads.create': result = { type: command.type, requestId, workspaceId: identifier(command.workspaceId), title: text(command.title, 160) }; break;
    case 'runs.start': result = { type: command.type, requestId, threadId: identifier(command.threadId), input: text(command.input, 16_384) }; break;
    case 'runs.cancel': result = { type: command.type, requestId, runId: identifier(command.runId) }; break;
    case 'approvals.resolve':
      if (command.decision !== 'allow' && command.decision !== 'deny') throw new Error('invalid_decision');
      result = { type: command.type, requestId, operationId: identifier(command.operationId), parametersDigest: sha256(command.parametersDigest), decision: command.decision }; break;
    default: throw new Error('unknown_command');
  }
  if (Object.keys(command).length !== Object.keys(result).length || Object.keys(command).some(key => !Object.hasOwn(result, key))) throw new Error('unknown_field');
  return result;
}
