// Product read projection, not a Pi message tree or an execution input.
export interface NativeTextChunk {
  id: string; role: 'user'|'assistant'|'tool'; text: string;
  offset: number; end: boolean; redacted: boolean;
}
export type NativeTextPage =
  | {status:'ready'; chunks:NativeTextChunk[]; nextCursor:string|null; filtered:boolean}
  | {status:'pending'|'unavailable'|'missing'|'changed'|'too_large'};
/** Host-only reference. Never returned across the desktop bridge. */
export interface NativeTextSource { reference:string; start:string|null; end:string|null; finished:boolean }
