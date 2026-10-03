import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DesktopApi } from '../../packages/app-contracts/desktop.ts';
import type { NativeTextChunk, NativeTextPage } from '../../packages/app-contracts/native-text.ts';
import { MessageMarkdown } from './message-markdown.tsx';
const reasons={pending:'执行尚未结束，原生记录范围还未确认。',unavailable:'缺少可核验的原生记录范围，保留当前摘要。',missing:'原生记录文件已缺失，保留当前摘要。',changed:'原生记录已变化，请重新读取。',too_large:'原生记录超过当前读取大小，保留当前摘要。'};
/** Disposable read state keyed by Thread/Run/connection. Never retries a command. */
export function NativeText({api,threadId,runId,scope,disconnected,children,onRead}:{onRead:()=>void;children:ReactNode;api:DesktopApi;threadId:string;runId:string;scope:string;disconnected:boolean}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [chunks,setChunks]=useState<NativeTextChunk[]>([]),[next,setNext]=useState<string|null|undefined>(undefined),[filtered,setFiltered]=useState(false);
 const generation=useRef(0),inFlight=useRef(false),opener=useRef<HTMLButtonElement>(null);
 useEffect(()=>()=>{generation.current++;inFlight.current=false;},[]);
 function close(){onRead();generation.current++;inFlight.current=false;setOpen(false);setBusy(false);setChunks([]);setNext(undefined);setError('');opener.current?.focus({preventScroll:true});}
 async function read(restart=false){
  if(disconnected||inFlight.current)return;
  onRead();inFlight.current=true;const g=++generation.current;setOpen(true);setBusy(true);setError('');
  try{
   const page:NativeTextPage=await api.nativeText(threadId,runId,restart?undefined:next??undefined,scope);
   if(g!==generation.current)return;
   if(page.status!=='ready'){setError(reasons[page.status]);if(page.status==='changed'){setChunks([]);setNext(undefined);}return;}
   setChunks(old=>restart?page.chunks:[...old,...page.chunks]);setNext(page.nextCursor);setFiltered(page.filtered);
  }catch{if(g===generation.current)setError('读取失败，可重试；不会重新执行任务。');}
  finally{if(g===generation.current){inFlight.current=false;setBusy(false);}}
 }
 // Join only contiguous fragments of the same native message; Markdown syntax can
 // cross a transport page. IDs, roles and offsets remain visible to this boundary.
 const messages:NativeTextChunk[]=[];
 for(const chunk of chunks){const last=messages.at(-1);if(last&&last.id===chunk.id&&last.role===chunk.role&&!last.end&&last.text.length===chunk.offset){last.text+=chunk.text;last.end=chunk.end;last.redacted ||=chunk.redacted;}else messages.push({...chunk});}
 return <div className="native-reading">
  {chunks.length===0&&children}
  <button className="read-native" ref={opener} disabled={!open&&(disconnected||busy)} aria-expanded={open} onClick={()=>open?close():void read(true)}>{open?'收起原生正文':'读取原生正文'}</button>
  {open&&<section aria-label="原生正文" aria-busy={busy}>
   <p className="run-note">{next===null?'本次可展示正文已读完':'按需读取本次执行的正文'} · 已过滤已知凭据格式{filtered?'、思考/附件及原始工具结果':''}；操作状态以操作记录为准。</p>
   {messages.map(m=><div className={`message ${m.role==='user'?'user':'assistant'}`} key={m.id}><div><small>{m.role==='user'?'你':m.role==='tool'?'工具执行提示':'Pi'}{!m.end?' · 后续内容待加载':''}{m.redacted?' · 已脱敏':''}</small><MessageMarkdown text={m.text} copyLabel={m.end?'复制可展示正文':'复制已加载部分'}/></div></div>)}
   {error&&<p role="status">{error}<button className="retry-native" disabled={disconnected||busy} onClick={()=>void read()}>重试读取</button></p>}
   {!error&&next!==null&&<button className="more-native" disabled={disconnected||busy} onClick={()=>void read()}>{busy?'读取中…':'继续读取正文'}</button>}
  </section>}
 </div>;
}
