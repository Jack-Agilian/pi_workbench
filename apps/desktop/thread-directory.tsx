import { useEffect, useRef, useState } from 'react';
import { QueryClient, useInfiniteQuery } from '@tanstack/react-query';
import type { DesktopApi, DesktopHome } from '../../packages/app-contracts/desktop.ts';
import type { ThreadView } from '../../packages/app-contracts/index.ts';
import { shouldSubmit } from './composer-key.ts';
import { ThreadNavigation } from './thread-navigation.tsx';

/** Product directory only. Query owns pages and async state; editing rows stay mounted
 * across filters. The selected conversation/commands are owned outside this component. */
export function ThreadDirectory({api,home,current,selected,select,disconnected,changed}: {
  api:DesktopApi;home:DesktopHome|null;current:ThreadView|null;selected:string;select:(id:string)=>void;disconnected:boolean;changed:()=>void;
}) {
  const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{networkMode:'always',staleTime:Infinity,gcTime:0,retry:false,retryOnMount:false,refetchOnWindowFocus:false,refetchOnReconnect:false,refetchOnMount:false}}}));
  const [draft,setDraft]=useState(''),[query,setQuery]=useState(''),[workspaceId,setWorkspace]=useState('');
  const [editing,setEditing]=useState<Record<string,ThreadView>>({});
  const [pinnedError,setPinnedError]=useState(false),[retry,setRetry]=useState(0);
  const scope=home?.queryScope??'',revision=home?.directoryRevision??0;
  const directory=useInfiniteQuery({
    queryKey:[scope,'thread-directory',query,workspaceId],enabled:!!scope&&!disconnected,
    initialPageParam:null as string|null,
    queryFn:async({pageParam,signal})=>{
      if(signal.aborted)throw Error('directory_cancelled');
      const page=await api.threadDirectory({query,...(workspaceId?{workspaceId}:{}),limit:16,...(pageParam?{cursor:pageParam}:{})},scope);
      if(signal.aborted)throw Error('directory_cancelled');return page;
    },
    getNextPageParam:page=>page.nextCursor,
  },client);
  const observed=useRef({scope,revision});
  useEffect(()=>{
    const old=observed.current;observed.current={scope,revision};
    // Refetch the loaded page chain from its first page; new cursors replace old
    // revision-bound positions. A failed chain remains explicit until user retry.
    if(old.scope===scope&&old.revision!==revision&&!directory.isError)void directory.refetch();
  },[scope,revision]);
  useEffect(()=>()=>{client.clear();},[client]);
  const editingKey=Object.keys(editing).sort().join(',');
  useEffect(()=>{
    let cancelled=false;setPinnedError(false);
    if(!scope||disconnected)return;
    void(async()=>{
      for(const id of Object.keys(editing)) {
        if(cancelled)return;
        try {const value=await api.threadActivity(id);if(cancelled)return;setEditing(all=>all[id]?{...all,[id]:value.thread}:all);}
        catch {if(!cancelled)setPinnedError(true);return;}
      }
    })();return()=>{cancelled=true;};
  },[scope,revision,editingKey,retry,disconnected]);
  const items=directory.data?.pages.flatMap(page=>page.items)??[];
  const rows=new Map(items.map(item=>[item.id,item]));
  // Same keyed parent preserves rename drafts even when a row moves outside results.
  for(const item of Object.values(editing))if(!rows.has(item.id)||rows.get(item.id)!.titleRevision<item.titleRevision)rows.set(item.id,item);
  if(current)rows.set(current.id,current);
  const resultIds=new Set(items.map(item=>item.id));
  const reset=()=>{setDraft('');setQuery('');setWorkspace('');};
  return <>
    <form className="thread-search" role="search" onSubmit={event=>{event.preventDefault();setQuery(draft.trim());}}>
      <label htmlFor="thread-search">查找会话</label>
      <div><input id="thread-search" type="search" maxLength={160} value={draft} placeholder="名称或工作目录" onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!shouldSubmit(event.nativeEvent))event.preventDefault();if(event.key==='Escape'){event.preventDefault();reset();}}}/><button type="submit">搜索</button></div>
      <label className="sr-only" htmlFor="thread-workspace">按工作目录筛选</label><select id="thread-workspace" value={workspaceId} onChange={event=>setWorkspace(event.target.value)}><option value="">全部工作目录</option>{home?.workspaces.items.map(w=><option key={w.id} value={w.id}>{w.path}</option>)}</select>
      {(query||workspaceId||draft)&&<button type="button" className="clear-thread-search" onClick={reset}>清除筛选</button>}
    </form>
    <div className="section-label">{query||workspaceId?'搜索结果':'最近创建的会话'} <span>{items.length}{directory.hasNextPage?'+':''}</span></div>
    {directory.isFetching&&<p className="directory-status" role="status">{directory.data?'正在更新列表…':'正在读取会话…'}</p>}
    {(directory.isError||pinnedError)&&<p className="directory-status" role="status">会话列表暂未更新，已读内容和正在编辑的名称保留。<button className="retry-directory" disabled={directory.isFetching||disconnected} onClick={()=>{setRetry(n=>n+1);void directory.refetch();}}>重新读取列表</button></p>}
    {!directory.isFetching&&!directory.isError&&!items.length&&<p className="directory-status" role="status">{query||workspaceId?'没有匹配的会话。当前会话不受筛选影响。':'暂无会话。'}</p>}
    <nav aria-label="会话列表">{[...rows.values()].map(item=><div className="directory-row" key={item.id} data-search-result={resultIds.has(item.id)}>
      {!resultIds.has(item.id)&&<small className="directory-context">{selected===item.id?'当前会话 · 列表外保留':'正在编辑 · 列表外保留'}</small>}
      <ThreadNavigation thread={item} workspace={home?.workspaces.items.find(w=>w.id===item.workspaceId)?.path} active={home?.activeRuns.some(run=>run.threadId===item.id)??false} selected={selected===item.id} select={()=>select(item.id)} api={api} scope={scope} disconnected={disconnected} changed={changed}
        editingChanged={value=>setEditing(all=>{const next={...all};if(value)next[item.id]=item;else delete next[item.id];return next;})}/>
    </div>)}</nav>
    {directory.hasNextPage&&<button className="load-threads" disabled={directory.isFetching||directory.isError||disconnected} onClick={()=>{if(!directory.isFetching)void directory.fetchNextPage({cancelRefetch:false});}}>加载更多会话</button>}
  </>;
}
