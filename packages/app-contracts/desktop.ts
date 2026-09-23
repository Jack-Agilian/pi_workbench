import { identifier, parseCommand, type Ack, type Command, type ProductEvent, type RunView, type Snapshot, type ThreadView } from './index.ts';
import { exact, record } from './worker-ipc.ts';
import type { Presentation } from './presentation.ts';
export interface DesktopThread extends Snapshot { inputs: { id: string; text: string }[]; presentations: { runId: string; value: Presentation }[] }
export interface DesktopHome { mode: 'synthetic'; threads: ThreadView[]; activeRuns: RunView[]; recovery: 'ready' | 'blocked' }
export type Preview = { status: 'ready' | 'changed' | 'missing' | 'unavailable'; text?: string };
export type DesktopRequest =
  | { type: 'home' } | { type: 'recover' }
  | { type: 'thread'; threadId: string } | { type: 'events'; threadId: string; cursor: number }
  | { type: 'preview'; artifactId: string } | { type: 'command'; command: Command };
export type DesktopValue = DesktopHome | DesktopThread | Preview | Ack | ProductEvent[];
export type DesktopReply = { ok: true; value: DesktopValue } | { ok: false; code: 'invalid_request' | 'request_rejected' | 'disconnected' | 'busy' };
export function parseDesktopRequest(raw: unknown): DesktopRequest {
  const r = record(raw); let result: DesktopRequest;
  switch (r.type) {
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
  home(): Promise<DesktopHome>; thread(threadId: string): Promise<DesktopThread>;
  events(threadId: string, cursor: number): Promise<ProductEvent[]>;
  command(command: Command): Promise<Ack>; preview(artifactId: string): Promise<Preview>;
  recover(): Promise<DesktopHome>; reconnect(): Promise<void>;
}
