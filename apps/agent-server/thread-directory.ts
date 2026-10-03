import type { DatabaseSync } from 'node:sqlite';
import type { ThreadView } from '../../packages/app-contracts/index.ts';
import { parseThreadSearch, type ThreadSearch, type ThreadDirectoryPage } from '../../packages/app-contracts/thread-directory.ts';
import { DESKTOP_PAGE_BYTES } from '../../packages/app-contracts/desktop-pages.ts';
import { exact } from '../../packages/app-contracts/worker-ipc.ts';
import { displayText } from '../../packages/app-contracts/presentation.ts';
/** Read within Core's SQLite transaction. No Session index, free SQL or file access.
 * Creation and title revisions are monotonic while threads have no delete/archive API.
 * This scalar scan avoids transferring all titles; it is not an unlimited-scale index.
 */
export function directoryRevision(db:DatabaseSync):number {
  return Number(db.prepare('SELECT count(*)+coalesce(sum(title_revision),0) n FROM threads').get()?.n);
}
export function readThreadDirectory(db:DatabaseSync,options:ThreadSearch={}):ThreadDirectoryPage {
  const {query='',workspaceId='',cursor,limit=16}=parseThreadSearch(options);
  if(workspaceId&&!db.prepare('SELECT 1 FROM workspaces WHERE id=?').get(workspaceId))throw Error('not_found');
  const revision=directoryRevision(db);
  const where="(?='' OR t.workspace_id=?) AND (?='' OR instr(lower(t.title),lower(?))>0 OR instr(lower(w.path),lower(?))>0)";
  const filter=[workspaceId,workspaceId,query,query,query];
  let before=Number.MAX_SAFE_INTEGER;
  if(cursor)try {
    const c=exact(JSON.parse(Buffer.from(cursor,'base64url').toString('utf8')),['v','query','workspaceId','revision','before']);
    if(c.v!==1||c.query!==query||c.workspaceId!==workspaceId||c.revision!==revision||!Number.isSafeInteger(c.before)||Number(c.before)<1)throw Error();
    before=Number(c.before);
    if(!db.prepare(`SELECT 1 FROM threads t JOIN workspaces w ON w.id=t.workspace_id WHERE ${where} AND t.rowid=?`).get(...filter,before))throw Error();
  } catch { throw Error('page_cursor_invalid'); }
  const rows=db.prepare(`SELECT t.rowid position,t.id,t.workspace_id workspaceId,t.title,t.title_revision titleRevision,t.permission_mode permissionMode,t.permission_revision permissionRevision FROM threads t JOIN workspaces w ON w.id=t.workspace_id WHERE ${where} AND t.rowid<? ORDER BY t.rowid DESC LIMIT ?`).all(...filter,before,limit+1) as unknown as (ThreadView&{position:number})[]; // Fixed projection from the host-owned STRICT schema.
  const page:ThreadDirectoryPage={items:[],nextCursor:null,hasMore:false,revision};
  for(const {position:_,...raw} of rows.slice(0,limit)) {
    const item={...raw,title:displayText(raw.title,160)};
    if(Buffer.byteLength(JSON.stringify({...page,items:[...page.items,item]}))+2048>DESKTOP_PAGE_BYTES){if(!page.items.length)throw Error('page_item_too_large');break;}
    page.items.push(item);
  }
  page.hasMore=rows.length>page.items.length;
  if(page.hasMore)page.nextCursor=Buffer.from(JSON.stringify({v:1,query,workspaceId,revision,before:rows[page.items.length-1]!.position})).toString('base64url');
  return page;
}
