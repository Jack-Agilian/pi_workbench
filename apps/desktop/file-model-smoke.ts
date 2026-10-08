import { captureLayout } from './layout-capture.ts';
// Real Electron/Host/Pi tools, explicitly SYNTHETIC model driver. No accounts/network.
import assert from 'node:assert/strict';
import type { BrowserWindow } from 'electron';
import type { HostClient } from './host-client.ts';
import type { DesktopHome, DesktopThread } from '../../packages/app-contracts/desktop.ts';
export async function runFileModelSmoke(window:BrowserWindow,host:HostClient){
 const js=<T>(code:string):Promise<T>=>window.webContents.executeJavaScript(code,true);
 const wait=async(check:()=>Promise<boolean>,label:string)=>{const end=Date.now()+15000;while(!await check()){if(Date.now()>=end)throw new Error('file_ui_timeout:'+label);await new Promise(r=>setTimeout(r,40));}};
 const click=(selector:string)=>js(`document.querySelector(${JSON.stringify(selector)}).click()`);
 await click('.new-thread');await click('.create-thread');await wait(()=>js<boolean>("!document.querySelector('#composer').disabled"),'thread');
 await click('.context-details');
 assert.equal(await js<boolean>("document.querySelector('.context-popover').textContent.includes('人工与自动模式限定工作目录内 Markdown')"),true);
 assert.equal(await js<boolean>("document.querySelector('.context-popover').textContent.includes('完全访问允许目录外文本文件')"),true);
 assert.equal(await js<boolean>("document.querySelector('.context-popover').textContent.includes('本模式不提供工具')"),false);
 await click('[aria-label=关闭会话说明]');
 await js("(()=>{const t=document.querySelector('#composer');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'SYNTHETIC approved file workflow');t.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await wait(()=>js<boolean>("!document.querySelector('.composer button[type=submit]').disabled"),'send');await js("document.querySelector('form.composer').requestSubmit()");
 const home=await host.request({type:'home'}) as DesktopHome;const threadId=home.threads[0]!.id;
 for(const tool of ['write','read','edit']){
  await wait(async()=>{const t=await host.request({type:'thread',threadId}) as DesktopThread;const op=t.operations.find(o=>o.tool===tool&&o.state==='pending');return !!op&&await js<boolean>(`document.querySelector('.approval')?.dataset.approval===${JSON.stringify(op.id)}`);},tool);
  assert.equal(await js<boolean>("document.querySelector('.approval').textContent.includes('工具结果会发送给模型')"),true);
  if(tool==='write')await captureLayout(window,'file-approval');
  await click('.approval-evidence');
  assert.equal(await js<boolean>(`document.querySelector('.approval-meta').textContent.includes('Pi ${tool}')`),true);
  await click('[aria-label=关闭操作详情]');
  await click('.approval .primary');
  await wait(async()=>{const s=await host.request({type:'thread',threadId}) as DesktopThread;return s.operations.some(o=>o.tool===tool&&o.state==='succeeded');},tool+' settled');
 }
 await wait(()=>js<boolean>("!!document.querySelector('[data-state=completed]')"),'complete');
 let state=await host.request({type:'thread',threadId}) as DesktopThread;assert.equal(state.operations.length,3);assert.equal(state.artifacts.length,2);
 assert.equal(await js<boolean>("document.querySelectorAll('.tool-card').length===3"),true);
 const cursor=state.cursor;await host.reconnect();state=await host.request({type:'thread',threadId}) as DesktopThread;
 assert.equal(state.cursor,cursor);assert.equal(state.operations.length,3);assert.equal(state.runs.length,1);
 assert.equal(JSON.stringify(state).includes('SYNTHETIC_OFFLINE_KEY'),false);
 console.log('desktop file model: actual sequential approvals/write/read/edit, independent results/artifacts and reconnect without replay passed; SYNTHETIC model only');
}
