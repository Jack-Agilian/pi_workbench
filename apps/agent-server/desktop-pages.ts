import { displayText } from '../../packages/app-contracts/presentation.ts';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { ArtifactView, OperationView, RunView } from '../../packages/app-contracts/index.ts';
import { DESKTOP_PAGE_BYTES, parsePageOptions, type DesktopPage, type PageOptions } from '../../packages/app-contracts/desktop-pages.ts';
import { exact } from '../../packages/app-contracts/worker-ipc.ts';

export type PageKind='history'|'operations'|'artifacts';
/** Executes inside the Core read transaction. Keyset bounds exclude newly appended
 * rows, while snapshotSeq describes this page's current projection, not MVCC history. */
export function readDesktopPage<T>(db:DatabaseSync,kind:PageKind,owner:string,options:PageOptions,map:(id:string)=>T):DesktopPage<T> {
  const {cursor,limit=16}=parsePageOptions(options);
  const sources={history:['runs','thread_id'],operations:['operations','run_id'],artifacts:['artifacts','run_id IN (SELECT id FROM runs WHERE thread_id=']};
  const [table,column]=sources[kind];
  const where=kind==='artifacts'?`${column}?)`:`${column}=?`;
  const max=Number(db.prepare(`SELECT coalesce(max(rowid),0) n FROM ${table} WHERE ${where}`).get(owner)?.n);
  let ceiling=max,before=max+1;
  if(cursor){
    try{
      const c=exact(JSON.parse(Buffer.from(cursor,'base64url').toString('utf8')),['v','kind','owner','ceiling','before']);
      if(c.v!==1||c.kind!==kind||c.owner!==owner||!Number.isSafeInteger(c.ceiling)||!Number.isSafeInteger(c.before)||Number(c.ceiling)<0||Number(c.ceiling)>max||Number(c.before)<1||Number(c.before)>Number(c.ceiling))throw new Error();
      ceiling=Number(c.ceiling);before=Number(c.before);
      if(!db.prepare(`SELECT 1 FROM ${table} WHERE ${where} AND rowid=?`).get(owner,before))throw new Error();
    }catch{throw new Error('page_cursor_invalid');}
  }
  const rows=db.prepare(`SELECT rowid AS position,id FROM ${table} WHERE ${where} AND rowid<=? AND rowid<? ORDER BY rowid DESC LIMIT ?`).all(owner,ceiling,before,limit+1) as {position:number;id:string}[];
  const page:DesktopPage<T>={items:[],nextCursor:null,hasMore:false,snapshotSeq:Number(db.prepare('SELECT coalesce(max(seq),0) n FROM events').get()?.n)};
  for(const row of rows.slice(0,limit)){
    const item=map(row.id);
    if(Buffer.byteLength(JSON.stringify({...page,items:[...page.items,item]}))+2048>DESKTOP_PAGE_BYTES){if(!page.items.length)throw new Error('page_item_too_large');break;}
    page.items.push(item);
  }
  page.hasMore=rows.length>page.items.length;
  if(page.hasMore){const last=rows[page.items.length-1]!;page.nextCursor=Buffer.from(JSON.stringify({v:1,kind,owner,ceiling,before:last.position})).toString('base64url');}
  return page;
}
// Typed rows refer only to the host-owned STRICT product schema.
export function row<T>(db:DatabaseSync,sql:string,...values:SQLInputValue[]):T {
  const result=db.prepare(sql).get(...values);if(!result)throw new Error('not_found');return result as T;
}
export const runQuery='SELECT id,thread_id AS threadId,state FROM runs WHERE id=?';
export const artifactQuery='SELECT id,run_id AS runId,operation_id AS operationId,path,version,digest,bytes FROM artifacts WHERE id=?';
export const runRow=(db:DatabaseSync,id:string)=>row<RunView>(db,runQuery,id);
export const artifactRow=(db:DatabaseSync,id:string)=>row<ArtifactView>(db,artifactQuery,id);
export function displayOperation(op:OperationView):OperationView {
  return op.shell?.outcome?{...op,shell:{...op.shell,outcome:{...op.shell.outcome,stdout:displayText(op.shell.outcome.stdout,8192),stderr:displayText(op.shell.outcome.stderr,8192)}}}:op;
}
