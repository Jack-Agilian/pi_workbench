import { UiIcon } from './ui-icon.tsx';
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Native dialog owns modality and keyboard focus; this only positions its contents.
 * React public dialog/effect cleanup pattern, not a second menu or focus framework. */
export function ActionPanel({title, anchor, close, children, approvalId}: {title:string; anchor?:HTMLElement|null; close:()=>void; children:ReactNode;approvalId?:string}) {
  const ref=useRef<HTMLDialogElement>(null),label=useId();
  useLayoutEffect(()=>{
    const panel=ref.current!;
    panel.showModal();
    const position=()=>{
      if(!anchor?.isConnected)return;
      const box=anchor.getBoundingClientRect(),height=panel.offsetHeight;
      panel.style.margin='0';
      panel.style.left=Math.max(12,Math.min(box.left,innerWidth-panel.offsetWidth-12))+'px';
      panel.style.top=Math.max(12,Math.min(box.top>height+12?box.top-height-8:box.bottom+8,innerHeight-height-12))+'px';
    };
    position();const observer=new ResizeObserver(position);observer.observe(panel);window.addEventListener('resize',position);
    return()=>{observer.disconnect();window.removeEventListener('resize',position);panel.close();};
  },[anchor]);
  return createPortal(<dialog ref={ref} data-approval={approvalId} className={`action-panel ${anchor?'anchored':''}`} aria-labelledby={label} onCancel={e=>{e.preventDefault();close();}} onClick={e=>{
    if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();
    if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();
  }}><header><h2 id={label}>{title}</h2><button type="button" aria-label={`关闭${title}`} onClick={close}><UiIcon name="close"/></button></header>{children}</dialog>,document.body);
}
