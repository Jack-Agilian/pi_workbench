// Actual Electron + host + Pi Bash. The Provider/dialog answers are explicitly synthetic.
import assert from 'node:assert/strict';
import { app, dialog, type BrowserWindow } from 'electron';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
   assert.equal(await js<boolean>("document.querySelector('.approval').closest('[data-operation]').dataset.operation===document.querySelector('.approval').dataset.approval && !document.querySelector('.inspector .approval')"),true);
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
  // A fresh synthetic conversation exercises the same product route with host policy approval.
  await click('.new-thread');await wait(()=>js<boolean>("!!document.querySelector('.permission-picker') && !document.querySelector('#composer').disabled && !document.querySelector('[data-state=completed]')"),'auto-thread');
  const request=host.request.bind(host);let losePolicyAck=true;const policyAttempts:string[]=[];
  host.request=async raw=>{
   const result=await request(raw);
   if(raw.type==='command'&&raw.command.type==='threads.permissions'){
    policyAttempts.push(raw.command.requestId);
    if(losePolicyAck){losePolicyAck=false;throw new Error('SYNTHETIC_policy_ack_lost');}
   }
   return result;
  };
  try{
   await js("document.querySelector('.permission-picker').open=true");await click('[data-permission=auto]');
   await wait(()=>js<boolean>("!!document.querySelector('.retry-permission')"),'policy-ack-lost');
   assert.equal(await js<boolean>("document.querySelector('button[type=submit]').disabled"),true);
   await click('.retry-permission');await wait(()=>js<boolean>("!document.querySelector('.retry-permission') && !document.querySelector('.permission-picker summary').textContent.includes('保存中')"),'policy-ack-retry');
   assert.equal(policyAttempts.length,2);assert.equal(policyAttempts[0],policyAttempts[1]);
  }finally{host.request=request;}
  await wait(()=>js<boolean>("document.querySelector('.permission-picker summary').textContent==='权限：自动审批'"),'auto-policy-persisted');
  await js("document.querySelector('.permission-picker').open=false;(()=>{const t=document.querySelector('#composer');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'SYNTHETIC automatic Bash task');t.dispatchEvent(new Event('input',{bubbles:true}));})()");
  let changeBeforeStart=true;
  host.request=async raw=>{
   if(raw.type==='command'&&raw.command.type==='runs.start'&&changeBeforeStart){
    changeBeforeStart=false;
    await request({type:'command',command:{type:'threads.permissions',requestId:'SYNTHETIC-stale-mode',threadId:raw.command.threadId,mode:'manual',expectedRevision:1}});
   }
   return request(raw);
  };
  try{
   await wait(()=>js<boolean>("!document.querySelector('button[type=submit]').disabled"),'stale-send');await js("document.querySelector('form.composer').requestSubmit()");
   await wait(()=>js<boolean>("document.querySelector('.notice.error')?.textContent.includes('权限模式已变化') && document.querySelector('.permission-picker summary')?.textContent==='权限：人工审批'"),'stale-policy-rejected');
   assert.equal(await js<string>("document.querySelector('#composer').value"),'SYNTHETIC automatic Bash task');
   const current=(await request({type:'home'}) as DesktopHome).threads[0]!;
   assert.equal((await request({type:'thread',threadId:current.id}) as DesktopThread).runs.length,0);
  }finally{host.request=request;}
  await js("document.querySelector('.permission-picker').open=true");await click('[data-permission=auto]');
  await wait(()=>js<boolean>("document.querySelector('.permission-picker summary').textContent==='权限：自动审批'"),'auto-policy-reselected');
  const captures=join(app.getAppPath(),'../../.artifacts/permissions-20261003');mkdirSync(captures,{recursive:true});
  const originalSize=window.getContentSize();
  for(const [width,height] of [[1320,860],[820,640]]){
   window.setContentSize(width!,height!);await new Promise(r=>setTimeout(r,180));
   assert.equal(await js<boolean>("(()=>{const e=document.querySelector('[data-permission=auto]'),b=e.getBoundingClientRect();return b.x>=0&&b.y>=0&&b.right<=innerWidth&&b.bottom<=innerHeight&&e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))&&document.body.scrollWidth<=innerWidth;})()"),true);
   writeFileSync(join(captures,`permission-picker-${width}.png`),(await window.webContents.capturePage(undefined,{stayAwake:true})).toPNG());
  }
  window.setContentSize(originalSize[0]!,originalSize[1]!);await js("document.querySelector('.permission-picker').open=false");
  await wait(()=>js<boolean>("!document.querySelector('button[type=submit]').disabled"),'auto-send');await js("document.querySelector('form.composer').requestSubmit()");
  await wait(()=>js<boolean>("!!document.querySelector('[data-state=completed]') && document.querySelectorAll('.approval-source').length===2"),'automatic-tool-completion');
  const automaticHome=await host.request({type:'home'}) as DesktopHome;
  const automatic=await host.request({type:'thread',threadId:automaticHome.threads[0]!.id}) as DesktopThread;
  assert.equal(automatic.runs[0]!.permissionMode,'auto');assert.equal(automatic.operations.length,2);
  assert.ok(automatic.operations.every(op=>op.approvalSource==='workspace-tools-v1'));
  assert.equal(await js<number>("document.querySelectorAll('.approval .primary').length"),0);
  assert.equal(await js<boolean>("!document.querySelector('.context-popover').textContent.includes('须逐项批准') && document.querySelector('.context-popover').textContent.includes('宿主授权')"),true);
  await host.reconnect();
  await new Promise<void>(resolve=>{window.webContents.once('did-finish-load',resolve);window.webContents.reload();});
  await wait(()=>js<boolean>("document.querySelector('.permission-picker summary')?.textContent==='权限：自动审批' && document.querySelectorAll('.approval-source').length===2"),'automatic-policy-restored');
  await js("document.querySelector('.permission-picker').open=true");
  const fullCaptures=join(app.getAppPath(),'../../.artifacts/full-product-20261004');mkdirSync(fullCaptures,{recursive:true});
  for(const [width,height] of [[1320,860],[820,640]]){
    window.setContentSize(width!,height!);await new Promise(r=>setTimeout(r,180));
    assert.equal(await js<boolean>("(()=>{const e=document.querySelector('[data-permission=full]'),b=e.getBoundingClientRect();return b.x>=0&&b.y>=0&&b.right<=innerWidth&&b.bottom<=innerHeight&&e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));})()"),true);
    writeFileSync(join(fullCaptures,`full-permission-${width}.png`),(await window.webContents.capturePage(undefined,{stayAwake:true})).toPNG());
  }
  window.setContentSize(originalSize[0]!,originalSize[1]!);await click('[data-permission=full]');
  await wait(()=>js<boolean>("document.querySelector('.permission-picker summary').textContent==='权限：完全访问'"),'full-mode-confirmed');
  assert.match(await js<string>("document.querySelector('.context-popover').textContent"),/完全访问可操作目录外文件并让 Bash 联网/);
  await js("document.querySelector('.permission-picker').open=false;const t=document.querySelector('#composer');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'SYNTHETIC full access task');t.dispatchEvent(new Event('input',{bubbles:true}));");
  await wait(()=>js<boolean>("!document.querySelector('button[type=submit]').disabled"),'full-send');await js("document.querySelector('form.composer').requestSubmit()");
  await wait(async()=>{const t=await host.request({type:'thread',threadId:automatic.thread.id}) as DesktopThread;return t.runs.some(r=>r.permissionMode==='full'&&r.state==='completed');},'full-task-complete');
  const full=await host.request({type:'thread',threadId:automatic.thread.id}) as DesktopThread;
  const fullRun=full.runs.find(r=>r.permissionMode==='full')!;
  assert.ok(full.operations.filter(o=>o.runId===fullRun.id).length>0);
  assert.ok(full.operations.filter(o=>o.runId===fullRun.id).every(o=>o.approvalSource==='full-tools-v1'&&o.shell?.intent.profile==='full-bash-v1'));
  assert.equal(await js<number>("document.querySelectorAll('.approval .primary').length"),0);
  await host.reconnect();await new Promise<void>(resolve=>{window.webContents.once('did-finish-load',resolve);window.webContents.reload();});
  await wait(()=>js<boolean>("document.querySelector('.permission-picker summary')?.textContent==='权限：完全访问' && [...document.querySelectorAll('.approval-source')].some(e=>e.textContent.includes('完全访问'))"),'full-mode-restored');
  console.log('agent-shell desktop: native directory dialog contract, selected cwd, separate approvals, nonzero continuation, real Bash, bounded result cards, 3 viewport captures and reconnect without replay passed; SYNTHETIC Provider only');
 }finally{dialog.showOpenDialog=original;rmSync(directory,{recursive:true,force:true});}
}
