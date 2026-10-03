// Actual Electron geometry/keyboard on explicit SYNTHETIC UI fixture; no execution commands.
import assert from 'node:assert/strict';
import { app,type BrowserWindow } from 'electron';
import { mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
export async function runExperienceSmoke(window:BrowserWindow){
 const js=<T>(s:string):Promise<T>=>window.webContents.executeJavaScript(s,true);
 const frame=()=>js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
 const click=(selector:string)=>js(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const key=async(keyCode:string,modifiers:('shift')[]=[])=>{window.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});window.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await frame();};
 const size=window.getSize(),zoom=window.webContents.getZoomFactor();
 const directory=join(app.getAppPath(),'../../.artifacts/experience-review-20261004');mkdirSync(directory,{recursive:true});
 const metrics:unknown[]=[];
 try{
  // Existing caller owns the inspector choice; temporarily close the overlay for reading.
  const inspectorOpen=await js<boolean>("!document.querySelector('.inspector').hidden");
  if(inspectorOpen)await click('.inspector-close');
  for(const [width,height,factor] of [[1320,900,1],[820,640,1],[1320,900,2],[820,640,2]] as const){
   window.setSize(width,height);window.webContents.setZoomFactor(factor);await frame();
   const value=await js<{viewport:number[];timeline:{h:number};composer:{visible:boolean};stop:{visible:boolean};approval:{visible:boolean};submit:{visible:boolean};bodyWidth:number}>(`(()=>{const box=s=>{const e=document.querySelector(s),r=e?.getBoundingClientRect();return r?{x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,right:r.right,visible:r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1}:null};return {viewport:[innerWidth,innerHeight],timeline:box('.timeline'),sidebar:box('.sidebar'),nav:box('.sidebar nav'),composer:box('.composer'),stop:box('.view-toolbar .stop'),approval:box('.show-approvals'),submit:box('.composer button[type=submit]'),bodyWidth:document.body.scrollWidth}})()`);
   metrics.push({width,height,factor,value});
   assert.ok(value.timeline.h>=80,`reading viewport ${width}/${factor}: ${value.timeline.h}`);
   assert.ok(value.composer.visible&&value.stop.visible&&value.approval.visible&&value.submit.visible,`controls within ${width}/${factor}`);
   assert.ok(value.bodyWidth<=value.viewport[0]!+1,'no page horizontal overflow');
   writeFileSync(join(directory,`reading-${width}-${factor}.png`),(await window.webContents.capturePage(undefined,{stayAwake:true})).toPNG());
   if(factor===2){
    assert.equal(await js<boolean>("document.querySelector('.sidebar').hidden"),true);
    await click('.sidebar-toggle');await frame();
    assert.equal(await js<boolean>("document.querySelector('main').inert && document.activeElement.matches('.sidebar-close') && document.querySelector('.sidebar').getAttribute('aria-modal')==='true'"),true);
    // Native Tab wraps; native Escape closes and returns focus without clearing the draft.
    await key('Tab',['shift']);assert.equal(await js<boolean>("document.querySelector('.sidebar').contains(document.activeElement) && !document.activeElement.matches('.sidebar-close')"),true);
    await key('Tab');assert.equal(await js<boolean>("document.activeElement.matches('.sidebar-close')"),true);
    await js("document.querySelector('#thread-search').focus()");await frame();
    assert.equal(await js<boolean>("(()=>{const b=document.querySelector('#thread-search').getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight})()"),true);
    assert.ok(await js<number>("document.querySelector('.sidebar nav').clientHeight")>=100);
    writeFileSync(join(directory,`navigation-${width}-${factor}.png`),(await window.webContents.capturePage(undefined,{stayAwake:true})).toPNG());
    // Search handles its own Escape; close from the explicit close control.
    await js("document.querySelector('.sidebar-close').focus()");await key('Escape');
    assert.equal(await js<boolean>("document.querySelector('.sidebar').hidden && !document.querySelector('main').inert && document.activeElement.matches('.sidebar-toggle')"),true);
   }
   await click('.show-approvals');await frame();
   // At small heights the card scrolls naturally: target and actions remain keyboard reachable.
   await js("document.querySelector('.approval-actions .primary').focus()");await frame();
   assert.equal(await js<boolean>("(()=>{const b=document.activeElement.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight&&b.right<=innerWidth})()"),true);
   await click('.inspector-toggle');await frame();
   assert.ok(await js<number>("document.querySelector('.inspector').getBoundingClientRect().width")>=250);
   await js("document.querySelector('.inspector-close').focus()");await key('Escape');
   assert.equal(await js<boolean>("document.querySelector('.inspector').hidden && document.activeElement.matches('.inspector-toggle')"),true);
  }
  window.webContents.setZoomFactor(1);window.setSize(1320,900);await frame();
  const contrasts=await js<{selector:string;ratio:number}[]>(`(()=>{const rgb=s=>s.match(/[\\d.]+/g)?.map(Number)??[];const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);return ['.thread-identity>span','.thread-identity small','.thread-short-id','.state','.show-approvals','.view-toolbar .stop','.approval-label','.target','.approval-risk','.copy-text'].map(selector=>{const e=document.querySelector(selector);if(!e)return null;let p=e,bg=[255,255,255];while(p){const c=rgb(getComputedStyle(p).backgroundColor);if(c.length===3||c[3]===1){bg=c;break;}p=p.parentElement;}const fg=rgb(getComputedStyle(e).color),a=lum(fg),b=lum(bg);return {selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}}).filter(Boolean)})()`);
  for(const c of contrasts)assert.ok(c.ratio>=4.5,`text contrast ${c.selector}: ${c.ratio}`);
  // Chromium AX structure is evidence of names/roles, not a claim of VoiceOver speech testing.
  window.webContents.debugger.attach('1.3');
  try{
   const tree=await window.webContents.debugger.sendCommand('Accessibility.getFullAXTree') as {nodes:{ignored:boolean;role?:{value:string};name?:{value:string}}[]};
   assert.ok(tree.nodes.some(n=>!n.ignored&&n.role?.value==='button'&&n.name?.value?.includes('停止执行')));
   assert.ok(tree.nodes.some(n=>!n.ignored&&n.role?.value==='textbox'&&n.name?.value==='你的消息'));
   writeFileSync(join(directory,'accessibility-summary.json'),JSON.stringify({activeNodes:tree.nodes.filter(n=>!n.ignored).length,stopNamed:true,composerNamed:true,voiceOver:false,contrasts},null,2));
  }finally{window.webContents.debugger.detach();}
  writeFileSync(join(directory,'geometry.json'),JSON.stringify(metrics,null,2));
  if(inspectorOpen)await click('.inspector-toggle');
  console.log('experience: actual 100%/200% at wide/minimum window, readable viewport, reachable controls, navigation drawer/native Tab/Escape, approval action focus, inspector close, sampled text contrast and Chromium AX names passed; no VoiceOver claim');
 }finally{window.webContents.setZoomFactor(zoom);window.setSize(size[0]!,size[1]!);await frame();}
}
