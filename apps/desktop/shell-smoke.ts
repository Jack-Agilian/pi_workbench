// Trusted SYNTHETIC driver, never exposed to Renderer. Actual UI -> host -> Pi tool -> Bash.
import assert from 'node:assert/strict';
import type { BrowserWindow } from 'electron';
import type { HostClient } from './host-client.ts';
import type { DesktopHome, DesktopThread } from '../../packages/app-contracts/desktop.ts';
export async function runShellSmoke(window: BrowserWindow, host: HostClient) {
  const js = <T>(code: string): Promise<T> => window.webContents.executeJavaScript(code,true);
  const wait=async(predicate:()=>Promise<boolean>,label:string)=>{const end=Date.now()+20000;while(!await predicate()){if(Date.now()>end)throw new Error('shell_ui_timeout:'+label);await new Promise(r=>setTimeout(r,50));}};
  const click=(text:string)=>js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)throw Error('button unavailable');b.click()})()`);
  await wait(()=>js<boolean>("!!document.querySelector('.new-thread')"),'mounted');
  for(const mode of ['allow','deny','cancel']) {
    await click('＋ 新建会话');
    await wait(()=>js<boolean>("!document.querySelector('button.new-thread').disabled && !!document.querySelector('.thread-link.selected')"),'thread');
    await click(mode==='cancel'?'填入可停止命令演示':'填入只读命令演示');
    await wait(()=>js<boolean>("!document.querySelector('.composer button[type=submit]').disabled"),'composer');
    await js("document.querySelector('form.composer').requestSubmit()");
    await wait(()=>js<boolean>("!!document.querySelector('[aria-label=命令执行审批]')"),'approval');
    assert.equal(await js<boolean>("document.querySelector('.approval').textContent.includes('restricted-bash-v1')"),true);
    await click(mode==='deny'?'拒绝':'仅本次允许');
    if(mode==='cancel') {await wait(()=>js<boolean>("document.querySelector('.tool-status')?.textContent==='命令执行中'"),'executing');await click('停止');}
    const expected=mode==='allow'?'completed':mode==='deny'?'failed':'cancelled';
    await wait(()=>js<boolean>(`!!document.querySelector('[data-state=${expected}]')`),'terminal');
    const home=await host.request({type:'home'}) as DesktopHome;const threadId=home.threads[0]!.id;
    const snap=await host.request({type:'thread',threadId}) as DesktopThread;assert.equal(snap.runs.length,1);assert.equal(snap.operations[0]!.tool,'bash');assert.equal(snap.artifacts.length,0);
    if(mode==='allow') {assert.match(snap.operations[0]!.shell!.outcome!.stdout,/中文 😀/);assert.equal(await js<boolean>("document.querySelector('.shell-output').textContent.includes('SYNTHETIC stderr')"),true);}
    console.log('desktop shell '+mode+': passed');
  }
}
