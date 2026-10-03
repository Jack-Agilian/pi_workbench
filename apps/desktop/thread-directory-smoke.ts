// Explicit SYNTHETIC catalog and faults; actual Electron/IPC/product SQLite.
import assert from 'node:assert/strict';
import { app, type BrowserWindow } from 'electron';
import { mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HostClient } from './host-client.ts';
import type { DesktopHome, DesktopThread } from '../../packages/app-contracts/desktop.ts';
import type { ThreadDirectoryPage } from '../../packages/app-contracts/thread-directory.ts';
export async function runThreadDirectorySmoke(window:BrowserWindow,host:HostClient,activeThread:string) {
  const js=<T>(source:string):Promise<T>=>window.webContents.executeJavaScript(source,true);
  const wait=async(check:()=>Promise<boolean>,name:string)=>{const end=Date.now()+15000;while(!await check()){if(Date.now()>end)throw Error('directory_timeout:'+name);await new Promise(r=>setTimeout(r,35));}};
  const fill=(selector:string,text:string)=>js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const p=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const search=async(text:string)=>{await fill('#thread-search',text);await js("document.querySelector('.thread-search').requestSubmit()");};
  const settled=()=>js<boolean>("!document.querySelector('.directory-status')?.textContent.includes('正在')");
  const request=host.request.bind(host),home=await request({type:'home'}) as DesktopHome;
  const created:string[]=[];
  for(let n=0;n<75;n++)created.push((await request({type:'command',command:{type:'threads.create',requestId:'SYNTHETIC-directory-'+n,workspaceId:home.workspaces.selectedId,title:'SYNTHETIC catalog '+n+(n===0?' 中文旧记录':'')}}) as {id:string}).id);
  let commands=0,reads=0,fail=false,hold=false,release:(()=>void)|undefined;
  host.request=async raw=>{
    if(raw.type==='command')commands++;
    if(raw.type==='thread-directory'){
      reads++;
      if(fail){fail=false;throw Error('SYNTHETIC directory read failure');}
      const value=await request(raw);
      if(hold){hold=false;await new Promise<void>(resolve=>{release=resolve;});}return value;
    }
    return request(raw);
  };
  try {
    await search('SYNTHETIC retry B');
    await wait(()=>js<boolean>(`!!document.querySelector('[data-thread="${activeThread}"]')`),'active_found');
    await js(`document.querySelector('[data-thread="${activeThread}"] .thread-link').click()`);
    await wait(()=>js<boolean>("!!document.querySelector('.show-approvals') && !!document.querySelector('.stop')"),'active_approval');
    await fill('#composer','SYNTHETIC retained while filtering');
    await search('SYNTHETIC no matches');
    await wait(()=>js<boolean>("document.querySelector('.directory-status')?.textContent.includes('没有匹配') === true"),'empty_filter');
    assert.equal(await js<boolean>("document.querySelector('#composer').value === 'SYNTHETIC retained while filtering' && !!document.querySelector('.show-approvals') && !document.querySelector('.stop').disabled"),true);
    assert.equal(await js<boolean>(`!!document.querySelector('[data-search-result="false"] [data-thread="${activeThread}"]')`),true);

    const size=window.getContentSize(),out=join(app.getAppPath(),'../../.artifacts/thread-directory-20261004');mkdirSync(out,{recursive:true});
    for(const width of [1320,820]) {
      window.setContentSize(width,640);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      assert.equal(await js<boolean>("['#thread-search','#thread-workspace','.clear-thread-search','.show-approvals','.stop','.new-thread'].every(s=>{const e=document.querySelector(s),b=e?.getBoundingClientRect();return b&&b.width>0&&b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight})"),true);
      writeFileSync(join(out,`filtered-active-${width}.png`),(await window.webContents.capturePage(undefined,{stayAwake:true})).toPNG());
    }
    window.setContentSize(size[0]!,size[1]!);
    await search('中文旧记录');
    const row=`[data-thread="${created[0]}"]`;
    await wait(()=>js<boolean>(`!!document.querySelector(${JSON.stringify(row)})`),'oldest_from_full_database');
    await js(`document.querySelector(${JSON.stringify(row+' .thread-link')}).click()`);
    await wait(()=>js<boolean>("document.querySelector('h1')?.textContent.includes('中文旧记录') === true"),'old_selected');
    await js(`document.querySelector(${JSON.stringify(row+' .rename-thread')}).click()`);
    await fill(row+' .rename-form input','SYNTHETIC draft survives filter');
    await search('SYNTHETIC no matches');
    await wait(()=>js<boolean>("document.querySelector('.directory-status')?.textContent.includes('没有匹配') === true"),'rename_filtered');
    assert.equal(await js<string>(`document.querySelector(${JSON.stringify(row+' .rename-form input')}).value`),'SYNTHETIC draft survives filter');
    // Rename conflict outside results still receives current metadata, without discarding the draft.
    await request({type:'command',command:{type:'threads.rename',requestId:'SYNTHETIC-directory-conflict',threadId:created[0]!,title:'SYNTHETIC renamed externally',expectedRevision:0}});
    await js(`document.querySelector(${JSON.stringify(row+' .save-title')}).click()`);
    await wait(()=>js<boolean>(`document.querySelector(${JSON.stringify(row+' .rename-form')})?.textContent.includes('最新名称：SYNTHETIC renamed externally') === true`),'pinned_conflict');
    await js(`document.querySelector(${JSON.stringify(row+' .cancel-title')}).click()`);
    assert.equal(await js<boolean>(`!document.querySelector(${JSON.stringify(row+' .rename-form')})`),true);
    const afterRenameCommands=commands;

    fail=true;await search('SYNTHETIC catalog');
    await wait(()=>js<boolean>("!!document.querySelector('.retry-directory')"),'directory_failure');
    const failedReads=reads;await new Promise(r=>setTimeout(r,650));assert.equal(reads,failedReads);
    await js("document.querySelector('.retry-directory').click()");
    await wait(()=>js<boolean>("document.querySelectorAll('[data-search-result=true]').length===16 && !document.querySelector('.retry-directory')"),'explicit_retry');
    for(let page=0;page<10&&await js<boolean>("!!document.querySelector('.load-threads')");page++) {
      await wait(()=>js<boolean>("!document.querySelector('.load-threads').disabled"),'page_ready');
      await js("document.querySelector('.load-threads').click()");await wait(settled,'page_read');
    }
    const ids=await js<string[]>("[...document.querySelectorAll('[data-search-result=true] [data-thread]')].map(e=>e.dataset.thread)");
    assert.equal(ids.length,74);assert.equal(new Set(ids).size,74);assert.equal(await js<boolean>("!!document.querySelector('.load-threads')"),false);

    hold=true;await search('SYNTHETIC renamed externally');await wait(async()=>!!release,'held_result');
    await search('SYNTHETIC catalog 74');
    await wait(()=>js<boolean>(`!!document.querySelector('[data-search-result=true] [data-thread="${created[74]}"]')`),'new_filter');
    release!();await new Promise(r=>setTimeout(r,150));
    assert.deepEqual(await js<string[]>("[...document.querySelectorAll('[data-search-result=true] [data-thread]')].map(e=>e.dataset.thread)"),[created[74]]);
    assert.equal(commands,afterRenameCommands);

    // Real host replacement changes queryScope; old directory replies cannot join new pages.
    const runsBefore=(await request({type:'thread',threadId:activeThread}) as DesktopThread).runs.map(r=>r.id);
    hold=true;release=undefined;await search('SYNTHETIC catalog 73');await wait(async()=>!!release,'held_before_reconnect');
    const oldPid=host.processId;await host.reconnect();assert.notEqual(host.processId,oldPid);
    await wait(()=>js<boolean>(`!!document.querySelector('[data-search-result=true] [data-thread="${created[73]}"]')`),'new_connection_page');
    release!();await new Promise(r=>setTimeout(r,100));
    assert.deepEqual(await js<string[]>("[...document.querySelectorAll('[data-search-result=true] [data-thread]')].map(e=>e.dataset.thread)"),[created[73]]);
    assert.equal(commands,afterRenameCommands);
    assert.deepEqual((await request({type:'thread',threadId:activeThread}) as DesktopThread).runs.map(r=>r.id),runsBefore);
    // New Thread stays selected even outside a non-matching filter.
    await fill('#title','SYNTHETIC fresh outside filter');await js("document.querySelector('.new-thread').click()");
    await wait(()=>js<boolean>("document.querySelector('h1')?.textContent==='SYNTHETIC fresh outside filter' && !!document.querySelector('[data-search-result=false] .thread-link.selected')"),'new_outside_filter');
    assert.equal(commands,afterRenameCommands+1);
    const bounded=await request({type:'home'}) as DesktopHome;assert.equal(bounded.threads.length,32);assert.equal(bounded.threadsHasMore,true);
    const exact=await request({type:'thread-directory',search:{query:'SYNTHETIC fresh outside filter'}}) as ThreadDirectoryPage;assert.equal(exact.items.length,1);
    console.log('directory: actual 75-row catalog, whole-database search, no-result active approvals/draft, pinned rename conflict, explicit retry, all pages/no duplicates, late filter and actual host replacement passed; SYNTHETIC data and faults');
  } finally {release?.();host.request=request;}
  // Explicit new synthetic intent for the existing shutdown test; never a replay.
  await request({type:'command',command:{type:'runs.start',requestId:'SYNTHETIC-directory-shutdown-run',threadId:activeThread,input:'SYNTHETIC pending task for final shutdown'}});
}
