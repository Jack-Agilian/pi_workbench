import { UiIcon } from './ui-icon.tsx';
import { useEffect, useRef, useState } from 'react';
import type { DesktopApi, DesktopThread, Preview } from '../../packages/app-contracts/desktop.ts';
import { CopyText } from './copy-text.tsx';
import { MessageMarkdown } from './message-markdown.tsx';
import { ActionPanel } from './action-panel.tsx';
export const artifactBadge=(path:string)=>path.toLowerCase().endsWith('.md')?{text:'MD',label:'Markdown 文件'}:{text:'▤',label:'文件（按登记名称）'};
const statusLabels:Record<Preview['status'],string>={ready:'内容与登记版本一致',changed:'当前内容与此登记版本不同',missing:'文件已不存在',unavailable:'无法安全读取'};
/** WORK owns the selected registered identity. Reading never accepts an arbitrary path. */
export function ArtifactPanel({thread,api,disconnected,hasMore,loading,loadMore,selectedId,select,open,close,positions}: {
  thread:DesktopThread|null;api:DesktopApi;disconnected:boolean;hasMore:boolean;loading:boolean;loadMore:()=>void;
  selectedId?:string;select:(id:string)=>void;open:boolean;close:()=>void;positions:Map<string,number>;
}) {
  const [preview,setPreview]=useState<{id:string;value?:Preview;error?:boolean;at?:string}|null>(null);
  const [panel,setPanel]=useState<'files'|'versions'|null>(null);
  const generation=useRef(0),picker=useRef<HTMLButtonElement>(null),versionsButton=useRef<HTMLButtonElement>(null);
  const body=useRef<HTMLDivElement>(null);
  const artifact=thread?.artifacts.find(item=>item.id===selectedId);
  const selected=preview?.id===selectedId?preview:null;
  async function inspect(id:string){
    const current=++generation.current;setPreview({id});
    try{const value=await api.preview(id);if(generation.current===current)setPreview({id,value,at:new Date().toLocaleTimeString('zh-CN')});}
    catch{if(generation.current===current)setPreview({id,error:true});}
  }
  useEffect(()=>{
    if(open&&selectedId&&!disconnected)void inspect(selectedId);
    else {generation.current++;setPreview(null);}
    return()=>{generation.current++;};
  },[open,selectedId,disconnected]);
  useEffect(()=>{if(!open)setPanel(null);},[open]);
  useEffect(()=>{if(body.current&&selectedId)body.current.scrollTop=positions.get(selectedId)??0;},[selectedId,selected?.value]);
  const versions=thread?.artifacts.filter(a=>a.path===artifact?.path).sort((a,b)=>b.version-a.version)??[];
  const files=[...new Map((thread?.artifacts??[]).slice().sort((a,b)=>b.version-a.version).map(a=>[a.path,a] as const).reverse()).values()];
  const choose=(id:string)=>{setPanel(null);if(id===selectedId)void inspect(id);else select(id);};
  return <>
    <header className="document-header">
      <button className="document-picker" ref={picker} aria-haspopup="dialog" aria-expanded={panel==='files'} onClick={()=>setPanel('files')} title={artifact?.path??'选择文档'}><span className="file-icon">{artifact?artifactBadge(artifact.path).text:'▤'}</span><strong>{artifact?.path.split('/').at(-1)??'选择文档'}</strong><UiIcon name="chevron"/></button>
      {selected?.value?.status==='ready'&&<CopyText key={selectedId} text={selected.value.text??''} compact label="复制已核验预览" disabled={disconnected}/>}
      <button className="document-versions" ref={versionsButton} aria-label="版本与来源" title="版本与来源" disabled={!artifact} onClick={()=>setPanel('versions')}><UiIcon name="more"/></button>
      <button className="inspector-close" aria-label="关闭文档" title="关闭文档" onClick={close}><UiIcon name="close"/></button>
    </header>
    {open&&<section className="preview" data-status={selected?.value?.status??'unchecked'} aria-label="成果预览" tabIndex={-1}>
      {disconnected?<p className="document-notice" role="status">连接已断开，重新连接后再核验文件。</p>:!artifact?<div className="artifact-empty"><p>{selectedId?'正在读取已选择文档的登记信息…':thread?.artifacts.length?'选择一个文档开始阅读':'这个会话还没有文档'}</p>{!!thread?.artifacts.length&&<button onClick={()=>setPanel('files')}>选择文档</button>}</div>:selected?.error?<p className="document-notice" role="status">核验请求未获确认，无法确定当前文件状态。</p>:!selected?.value?<p className="document-notice" role="status">正在核验文件…</p>:selected.value.status!=='ready'?<p className="document-notice" role="status">{selected.value.status==='changed'?'当前内容与此登记版本不同；历史记录保留，不展示不匹配的内容。':selected.value.status==='missing'?'文件已不存在，历史成果记录仍保留。':'当前无法安全读取此文件。'}</p>:null}
      <div className="document-reading" ref={body} onScroll={()=>{if(body.current&&selectedId)positions.set(selectedId,body.current.scrollTop);}}>
        {!disconnected&&selected?.value?.status==='ready'&&artifact&&(artifact.path.toLowerCase().endsWith('.md')?<MessageMarkdown text={selected.value.text??''}/>:<pre className="document-text">{selected.value.text}</pre>)}
      </div>
      {artifact&&selected?.value?.status!=='ready'&&<button className="recheck-document" disabled={disconnected||(!selected?.value&&!selected?.error)} onClick={()=>void inspect(artifact.id)}>重新核验文件</button>}
    </section>}
    {panel==='files'&&<ActionPanel title="选择文档" anchor={picker.current} close={()=>setPanel(null)}><div className="document-list">
      {files.map(a=><button key={a.id} className={`artifact ${selectedId===a.id?'selected-artifact':''}`} data-artifact={a.id} disabled={disconnected} onClick={()=>choose(a.id)}><span className="file-icon">{artifactBadge(a.path).text}</span><span><strong>{a.path.split('/').at(-1)}</strong><small>{a.path}</small></span></button>)}
      {hasMore&&<button className="load-artifacts" disabled={loading||disconnected} onClick={loadMore}>{loading?'正在加载…':'加载更多成果'}</button>}
      {!files.length&&<p>这个会话还没有文档。</p>}
    </div></ActionPanel>}
    {panel==='versions'&&artifact&&<ActionPanel title="版本与来源" anchor={versionsButton.current} close={()=>setPanel(null)}><p>{artifact.path}</p>
      <label className="artifact-version-picker">本会话已加载的同路径版本<select aria-label="选择成果版本" value={artifact.id} disabled={disconnected} onChange={e=>select(e.target.value)}>{versions.map(a=><option key={a.id} value={a.id}>版本 {a.version} · 执行 {a.runId.slice(0,8)}</option>)}</select></label>
      {hasMore&&<p>版本列表尚未全部加载，请从文档选择中加载更多。</p>}
      <section className="artifact-evidence"><p>来源：{thread?.inputs.find(i=>i.id===artifact.runId)?.text.slice(0,160)??'原任务输入尚未加载'}</p><p>执行 {artifact.runId}<br/>操作 {artifact.operationId}</p><p>SHA-256（登记文件原始字节）</p><code>{artifact.digest}</code><p>{artifact.bytes} B · 版本 {artifact.version}</p><p>仅核对当前文件是否匹配登记版本；没有保存历史文件副本。正文经过已知凭据格式过滤，复制的是上次核验时的展示文本，不可用来重算登记摘要。</p></section>
      {selected?.value&&<p className="preview-check">上次核验 {selected.at} · {statusLabels[selected.value.status]}</p>}
      <button className="recheck-document" disabled={disconnected||(!selected?.value&&!selected?.error)} onClick={()=>void inspect(artifact.id)}>重新核验文件</button>
    </ActionPanel>}
  </>;
}
