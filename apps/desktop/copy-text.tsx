import { useEffect, useRef, useState } from 'react';
/** Copies only an already approved display projection. No file/Session reads. */
export function CopyText({text,label,disabled=false}:{text:string;label:string;disabled?:boolean}) {
  const [result,setResult]=useState<{text:string;label:string;status:'busy'|'done'|'error'}|null>(null);
  const identity=useRef({text,label,disabled}),generation=useRef(0),pending=useRef(false);
  identity.current={text,label,disabled};
  useEffect(()=>()=>{generation.current++;},[]);
  const status=result?.text===text&&result.label===label?result.status:null;
  async function copy(){
    if(disabled||pending.current)return;
    const version=++generation.current;pending.current=true;setResult({text,label,status:'busy'});
    try {await window.workbench.copyText(text);if(version===generation.current&&identity.current.text===text&&identity.current.label===label&&!identity.current.disabled)setResult({text,label,status:'done'});}
    catch {if(version===generation.current&&identity.current.text===text&&identity.current.label===label&&!identity.current.disabled)setResult({text,label,status:'error'});}
    finally {pending.current=false;}
  }
  return <span className="copy-action"><button type="button" className="copy-text" disabled={disabled||status==='busy'} title="纯文本复制当前展示内容，保留 Markdown；不含未加载或已过滤内容。" onClick={()=>void copy()}>{label}</button><span className="copy-feedback" role="status">{status==='busy'?'正在复制…':status==='done'?'已复制':status==='error'?'复制失败，请重试或手动选择文本。':''}</span></span>;
}
