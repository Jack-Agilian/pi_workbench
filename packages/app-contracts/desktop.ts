import { parsePageOptions, type PageOptions, type HistoryPage, type HistoryEntry, type OperationPage, type ArtifactPage, type ThreadActivity } from './desktop-pages.ts';
import type { ModelShellPolicy } from './model-shell.ts';
import type { FileToolPolicy } from './file-tools.ts';
import type { ModelOutcome } from './model.ts';
import { identifier, parseCommand, type Ack, type Command, type ProductEvent, type RunView, type Snapshot, type ThreadView } from './index.ts';
import { exact, record } from './worker-ipc.ts';
import type { Presentation } from './presentation.ts';
export interface DesktopThread extends Snapshot { modelOutcomes?: {runId:string;value:ModelOutcome|null}[]; inputs: { id: string; text: string }[]; presentations: { runId: string; value: Presentation }[] }
export interface DesktopHome { queryScope?: string; workspaces: {selectedId:string;items:{id:string;path:string;status?:'ready'|'invalid'}[]}; mode: 'synthetic' | 'model-offline' | 'model'; model?: {status:'not_configured'|'key_required'|'ready'|'policy_required'|'budget_exhausted';provider:string;model:string;limits?:{endpoint:string;requests:number|null;estimatedUsd:number|null;outputTokens:number|null;timeoutMs?:number;httpIdleTimeoutMs?:number;fileTools?:FileToolPolicy;shellTools?:ModelShellPolicy}}; threads: ThreadView[]; activeRuns: RunView[]; recovery: 'ready' | 'blocked' }
export type Preview = { status: 'ready' | 'changed' | 'missing' | 'unavailable'; text?: string };
export type DesktopRequest =
  | { type:'history-entry'; threadId:string; runId:string }
  | { type:'history-page'|'artifact-page'; threadId:string; page?:PageOptions }
  | { type:'operation-page'; runId:string; page?:PageOptions }
  | { type:'thread-activity'; threadId:string }
  | { type: 'home' } | { type: 'recover' }
  | { type: 'thread'; threadId: string } | { type: 'events'; threadId: string; cursor: number }
  | { type: 'preview'; artifactId: string } | { type: 'command'; command: Command };
export type DesktopValue = HistoryEntry | HistoryPage | OperationPage | ArtifactPage | ThreadActivity | DesktopHome | DesktopThread | Preview | Ack | ProductEvent[];
export type DesktopReply = { ok: true; value: DesktopValue } | { ok: false; code: 'invalid_request' | 'request_rejected' | 'disconnected' | 'busy' | 'workspace_invalid' | 'page_cursor_invalid' | 'page_item_too_large' };
export function parseDesktopRequest(raw: unknown): DesktopRequest {
  const r = record(raw); let result: DesktopRequest;
  switch (r.type) {
    case 'history-entry': exact(r,['type','threadId','runId']);result={type:r.type,threadId:identifier(r.threadId),runId:identifier(r.runId)};break;
    case 'thread-activity': exact(r,['type','threadId']);result={type:r.type,threadId:identifier(r.threadId)};break;
    case 'history-page': case 'artifact-page':
      exact(r,['type','threadId',...(Object.hasOwn(r,'page')?['page']:[])]);result={type:r.type,threadId:identifier(r.threadId),page:parsePageOptions(r.page)};break;
    case 'operation-page':
      exact(r,['type','runId',...(Object.hasOwn(r,'page')?['page']:[])]);result={type:r.type,runId:identifier(r.runId),page:parsePageOptions(r.page)};break;
    case 'home': case 'recover': exact(r, ['type']); result = { type: r.type }; break;
    case 'thread': exact(r, ['type','threadId']); result = { type: r.type, threadId: identifier(r.threadId) }; break;
    case 'events':
      exact(r, ['type','threadId','cursor']);
      if (typeof r.cursor !== 'number' || !Number.isSafeInteger(r.cursor) || r.cursor < 0) throw new Error('invalid_cursor');
      result = { type: r.type, threadId: identifier(r.threadId), cursor: r.cursor }; break;
    case 'preview': exact(r, ['type','artifactId']); result = { type: r.type, artifactId: identifier(r.artifactId) }; break;
    case 'command': exact(r, ['type','command']); result = { type: r.type, command: parseCommand(r.command) }; break;
    default: throw new Error('unknown_request');
  }
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 65536) throw new Error('request_too_large');
  return result;
}
export interface DesktopApi {
  /** Opaque host connection identity; carries no execution authority or filesystem path. */
  queryScope(): Promise<string>;
  historyEntry(threadId:string,runId:string):Promise<HistoryEntry>;
  historyPage(threadId:string,page?:PageOptions):Promise<HistoryPage>;
  operationPage(runId:string,page?:PageOptions,queryScope?:string):Promise<OperationPage>;
  artifactPage(threadId:string,page?:PageOptions):Promise<ArtifactPage>;
  threadActivity(threadId:string):Promise<ThreadActivity>;
  selectWorkspace(): Promise<void>;
  selectModelCredential(): Promise<void>;
  home(): Promise<DesktopHome>; thread(threadId: string): Promise<DesktopThread>;
  events(threadId: string, cursor: number): Promise<ProductEvent[]>;
  command(command: Command): Promise<Ack>; preview(artifactId: string): Promise<Preview>;
  recover(): Promise<DesktopHome>; reconnect(): Promise<void>;
}

export function desktopErrorCode(error:unknown):Extract<DesktopReply,{ok:false}>['code'] {
  const code=error instanceof Error?error.message:'';
  return code==='disconnected'||code==='busy'||code==='workspace_invalid'||code==='page_cursor_invalid'||code==='page_item_too_large'?code:'request_rejected';
}
