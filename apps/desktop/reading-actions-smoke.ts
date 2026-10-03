// Explicit SYNTHETIC Electron driver. Never reads pre-existing user clipboard data.
import assert from 'node:assert/strict';
import { clipboard, type BrowserWindow } from 'electron';
import type { HostClient } from './host-client.ts';
import type { ArtifactPage } from '../../packages/app-contracts/desktop-pages.ts';
const harness=(window:BrowserWindow)=>{
 const js=<T>(s:string):Promise<T>=>window.webContents.executeJavaScript(s,true);
 const wait=async(s:string)=>{const end=Date.now()+12000;while(!await js<boolean>(s)){if(Date.now()>end)throw Error('reading_action_timeout:'+s);await new Promise(r=>setTimeout(r,40));}};
 const click=(s:string)=>js(`document.querySelector(${JSON.stringify(s)}).click()`);
 return {js,wait,click};
};
export async function checkReadingCopy(window:BrowserWindow,row:string){
 const {js,wait,click}=harness(window),section=row+' .native-reading section';
 // Write our own canary before any clipboard read. Do not save/log previous clipboard.
 await js("window.workbench.copyText('SYNTHETIC_CLIPBOARD_OWNED')");
 assert.equal(await clipboard.readText(),'SYNTHETIC_CLIPBOARD_OWNED');
 assert.equal(await js("typeof window.workbench.readClipboard + ':' + typeof window.workbench.send"),'undefined:undefined');
 for(const value of ["null","{text:'unsafe'}","'x'.repeat(8*1024*1024+1)"]){assert.equal(await js<boolean>(`window.workbench.copyText(${value}).then(()=>false,()=>true)`),true);}
 const code=section+' .markdown-code .copy-text';await click(code);
 await wait(`document.querySelector(${JSON.stringify(section+' .markdown-code .copy-feedback')}).textContent==='已复制'`);
 assert.equal(await clipboard.readText(),"const value = '<script>SYNTHETIC_CODE</script>';\n");
 const partial=await js<string>(`[...document.querySelectorAll(${JSON.stringify(section+' .message')})].find(e=>e.textContent.includes('后续内容待加载'))?.querySelector('.markdown-body > .copy-action .copy-text')?.textContent`);
 assert.equal(partial,'复制已加载部分');
 const write=clipboard.writeText.bind(clipboard);let calls=0;
 clipboard.writeText=async()=>{calls++;throw Error('SYNTHETIC_CLIPBOARD_FAILURE');};
 try{await click(code);await wait(`document.querySelector(${JSON.stringify(section+' .markdown-code .copy-feedback')}).textContent.includes('复制失败')`);await new Promise(r=>setTimeout(r,250));assert.equal(calls,1);}
 finally{clipboard.writeText=write;}
 await click(code);await wait(`document.querySelector(${JSON.stringify(section+' .markdown-code .copy-feedback')}).textContent==='已复制'`);
 // Actual IPC backpressure while the public platform method is held synthetically.
 let release:(()=>void)|undefined;clipboard.writeText=async()=>{await new Promise<void>(r=>{release=r;});};
 try{
  await js("void (globalThis.syntheticCopyPending=window.workbench.copyText('SYNTHETIC_HELD').then(()=>true,()=>false))");
  const end=Date.now()+12000;while(!release){if(Date.now()>end)throw Error('clipboard_not_held');await new Promise(r=>setTimeout(r,20));}
  assert.equal(await js<boolean>("window.workbench.copyText('SYNTHETIC_CONCURRENT').then(()=>false,()=>true)"),true);
  release();assert.equal(await js<boolean>('globalThis.syntheticCopyPending'),true);
 }finally{ clipboard.writeText=write;release?.(); }
}
export async function checkArtifactVersions(window:BrowserWindow,host:HostClient,threadId:string){
 const {js,wait,click}=harness(window);
 const page=await host.request({type:'artifact-page',threadId,page:{limit:32}}) as ArtifactPage;
 const versions=page.items.filter(item=>item.path==='pagination-versions.md').sort((a,b)=>b.version-a.version);assert.equal(versions.length,3);
 await click(`[data-artifact="${versions[0]!.id}"]`);await wait("!!document.querySelector('.preview pre')");
 assert.equal(await js<string>("document.querySelector('.selected-artifact .file-icon').textContent"),'MD');
 assert.equal(await js<number>("document.querySelectorAll('.artifact-version-picker option').length"),3);
 assert.equal(await js<string>("document.querySelector('.artifact-evidence code').textContent"),versions[0]!.digest);
 await click('.preview .copy-text');await wait("document.querySelector('.preview .copy-feedback').textContent==='已复制'");
 assert.equal(await clipboard.readText(),'# SYNTHETIC file 2');
 const select=async(id:string)=>{await js(`(()=>{const s=document.querySelector('.artifact-version-picker select');s.value=${JSON.stringify(id)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);};
 await select(versions[2]!.id);await wait("document.querySelector('.preview')?.textContent.includes('历史记录保留，不展示不匹配的内容')");
 assert.equal(await js<boolean>("!!document.querySelector('.preview pre,.preview .copy-text')"),false);
 const original=host.request.bind(host);let fail=true,requests=0,commands=0;
 host.request=async(raw,scope)=>{if(raw.type==='command')commands++;if(raw.type==='preview'){requests++;if(fail){fail=false;throw Error('SYNTHETIC_PREVIEW_FAILURE');}}return original(raw,scope);};
 try{
  await select(versions[0]!.id);await wait("document.querySelector('.preview')?.textContent.includes('核验请求未获确认')");
  assert.equal(await js<boolean>("!!document.querySelector('.preview .copy-text')"),false);
  await js("[...document.querySelectorAll('.preview button')].find(b=>b.textContent==='重新核验文件').click()");await wait("!!document.querySelector('.preview pre')");assert.equal(requests,2);assert.equal(commands,0);
 }finally{host.request=original;}
 await click('.preview [aria-label="关闭预览"]');assert.equal(await js<string>("document.activeElement.dataset.artifact"),versions[0]!.id);
 console.log('reading artifacts: three real registered versions, digest, current checked copy, old mismatch no content, explicit retry and focus passed; SYNTHETIC files');
}
