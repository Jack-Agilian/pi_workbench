// Actual Electron + product SQLite. Delayed/lost replies are explicitly SYNTHETIC faults.
import assert from 'node:assert/strict';
import { app, type BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HostClient } from './host-client.ts';
import type { DesktopHome, DesktopThread } from '../../packages/app-contracts/desktop.ts';
import type { Command } from '../../packages/app-contracts/index.ts';

export async function runThreadNamingSmoke(window:BrowserWindow,host:HostClient) {
  const js=<T>(code:string):Promise<T>=>window.webContents.executeJavaScript(code,true);
  const wait=async(check:()=>Promise<boolean>,label:string)=>{const end=Date.now()+12000;while(!await check()){if(Date.now()>end)throw Error('rename_timeout:'+label);await new Promise(r=>setTimeout(r,35));}};
  const click=(s:string)=>js(`document.querySelector(${JSON.stringify(s)}).click()`);
  const fill=(s:string,text:string)=>js(`(()=>{const e=document.querySelector(${JSON.stringify(s)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const request=host.request.bind(host);
  const home=await request({type:'home'}) as DesktopHome;
  const a=(await request({type:'command',command:{type:'threads.create',requestId:'SYNTHETIC-name-a',workspaceId:home.workspaces.selectedId,title:'SYNTHETIC name A'}})) as {id:string};
  const b=(await request({type:'command',command:{type:'threads.create',requestId:'SYNTHETIC-name-b',workspaceId:home.workspaces.selectedId,title:'SYNTHETIC name B'}})) as {id:string};
  const row=`[data-thread="${a.id}"]`, field=`${row} .rename-form input`;
  const snapshot=()=>request({type:'thread',threadId:a.id}) as Promise<DesktopThread>;
  await wait(()=>js<boolean>(`!!document.querySelector(${JSON.stringify(row)})`),'row');
  await click(row+' .thread-link');await click(row+' .rename-thread');
  await fill(field,'SYNTHETIC cancelled');
  await js(`document.querySelector(${JSON.stringify(field)}).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}))`);
  assert.equal((await snapshot()).thread.titleRevision,0);
  await js(`document.querySelector(${JSON.stringify(field)}).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await js<boolean>(`!document.querySelector(${JSON.stringify(field)})`),true);
  assert.equal(await js<string>('document.activeElement.className'),'rename-thread');

  const title='周计划 <img src=x onerror=alert(1)>';
  await click(row+' .rename-thread');await fill(field,title);
  await new Promise(r=>setTimeout(r,500));assert.equal(await js<string>(`document.querySelector(${JSON.stringify(field)}).value`),title);
  const captures=join(app.getAppPath(),'../../.artifacts/thread-naming-20261004');mkdirSync(captures,{recursive:true});
  const size=window.getSize();
  for(const width of [1320,820]){
    window.setSize(width,780);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    assert.equal(await js<boolean>(`(()=>{const f=document.querySelector(${JSON.stringify(row+' .rename-form')});f.scrollIntoView({block:'nearest'});return [...f.querySelectorAll('input,button')].every(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight;});})()`),true);
    writeFileSync(join(captures,`rename-${width}.png`),(await window.webContents.capturePage(undefined,{stayAwake:true})).toPNG());
  }
  window.setSize(size[0]!,size[1]!);
  const attempts:Command[]=[];let lose=true;
  host.request=async raw=>{
    if(raw.type==='command'&&raw.command.type==='threads.rename'){
      attempts.push(raw.command);const result=await request(raw);if(lose){lose=false;throw Error('SYNTHETIC lost rename reply');}return result;
    }return request(raw);
  };
  try {
    await click(row+' .save-title');
    await wait(()=>js<boolean>(`document.querySelector(${JSON.stringify(row+' .save-title')})?.textContent==='重试改名'`),'lost-reply');
    assert.equal((await snapshot()).thread.title,title);assert.equal((await snapshot()).thread.titleRevision,1);
    await click(`[data-thread="${b.id}"] .thread-link`);
    await click(row+' .save-title');
    await wait(()=>js<boolean>(`!document.querySelector(${JSON.stringify(field)})`),'same-request-retry');
    assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);assert.equal((await snapshot()).thread.titleRevision,1);
    assert.equal(await js<boolean>(`document.querySelector('[data-thread="${b.id}"] .thread-link').getAttribute('aria-current')==='page'`),true);
    assert.equal(await js<boolean>('!!document.querySelector(".thread-row img")'),false);
  } finally {host.request=request;}

  await click(row+' .rename-thread');await fill(field,'SYNTHETIC user draft');
  await request({type:'command',command:{type:'threads.rename',requestId:'SYNTHETIC-concurrent-title',threadId:a.id,title:'SYNTHETIC concurrent title',expectedRevision:1}});
  await click(row+' .save-title');
  await wait(()=>js<boolean>(`document.querySelector(${JSON.stringify(row+' .rename-form')})?.textContent.includes('名称已被其他操作修改')`),'revision-conflict');
  assert.equal(await js<string>(`document.querySelector(${JSON.stringify(field)}).value`),'SYNTHETIC user draft');
  await wait(()=>js<boolean>(`[...document.querySelectorAll(${JSON.stringify(row+' .rename-form button')})].some(b=>b.textContent==='采用最新版本，保留输入'&&!b.disabled)`),'new-revision');
  await js(`[...document.querySelectorAll(${JSON.stringify(row+' .rename-form button')})].find(b=>b.textContent==='采用最新版本，保留输入').click()`);
  await click(row+' .save-title');await wait(async()=> (await snapshot()).thread.titleRevision===3,'explicit-rebase');
  await wait(()=>js<boolean>(`!document.querySelector(${JSON.stringify(field)})`),'rebase-closed');

  await wait(()=>js<boolean>(`document.querySelector(${JSON.stringify(row+' .thread-link')})?.getAttribute('aria-label')==='SYNTHETIC user draft'`),'rebase-metadata');

  // Old callbacks from a disconnected host must not close a newer edit. The retry
  // remains the exact same command even though the original commit already happened.
  await click(row+' .rename-thread');await fill(field,'SYNTHETIC durable name');
  let release:(()=>void)|undefined;let delay=true;
  host.request=async raw=>{
    const result=await request(raw);
    if(raw.type==='command'&&raw.command.type==='threads.rename'&&delay){delay=false;await new Promise<void>(r=>{release=r;});}
    return result;
  };
  try {
    await click(row+' .save-title');await wait(async()=>!!release,'held-reply');
    await host.reconnect();
    await wait(()=>js<boolean>(`document.querySelector(${JSON.stringify(row+' .save-title')})?.textContent==='重试改名'`),'new-host-retry');
    release!();await new Promise(r=>setTimeout(r,80));
    assert.equal(await js<string>(`document.querySelector(${JSON.stringify(row+' .save-title')}).textContent`),'重试改名');
    await click(row+' .save-title');await wait(()=>js<boolean>(`!document.querySelector(${JSON.stringify(field)})`),'new-host-confirmed');
  } finally {release?.();host.request=request;}
  const state=await snapshot();assert.equal(state.thread.title,'SYNTHETIC durable name');assert.equal(state.thread.titleRevision,4);assert.equal(state.runs.length,0);assert.equal(state.operations.length,0);
  await new Promise<void>(resolve=>{window.webContents.once('did-finish-load',resolve);window.webContents.reload();});
  await wait(()=>js<boolean>(`document.querySelector(${JSON.stringify(row+' .thread-link')})?.getAttribute('aria-label')==='SYNTHETIC durable name'`),'reload-title');
  console.log('thread naming: actual SQLite rename, IME/Escape, draft polling, same-request retry, conflict/rebase, stale host callback, reconnect/reload and zero Runs passed; SYNTHETIC faults only');
}
