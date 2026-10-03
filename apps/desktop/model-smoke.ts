// Programmatic real Electron UI; provider text remains explicitly SYNTHETIC.
import assert from 'node:assert/strict';
import { dialog, type BrowserWindow } from 'electron';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HostClient } from './host-client.ts';
import type { DesktopHome, DesktopThread } from '../../packages/app-contracts/desktop.ts';
export async function runModelSmoke(window:BrowserWindow,host:HostClient){
 const js=<T>(code:string):Promise<T>=>window.webContents.executeJavaScript(code,true);
 const wait=async(fn:()=>Promise<boolean>,label:string)=>{const end=Date.now()+15000;while(!await fn()){if(Date.now()>end)throw new Error('model_ui_timeout:'+label);await new Promise(r=>setTimeout(r,40));}};
 const click=(selector:string)=>js(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b||b.disabled)throw Error('disabled');b.click()})()`);
 const fill=(value:string)=>js(`(()=>{const t=document.querySelector('#composer');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(value)});t.dispatchEvent(new Event('input',{bubbles:true}))})()`);
 await wait(()=>js<boolean>("!!document.querySelector('.new-thread')"),'mounted');
 const home=await host.request({type:'home'}) as DesktopHome;
 if(home.mode==='model-offline'&&home.model?.limits?.shellTools){const {runAgentShellSmoke}=await import('./agent-shell-smoke.ts');await runAgentShellSmoke(window,host);return;}
 if(home.mode==='model-offline'&&home.model?.limits?.fileTools){const {runFileModelSmoke}=await import('./file-model-smoke.ts');await runFileModelSmoke(window,host);return;}
 if(home.mode==='model' && home.model?.status==='ready'){
  assert.equal(await js<boolean>("'setModelKey' in window.workbench"),false);
  assert.equal(await js<boolean>("document.body.textContent.includes('SYNTHETIC_STORED_KEY')"),false);
  await host.reconnect();assert.equal((await host.request({type:'home'}) as DesktopHome).model?.status,'ready');
  assert.equal(JSON.stringify(await host.request({type:'home'})).includes('SYNTHETIC_STORED_KEY'),false);
  console.log('desktop stored auth.json: startup and reconnect ready, no Renderer key, no prompt sent');return;
 }
 if(home.mode==='model' && home.model?.status==='key_required'){
  const folder=mkdtempSync(join(tmpdir(),'synthetic-key-'));const file=join(folder,'test.key');const secret='SYNTHETIC_UI_KEY_NOT_REAL';writeFileSync(file,secret,{mode:0o600});
  const original=dialog.showOpenDialog;let opened=0;
  dialog.showOpenDialog=async()=>{opened++;return {canceled:false,filePaths:[file]};};
  try {
   await wait(()=>js<boolean>("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('选择凭据'))"),'key_button');
   await js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('选择凭据')).click()");
   await wait(async()=>(await host.request({type:'home'}) as DesktopHome).model?.status==='ready','credential_ready');
   assert.equal(opened,1);assert.equal(await js<boolean>(`document.body.textContent.includes(${JSON.stringify(secret)})`),false);
   assert.equal(await js<boolean>("'setModelKey' in window.workbench"),false);
   await host.reconnect();assert.equal((await host.request({type:'home'}) as DesktopHome).model?.status,'key_required');
   console.log('desktop model configuration: native dialog selection, no Renderer key API, reconnect clears credential; no prompt sent');
  } finally {dialog.showOpenDialog=original;rmSync(folder,{recursive:true,force:true});}
  return;
 }
 if(home.mode==='model'){
  assert.equal(await js<boolean>("document.querySelector('[aria-label=模型配置]').textContent.includes('尚未配置')"),true);
  await click('.new-thread');await wait(()=>js<boolean>("!document.querySelector('#composer').disabled"),'thread');await fill('must not send');
  assert.equal(await js<boolean>("document.querySelector('button[type=submit]').disabled"),true);console.log('desktop model not-configured: passed');return;
 }
 assert.equal(home.mode,'model-offline');await click('.new-thread');await wait(()=>js<boolean>("!document.querySelector('#composer').disabled"),'thread');
 await fill('remember SYNTHETIC green-29');await wait(()=>js<boolean>("!document.querySelector('button[type=submit]').disabled"),'send');await js("document.querySelector('form.composer').requestSubmit()");
 await wait(()=>js<boolean>("!!document.querySelector('[data-state=completed] .message.assistant')"),'complete');
 let current=await host.request({type:'home'}) as DesktopHome;const threadId=current.threads[0]!.id;
 await host.reconnect();await js("window.workbench.home()");await fill('repeat remembered token');await wait(()=>js<boolean>("!document.querySelector('button[type=submit]').disabled"),'continue');await js("document.querySelector('form.composer').requestSubmit()");
 await wait(()=>js<boolean>("document.querySelectorAll('[data-state=completed]').length===2"),'resumed');
 let state=await host.request({type:'thread',threadId}) as DesktopThread;assert.match(state.presentations[1]!.value.messages.find(m=>m.role==='assistant')!.text,/green-29.*repeat remembered/);assert.equal(state.operations.length,0);
 await fill('[long]');await wait(()=>js<boolean>("!document.querySelector('button[type=submit]').disabled"),'long');await js("document.querySelector('form.composer').requestSubmit()");
 await wait(()=>js<boolean>("!!document.querySelector('[data-state=running] .message.assistant')"),'live-stream');await click('.stop');
 await wait(()=>js<boolean>("!!document.querySelector('[data-state=cancelled]')"),'cancelled');
 state=await host.request({type:'thread',threadId}) as DesktopThread;assert.equal(state.runs.length,3);assert.equal(state.operations.length,0);
 assert.equal(await js<boolean>("!document.body.textContent.includes('新建任务') && document.body.textContent.includes('新建会话')"),true);
 await click('.new-thread');await wait(()=>js<boolean>("!document.querySelector('#composer').disabled"),'error-thread');
 await fill('[error]');await wait(()=>js<boolean>("!document.querySelector('button[type=submit]').disabled"),'error-send');await js("document.querySelector('form.composer').requestSubmit()");
 await wait(()=>js<boolean>("!!document.querySelector('[data-state=failed] .model-error[role=alert]')"),'safe-error');
 assert.equal(await js<boolean>("document.querySelector('.model-error').textContent.includes('原始错误正文未保存') && !document.body.textContent.includes('SYNTHETIC_PROVIDER_FAILURE')"),true);
 console.log('desktop model offline: stream, native resume, cancel, safe error and terminology passed');
}
