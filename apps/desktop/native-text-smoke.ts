// Actual Electron/preload/HostClient/Pi-native-file reads; all content and faults SYNTHETIC.
import assert from 'node:assert/strict';
import { app,clipboard,type BrowserWindow } from 'electron';
import { mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HostClient } from './host-client.ts';
import type { DesktopHome } from '../../packages/app-contracts/desktop.ts';
import type { HistoryPage } from '../../packages/app-contracts/desktop-pages.ts';
export async function runNativeTextSmoke(window:BrowserWindow,host:HostClient){
 const js=<T>(s:string):Promise<T>=>window.webContents.executeJavaScript(s,true);
 const wait=async(s:string)=>{const end=Date.now()+12000;while(!await js<boolean>(s)){if(Date.now()>end)throw Error('native_read_timeout:'+s);await new Promise(r=>setTimeout(r,40));}};
 const click=(s:string)=>js(`document.querySelector(${JSON.stringify(s)}).click()`);
 const home=await host.request({type:'home'}) as DesktopHome,thread=home.threads.find(t=>t.title==='SYNTHETIC persisted pagination')!;
 const history=await host.request({type:'history-page',threadId:thread.id}) as HistoryPage,run=history.items.find(i=>i.input==='SYNTHETIC persisted history 59')!.run.id;
 await click(`[data-thread="${thread.id}"] .thread-link`);const row=`[data-run="${run}"]`,button=row+' .read-native';await wait(`!!document.querySelector(${JSON.stringify(button)})`);
 const original=host.request.bind(host);let fail=true,reads=0,commands=0;
 host.request=async raw=>{if(raw.type==='command')commands++;if(raw.type==='native-text'){reads++;if(fail){fail=false;throw Error('SYNTHETIC read failure');}}return original(raw);};
 try{
  await click(button);await wait(`!!document.querySelector(${JSON.stringify(row+' .retry-native')})`);
  await click(row+' .retry-native');await wait(`!!document.querySelector(${JSON.stringify(row+' .native-reading section table')})`);
  assert.equal(await js<string>(`document.querySelector(${JSON.stringify(row+' .native-reading section strong')}).textContent`),'加粗内容');
  assert.ok(await js<boolean>(`document.querySelector(${JSON.stringify(row+' .native-reading section code')}).textContent.includes('<script>SYNTHETIC_CODE</script>')`));
  const {checkReadingCopy}=await import('./reading-actions-smoke.ts');await checkReadingCopy(window,row);
  for(let i=0;i<8;i++){
   const more=await js<boolean>(`!!document.querySelector(${JSON.stringify(row+' .more-native')})`);if(!more)break;
   const before=reads;await click(row+' .more-native');await wait(`!document.querySelector(${JSON.stringify(row+' .more-native')})?.disabled`);assert.equal(reads,before+1);
  }
  await wait(`document.querySelector(${JSON.stringify(row+' .native-reading')}).textContent.includes('本次可展示正文已读完')`);
  const body=await js<string>(`document.querySelector(${JSON.stringify(row+' .native-reading')}).textContent`);
  assert.ok(body.includes('SYNTHETIC_COMPLETE_BODY')&&body.includes('SYNTHETIC_EXTRA_MESSAGE_20'));assert.ok(!body.includes('SYNTHETIC_READING_SECRET'));
  assert.equal(await js<boolean>(`!!document.querySelector(${JSON.stringify(row+' .markdown-body img, '+row+' .markdown-body script, '+row+' .markdown-body a[href]')})`),false);
  assert.equal(await js<boolean>(`performance.getEntriesByType('resource').some(e=>e.name.includes('example.invalid'))`),false);
  await js(`(()=>{const m=[...document.querySelectorAll(${JSON.stringify(row+' .native-reading section .message')})].find(e=>e.textContent.includes('SYNTHETIC_COMPLETE_BODY'));m.querySelector('.markdown-body > .copy-action .copy-text').click();})()`);
  await wait(`document.querySelector(${JSON.stringify(row+' .native-reading section')}).textContent.includes('已复制')`);
  // Wait for the actual async platform write; only our synthetic content is read.
  const copyEnd=Date.now()+12000;while(!(await clipboard.readText()).includes('SYNTHETIC_COMPLETE_BODY')){if(Date.now()>copyEnd)throw Error('full_display_copy_timeout');await new Promise(r=>setTimeout(r,30));}
  const copied=await clipboard.readText();assert.ok(copied.includes('中😀'.repeat(7000)));assert.ok(!copied.includes('SYNTHETIC_READING_SECRET'));assert.ok(!copied.includes('复制可展示正文'));
  assert.equal(commands,0);await click(button);await wait(`!document.querySelector(${JSON.stringify(row+' .native-reading section')})`);
  assert.equal(await js<boolean>(`document.activeElement===document.querySelector(${JSON.stringify(button)})`),true);
 }finally{host.request=original;}
 // A successful old read deliberately arrives after an actual host replacement.
 let release:(()=>void)|undefined;host.request=async raw=>{const result=await original(raw);if(raw.type==='native-text')await new Promise<void>(r=>{release=r;});return result;};
 try{
  await click(button);const end=Date.now()+12000;while(!release){if(Date.now()>end)throw Error('native-held-read');await new Promise(r=>setTimeout(r,30));}
  await host.reconnect();await wait(`document.querySelector(${JSON.stringify(button)})?.getAttribute('aria-expanded')==='false'`);release();await new Promise(r=>setTimeout(r,100));
  await wait(`!document.querySelector('.connection-problem') && !document.querySelector('.sidebar-foot .offline')`);
  assert.equal(await js<boolean>(`!!document.querySelector(${JSON.stringify(row+' .native-reading section')})`),false);
 }finally{release?.();host.request=original;}
 await click(button);await wait(`!!document.querySelector(${JSON.stringify(row+' .native-reading section table')})`);
 if(await js<boolean>("!!document.querySelector('.inspector-close')"))await click('.inspector-close');
 const directory=join(app.getAppPath(),'../../.artifacts/safe-reading-20261004');mkdirSync(directory,{recursive:true});const size=window.getSize();
 for(const width of [1320,820]){window.setSize(width,780);await js(`(()=>{const t=document.querySelector('.timeline');t.scrollTop+=document.querySelector(${JSON.stringify(row)}).getBoundingClientRect().top-t.getBoundingClientRect().top;})();new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);assert.equal(await js<boolean>("document.querySelector('.thread-heading').getBoundingClientRect().top>=0 && document.querySelector('.shell').scrollTop===0"),true);writeFileSync(join(directory,`native-reading-${width}.png`),(await window.webContents.capturePage(undefined,{stayAwake:true})).toPNG());}
 window.setSize(size[0]!,size[1]!);await click(button);
 console.log('safe reading: actual Pi-native full body + omitted messages, Markdown/GFM/code, no HTML/images/navigation/network, read retry, host replacement and late response fencing passed; SYNTHETIC records and faults, zero model calls');
}
