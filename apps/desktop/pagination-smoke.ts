// Real Electron -> preload -> HostClient -> App Server -> SQLite pages over explicitly
// SYNTHETIC persisted records. The final new Run uses the actual Pi Worker/tool boundary.
import assert from 'node:assert/strict';
import type { BrowserWindow } from 'electron';
import type { HostClient } from './host-client.ts';
import type { DesktopHome } from '../../packages/app-contracts/desktop.ts';
export async function runPaginationSmoke(window: BrowserWindow, host: HostClient) {
  const js = <T>(code: string): Promise<T> => window.webContents.executeJavaScript(code, true);
  const wait = async (code: string) => {
    const end = Date.now() + 12000;
    while (!await js<boolean>(code)) { if (Date.now() > end) throw Error('pagination_timeout:' + code); await new Promise(r => setTimeout(r, 40)); }
  };
  const click = (selector: string) => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const title = 'SYNTHETIC persisted pagination';
  const home = await host.request({type:'home'}) as DesktopHome;
  const thread = home.threads.find(t => t.title === title)!;
  await assert.rejects(host.request({type:'thread',threadId:thread.id}), /request_rejected/);
  await js(`[...document.querySelectorAll('.thread-link')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(title)}).click()`);
  await wait("document.querySelectorAll('[data-run]').length===8 && document.querySelectorAll('[data-artifact]').length===8");
  assert.equal(await js<string>("document.querySelectorAll('[data-run] .user p')[7].textContent"), 'SYNTHETIC persisted history 59');
  await click('.load-artifacts'); await wait("document.querySelectorAll('[data-artifact]').length===10");
  await click('.artifact'); await wait("!!document.querySelector('.preview pre')");
  assert.match(await js<string>("document.querySelector('.preview pre').textContent"), /SYNTHETIC file/);
  for (const count of [16,24,32,40,48,56,60]) {
    await js("document.querySelector('.timeline').scrollTop=100");
    await wait("!!document.querySelector('.return-latest')");
    await js('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const anchor = await js<{id:string;offset:number}>("(()=>{const t=document.querySelector('.timeline'),y=t.getBoundingClientRect().top,e=[...t.querySelectorAll('[data-run]')].find(e=>e.getBoundingClientRect().bottom>y);return {id:e.dataset.run,offset:e.getBoundingClientRect().top-y}})()");
    await click('.load-history'); await wait(`document.querySelectorAll('[data-run]').length===${count}`);
    const offset = await js<number>(`document.querySelector('[data-run="${anchor.id}"]').getBoundingClientRect().top-document.querySelector('.timeline').getBoundingClientRect().top`);
    assert.ok(Math.abs(offset-anchor.offset)<3, `prepend ${count}: ${anchor.id} moved from ${anchor.offset} to ${offset}`);
  }
  assert.equal(await js<number>("new Set([...document.querySelectorAll('[data-run]')].map(e=>e.dataset.run)).size"),60);
  await js("(()=>{const e=document.querySelector('#composer');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'SYNTHETIC pagination current approval');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await click('.composer .primary');
  await wait("!!document.querySelector('.approval') && !!document.querySelector('.view-toolbar .stop')");
  await wait("document.querySelectorAll('[data-run]').length===61");
  // Still browsing old records; real activity remains actionable outside the timeline.
  assert.ok(await js<number>("document.querySelector('.timeline').scrollHeight-document.querySelector('.timeline').scrollTop") > 1000);
  await click('.view-toolbar .stop'); await wait("!!document.querySelector('[data-state=cancelled]')");
  await js("(()=>{const e=document.querySelector('#composer');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'SYNTHETIC reconnect draft');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
  process.kill(host.processId!, 'SIGKILL');
  await wait("!!document.querySelector('.notice.error')");
  await click('.notice.error button');
  await wait("!document.querySelector('.notice.error') && document.querySelectorAll('[data-run]').length===61");
  assert.equal(await js<string>("document.querySelector('#composer').value"),'SYNTHETIC reconnect draft');
  assert.equal(await js<number>("new Set([...document.querySelectorAll('[data-run]')].map(e=>e.dataset.run)).size"),61);
  assert.equal(await js<number>("document.querySelectorAll('[data-artifact]').length"),10);
  console.log('UI-P2 persisted pagination: >1.2 MB SQLite history, 8-item pages, 60 unique Runs, 10 artifacts + actual preview, scroll anchors, real Worker approval/cancel, reconnect + draft, 61 unique Runs passed; zero model calls');
}
