import type { ArtifactView, OperationView, RunView, ThreadView } from './index.ts';
import type { ModelOutcome } from './model.ts';
import type { Presentation } from './presentation.ts';
import { exact } from './worker-ipc.ts';

export const DESKTOP_PAGE_BYTES = 256_000;
export interface PageOptions { cursor?: string; limit?: number }
/** Cursor is opaque keyset position, never the product event sequence. */
export interface DesktopPage<T> { items:T[]; nextCursor:string|null; hasMore:boolean; snapshotSeq:number }
export interface HistoryItem { run:RunView; input:string; presentation:Presentation; modelOutcome:ModelOutcome|null }
export type HistoryPage = DesktopPage<HistoryItem>;
export type OperationPage = DesktopPage<OperationView>;
export type ArtifactPage = DesktopPage<ArtifactView>;
export interface ThreadActivity {
  thread:ThreadView; snapshotSeq:number; activeRun:RunView|null; operations:OperationView[];
  workspaceStatus:'ready'|'invalid';
}
export function parsePageOptions(raw:unknown):PageOptions {
  const value=raw??{};
  const r=exact(value,[...(Object.hasOwn(Object(value),'cursor')?['cursor']:[]),...(Object.hasOwn(Object(value),'limit')?['limit']:[])]);
  if(r.cursor!==undefined&&(typeof r.cursor!=='string'||!r.cursor||r.cursor.length>1024||!/^[A-Za-z0-9_-]+$/.test(r.cursor)))throw new Error('page_cursor_invalid');
  if(r.limit!==undefined&&(!Number.isSafeInteger(r.limit)||Number(r.limit)<1||Number(r.limit)>32))throw new Error('page_limit_invalid');
  return {...(r.cursor===undefined?{}:{cursor:r.cursor as string}),...(r.limit===undefined?{}:{limit:r.limit as number})};
}
