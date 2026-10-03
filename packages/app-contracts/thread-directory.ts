import type { ThreadView } from './index.ts';
import { identifier } from './index.ts';
import { exact } from './worker-ipc.ts';
import { parsePageOptions, type PageOptions } from './desktop-pages.ts';
export interface ThreadSearch extends PageOptions { query?: string; workspaceId?: string }
export interface ThreadDirectoryPage { items:ThreadView[]; nextCursor:string|null; hasMore:boolean; revision:number }
export function parseThreadSearch(raw:unknown):ThreadSearch {
  const value=raw??{};
  const r=exact(value,['query','workspaceId','cursor','limit'].filter(k=>Object.hasOwn(Object(value),k)));
  if(r.query!==undefined&&(typeof r.query!=='string'||r.query.length>160||/[\x00-\x1f\x7f]/.test(r.query)))throw Error('invalid_search');
  const page=parsePageOptions({...('cursor' in r?{cursor:r.cursor}:{}),...('limit' in r?{limit:r.limit}:{})});
  return {...page,...(r.query===undefined?{}:{query:(r.query as string).trim()}),...(r.workspaceId===undefined?{}:{workspaceId:identifier(r.workspaceId)})};
}
