// Actual Electron + host + Pi Bash. The Provider/dialog answers are explicitly synthetic.
import assert from 'node:assert/strict';
import { dialog, type BrowserWindow } from 'electron';
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { HostClient } from './host-client.ts';
import type { DesktopHome, DesktopThread } from '../../packages/app-contracts/desktop.ts';
import { captureLayout } from './layout-capture.ts';
export async function runAgentShellSmoke(window:BrowserWindow,host:HostClient){
 const js=<T>(code:string):Promise<T>=>window.webContents.executeJavaScript(code,true);
 const wait=async(check:()=>Promise<boolean>,label:string)=>{const end=Date.now()+15000;while(!await check()){if(Date.now()>end)throw new Error('agent_ui_timeout:'+label);await new Promise(r=>setTimeout(r,40));}};
 const click=(selector:string)=>js(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const initial=await host.request({type:'home'}) as DesktopHome;
 // Electron TMPDIR is inside the protected profile; a selectable workspace must be a sibling.
 const directory=realpathSync(mkdtempSync(join(dirname(dirname(initial.workspaces.items[0]!.path)),'SYNTHETIC-agent-workspace-')));
 const original=dialog.showOpenDialog;let dialogs=0;
 dialog.showOpenDialog=async(...args:unknown[])=>{dialogs++;const options=args.at(-1) as Electron.OpenDialogOptions;assert.deepEqual(options.properties,['openDirectory']);return {canceled:false,filePaths:[directory]};};
 try{
  assert.equal(await js<boolean>("'execute' in window.workbench || 'setWorkspacePath' in window.workbench"),false);
  await click('.choose-workspace');await wait(async()=>(await host.request({type:'home'}) as DesktopHome).workspaces.items.some(w=>w.path===directory),'selection');
  await wait(()=>js<boolean>(`document.querySelector('.execution-summary').textContent.includes(${JSON.stringify(directory)})`),'directory-shown');
  await click('.new-thread');await wait(()=>js<boolean>("!document.querySelector('#composer').disabled"),'thread');
  await js("(()=>{const t=document.querySelector('#composer');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'SYNTHETIC Bash task');t.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await wait(()=>js<boolean>("!document.querySelector('button[type=submit]').disabled"),'send');await js("document.querySelector('form.composer').requestSubmit()");
  const home=await host.request({type:'home'}) as DesktopHome;const threadId=home.threads[0]!.id;
  for(let i=0;i<2;i++){
   await wait(()=>js<boolean>("!!document.querySelector('.approval .primary')"),'approval-'+i);
   assert.equal(await js<boolean>("document.querySelector('.run-label').textContent.includes('等待你的批准')"),true);
   assert.equal(await js<boolean>(`document.querySelector('.approval').textContent.includes(${JSON.stringify(directory)}) && document.querySelector('.approval').textContent.includes('工具结果将发送给本次模型')`),true);
   if(i===0){await captureLayout(window,'agent-shell-approval');await js("document.querySelectorAll('.approval details').forEach(e=>e.open=true)");await captureLayout(window,'agent-shell-expanded');}
   const approvedDigest=await js<string>("document.querySelector('.approval code').textContent");
   const pending=await host.request({type:'thread',threadId}) as DesktopThread;assert.equal(pending.operations[i]?.parametersDigest,approvedDigest);
   await click('.approval .primary');
   await wait(async()=>{const s=await host.request({type:'thread',threadId}) as DesktopThread;return Boolean(s.operations[i]?.shell?.outcome);},'settled-'+i);
   // The next approval may render immediately; only the approved operation must disappear.
   await wait(()=>js<boolean>(`![...document.querySelectorAll('.approval code')].some(e=>e.textContent===${JSON.stringify(approvedDigest)})`),'approved-operation-removed');
  }
  await wait(()=>js<boolean>("!!document.querySelector('[data-state=completed]')"),'complete');
  const result=join(directory,'synthetic-shell.md');assert.match(readFileSync(result,'utf8'),/SYNTHETIC shell result/);const time=statSync(result).mtimeMs;
  const before=await host.request({type:'thread',threadId}) as DesktopThread;assert.deepEqual(before.operations.map(o=>o.state),['failed','succeeded']);assert.equal(before.artifacts.length,0);
  const expectedText=before.presentations[0]!.value.messages.filter(m=>m.role==='assistant'||m.role==='tool').map(m=>m.text);
  const grouped=()=>js<boolean>("document.querySelectorAll('.run-operations .tool-card').length===2 && document.querySelectorAll('.run-operations .shell-output').length===2 && !document.querySelector('.run-conversation .tool-card')");
  await wait(grouped,'grouped-tools-after-nonzero-continuation');
  assert.equal(await js<number>("document.querySelectorAll('.shell-output[open]').length"),0);
  await js("document.querySelector('.shell-output').open=true");
  await new Promise(r=>setTimeout(r,800));
  assert.equal(await js<number>("document.querySelectorAll('.shell-output[open]').length"),1);
  assert.deepEqual(await js<string[]>("[...document.querySelectorAll('.run-conversation .message.assistant p')].map(e=>e.textContent)"),expectedText);
  await host.reconnect();const after=await host.request({type:'thread',threadId}) as DesktopThread;
  assert.equal(after.cursor,before.cursor);assert.equal(statSync(result).mtimeMs,time);assert.equal((await host.request({type:'home'}) as DesktopHome).workspaces.selectedId,home.workspaces.selectedId);assert.equal(dialogs,1);
  await new Promise<void>(resolve=>{window.webContents.once('did-finish-load',resolve);window.webContents.reload();});
  await wait(grouped,'grouped-tools-after-reconnect');
  assert.deepEqual(await js<string[]>("[...document.querySelectorAll('.run-conversation .message.assistant p')].map(e=>e.textContent)"),expectedText);
  console.log('agent-shell desktop: native directory dialog contract, selected cwd, separate approvals, nonzero continuation, real Bash, bounded result cards, 3 viewport captures and reconnect without replay passed; SYNTHETIC Provider only');
 }finally{dialog.showOpenDialog=original;rmSync(directory,{recursive:true,force:true});}
}
