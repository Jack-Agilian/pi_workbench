// Actual host/Worker/SQLite with explicitly synthetic no-model inputs.
import assert from 'node:assert/strict';
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app,type BrowserWindow } from 'electron';
import type { HostClient } from './host-client.ts';
import type { DesktopHome,DesktopThread } from '../../packages/app-contracts/desktop.ts';
export async function runOtherRunsSmoke(window:BrowserWindow,host:HostClient,profile:string){
 const js=<T>(source:string):Promise<T>=>window.webContents.executeJavaScript(source,true);
 const wait=async(check:()=>Promise<boolean>,label:string)=>{const end=Date.now()+15000;while(!await check()){if(Date.now()>end){console.log('other-run diagnostic',await js("({title:document.querySelector('h1')?.textContent,other:document.querySelector('.other-runs')?.textContent,options:document.querySelectorAll('.other-runs option').length})"),(await host.request({type:'home'}) as DesktopHome).activeRuns);throw Error('other_run_timeout:'+label);}await new Promise(r=>setTimeout(r,40));}};
 const click=(selector:string)=>js(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b||b.disabled)throw Error('control_unavailable');b.click()})()`);
 const fill=(selector:string,text:string)=>js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const d=e.closest('details');if(d)d.open=true;Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
 const create=async(title:string)=>{await click('.new-thread');await fill('#title',title);await click('.create-thread');await wait(()=>js<boolean>(`document.querySelector('h1')?.textContent===${JSON.stringify(title)}&&!document.querySelector('#composer').disabled`),'create');return (await host.request({type:'home'}) as DesktopHome).threads[0]!.id;};
 const submit=async(text:string)=>{await fill('#composer',text);await wait(()=>js<boolean>("!document.querySelector('.composer button[type=submit]').disabled"),'send');await click('.composer button[type=submit]');await wait(()=>js<boolean>("document.querySelector('#composer').value===''"),'accepted');};
 const a=await create('SYNTHETIC cross-thread working');await submit('SYNTHETIC cross-thread pending write');
 await wait(()=>js<boolean>("!!document.querySelector('.approval')"),'pending');await fill('#composer','SYNTHETIC working draft');
 const state=await host.request({type:'thread',threadId:a}) as DesktopThread,run=state.runs[0]!,op=state.operations[0]!;
 const b=await create('SYNTHETIC cross-thread queued');await submit('SYNTHETIC queued must not execute');
 const queued=(await host.request({type:'thread',threadId:b}) as DesktopThread).runs[0]!;assert.equal(queued.state,'queued');
 // Home.activeRuns deliberately excludes queued Runs; use the queued Run's own control.
 await wait(()=>js<boolean>(`!!document.querySelector('[data-run="${queued.id}"] .stop')`),'queued_control');
 await click(`[data-run="${queued.id}"] .stop`);
 await wait(async()=>(await host.request({type:'thread',threadId:b}) as DesktopThread).runs[0]!.state==='cancelled','queued_cancelled');
 assert.equal((await host.request({type:'thread',threadId:b}) as DesktopThread).operations.length,0);
 assert.equal((await host.request({type:'thread',threadId:a}) as DesktopThread).runs[0]!.state,'running');
 const c=await create('SYNTHETIC cross-thread reading');await fill('#composer','SYNTHETIC reading draft');
 const home=await host.request({type:'home'}) as DesktopHome;
 for(let n=0;n<35;n++)await host.request({type:'command',command:{type:'threads.create',requestId:`SYNTHETIC-other-filler-${n}`,workspaceId:home.workspaces.selectedId,title:`SYNTHETIC other filler ${n}`}});
 await fill('#thread-search','SYNTHETIC unmatched other-task search');await js("document.querySelector('.thread-search').requestSubmit()");
 await wait(()=>js<boolean>("document.querySelector('.directory-status')?.textContent.includes('没有匹配')===true"),'filtered');
 await wait(()=>js<boolean>(`document.querySelector('.other-runs')?.getAttribute('data-other-run')===${JSON.stringify(run.id)}`),'active_identity');
 assert.equal((await host.request({type:'home'}) as DesktopHome).threads.some(t=>t.id===a),false);
 assert.equal(await js<boolean>(`!!document.querySelector('[data-thread="${a}"]')`),false);
 const request=host.request.bind(host);let commands=0;
 host.request=async(raw,...args)=>{if(raw.type==='command')commands++;return request(raw,...args);};
 const size=window.getSize(),zoom=window.webContents.getZoomFactor();
 const output=join(app.getAppPath(),'../../.artifacts/cross-thread-20261004');mkdirSync(output,{recursive:true});
 try {
  for(const [width,height,factor] of [[1320,900,1],[820,640,1],[820,640,2]] as const){
   window.setSize(width,height);window.webContents.setZoomFactor(factor);
   await wait(()=>js<boolean>(`innerWidth===${width/factor} && document.querySelector('.shell').dataset.narrow===String(innerWidth<700) && (${factor}===1 || document.querySelector('.sidebar').hidden)`),'responsive_settled');
   await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
   assert.equal(await js<boolean>("['.show-other-run','.stop-other-run','.composer'].every(s=>{const b=document.querySelector(s).getBoundingClientRect();return b.width>0&&b.left>=0&&b.right<=innerWidth+1&&b.top>=0&&b.bottom<=innerHeight+1})"),true);
   assert.ok(await js<number>("document.querySelector('.timeline').clientHeight")>=40,'other-task bar retains a reading viewport');
   writeFileSync(join(output,`other-task-${width}-${factor}.png`),(await window.webContents.capturePage(undefined,{stayAwake:true})).toPNG());
  }
  window.webContents.setZoomFactor(zoom);window.setSize(size[0]!,size[1]!);
  await click('.show-other-run');
  await wait(()=>js<boolean>("document.querySelector('h1')?.textContent==='SYNTHETIC cross-thread working'&&!!document.querySelector('.approval')"),'return_pending');
  assert.equal(await js<string>("document.querySelector('#composer').value"),'SYNTHETIC working draft');
  assert.equal(commands,0,'view navigation must not send execution commands');
  // Return to the reading Thread through ordinary directory search; both drafts survive.
  await fill('#thread-search','SYNTHETIC cross-thread reading');await js("document.querySelector('.thread-search').requestSubmit()");
  await wait(()=>js<boolean>(`!!document.querySelector('[data-thread="${c}"]')`),'reading_found');await click(`[data-thread="${c}"] .thread-link`);
  await wait(()=>js<boolean>("document.querySelector('#composer').value==='SYNTHETIC reading draft'&&!!document.querySelector('.stop-other-run')"),'reading_return');
  await click('.stop-other-run');
  await wait(async()=>(await request({type:'thread',threadId:a}) as DesktopThread).runs[0]!.state==='cancelled','active_cancelled');
  await wait(()=>js<boolean>("!document.querySelector('.other-runs')"),'settled_removed');
  assert.equal(commands,1);assert.equal(existsSync(join(profile,'workspace',op.artifactPath!)),false);
  assert.equal(await js<string>("document.querySelector('#composer').value"),'SYNTHETIC reading draft');
  assert.equal(await js<boolean>("!!document.querySelector('.run-completion')?.textContent"),false,'other task cancellation is not current Thread completion');
  const final=await request({type:'thread',threadId:a}) as DesktopThread;assert.equal(final.runs.length,1);assert.equal(final.operations.length,1);assert.equal(final.artifacts.length,0);
  console.log('other tasks: actual off-page/filtered active Run return, draft preservation, exact queued cancel without execution, pending Worker cancel without file, responsive controls, no replay/current-thread false completion passed');
 }finally{host.request=request;window.webContents.setZoomFactor(zoom);window.setSize(size[0]!,size[1]!);}
 await click('.clear-thread-search');
}
