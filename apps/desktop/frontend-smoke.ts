// Renderer interaction regression. Long history and preview responses below are explicitly
// SYNTHETIC display fixtures layered over the existing isolated HostClient smoke instance.
// No fixture is persisted or presented as model output / runtime recovery evidence.
import assert from 'node:assert/strict';
import { app, type BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DesktopHome, DesktopThread, Preview } from '../../packages/app-contracts/desktop.ts';
import type { HostClient } from './host-client.ts';
import { captureLayout } from './layout-capture.ts';

export async function runFrontendSmoke(window: BrowserWindow, host: HostClient) {
  const js = <T>(code: string): Promise<T> => window.webContents.executeJavaScript(code, true);
  const wait = async (check: () => Promise<boolean>, label: string) => {
    const end = Date.now() + 10000;
    while (!await check()) { if (Date.now() > end) throw Error('frontend_timeout:' + label); await new Promise(r => setTimeout(r, 35)); }
  };
  const click = (selector: string) => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const switchTo = (name: string) => js(`[...document.querySelectorAll('.thread-link')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(name)}).click()`);
  const request = host.request.bind(host);
  const home = await request({type: 'home'}) as DesktopHome;
  const chosen = home.threads.find(t => t.title === 'SYNTHETIC allow')!;
  const other = home.threads.find(t => t.id !== chosen.id)!;
  const original = await request({type: 'thread', threadId: chosen.id}) as DesktopThread;
  const fixture = structuredClone(original);
  const originalRun = original.runs[0]!;
  fixture.runs = Array.from({length: 36}, (_, i) => ({...originalRun, id: `SYNTHETIC-ui-run-${i}`, state: 'completed'}));
  fixture.inputs = fixture.runs.map((r, i) => ({id: r.id, text: `SYNTHETIC history ${i}\n` + '可读的旧记录，不是真实模型输出。'.repeat(12)}));
  fixture.presentations = [];
  fixture.operations = [{...original.operations[0]!, state: 'pending', runId: fixture.runs.at(-1)!.id, deadline: Date.now() + 120000}];
  fixture.runs.at(-1)!.state = 'running';
  let revision = original.cursor + 100;
  let previewStatus: Preview['status'] = 'ready';
  let releasePreview: (() => void) | undefined;
  let delayPreview = false;
  let commands = 0;
  host.request = async raw => {
    if (raw.type === 'command') commands++;
    if (raw.type === 'thread' && raw.threadId === chosen.id) return {...structuredClone(fixture), cursor: revision};
    if (raw.type === 'events' && raw.threadId === chosen.id) return raw.cursor < revision ? [{seq: revision, runSeq: 1, threadId: chosen.id, runId: originalRun.id, kind: 'SYNTHETIC_UI_ONLY', entityId: chosen.id, eventType: null, sourceType: null}] : [];
    if (raw.type === 'preview' && raw.artifactId === original.artifacts[0]!.id) {
      if (delayPreview) await new Promise<void>(resolve => {releasePreview = resolve;});
      return {status: previewStatus, ...(previewStatus === 'ready' ? {text: 'SYNTHETIC <img onerror=unsafe()> UI preview'} : {})};
    }
    return request(raw);
  };
  const metrics: unknown[] = [];
  try {
    await switchTo(other.title); await switchTo(chosen.title);
    await wait(() => js<boolean>("document.querySelectorAll('[data-run]').length===36"), 'history');
    await wait(() => js<boolean>("document.querySelector('.timeline').scrollTop>1000"), 'initial_latest');
    await js("(()=>{const t=document.querySelector('#composer');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'SYNTHETIC 保留草稿');t.dispatchEvent(new Event('input',{bubbles:true}));t.focus();t.setSelectionRange(3,7)})()");
    revision++;
    await new Promise(r => setTimeout(r, 500));
    assert.deepEqual(await js("[document.activeElement.id,document.querySelector('#composer').selectionStart,document.querySelector('#composer').selectionEnd]"), ['composer', 3, 7]);
    await captureLayout(window, 'ui-p2-approval');
    const originalSize = window.getContentSize();
    for (const [width, height] of [[1320, 860], [1024, 720], [820, 640]]) {
      window.setContentSize(width!, height!);
      for (const size of ['compact', 'normal', 'wide']) {
        await js(`(()=>{const s=document.querySelector('.rail-width select');s.value=${JSON.stringify(size)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
        await new Promise(r => setTimeout(r, 100));
        const boxes = await js<{overflow: boolean; rail: number; composerVisible: boolean}>("(()=>{const c=document.querySelector('.composer').getBoundingClientRect();return {overflow:document.body.scrollWidth>innerWidth,rail:document.querySelector('.inspector').getBoundingClientRect().width,composerVisible:c.bottom<=innerHeight&&c.width>200}})()");
        assert.equal(boxes.overflow, false); assert.equal(boxes.composerVisible, true);
        metrics.push({width, height, size, ...boxes});
      }
      await click('.inspector-toggle');
      assert.equal(await js<boolean>("document.querySelector('.inspector').hidden"), true);
      assert.equal(await js<string>("document.querySelector('.approval-indicator').textContent"), '1 项待审批');
      assert.equal(await js<boolean>("(()=>{const e=document.querySelector('.view-toolbar .stop');const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))})()"), true);
      await click('.show-approvals');
      assert.equal(await js<boolean>("document.querySelector('.inspector').hidden"), false);
    }
    window.setContentSize(originalSize[0]!, originalSize[1]!);
    await js("(()=>{const s=document.querySelector('.rail-width select');s.value='normal';s.dispatchEvent(new Event('change',{bubbles:true}))})()");
    await new Promise(r => setTimeout(r, 200));
    await js("document.querySelector('.timeline').scrollTop=1500");
    await wait(() => js<boolean>("!!document.querySelector('.return-latest')"), 'browsing');
    const anchor = await js<{id: string; offset: number}>("(()=>{const t=document.querySelector('.timeline');const y=t.getBoundingClientRect().top;const e=[...t.querySelectorAll('[data-run]')].find(e=>e.getBoundingClientRect().bottom>y);return {id:e.dataset.run,offset:e.getBoundingClientRect().top-y}})()");
    fixture.inputs[0]!.text += '\n' + 'SYNTHETIC earlier record grows\n'.repeat(30); revision++;
    await new Promise(r => setTimeout(r, 600));
    const offset = await js<number>(`document.querySelector('[data-run="${anchor.id}"]').getBoundingClientRect().top-document.querySelector('.timeline').getBoundingClientRect().top`);
    assert.ok(Math.abs(offset - anchor.offset) < 3, `anchor moved ${offset - anchor.offset}`);
    await click('.inspector-toggle');
    fixture.operations[0]!.state = 'denied'; revision++;
    await wait(() => js<boolean>("document.querySelector('.approval-indicator').textContent==='暂无待审批'"), 'approval_removed');
    await js("document.querySelector('#composer').focus()");
    fixture.operations[0]!.state = 'pending'; revision++;
    await wait(() => js<boolean>("document.querySelector('.approval-indicator').textContent==='1 项待审批'"), 'approval_arrived_collapsed');
    assert.equal(await js<boolean>("document.querySelector('.inspector').hidden && document.activeElement.id==='composer'"), true);
    await click('.show-approvals');
    const saved = await js<number>("document.querySelector('.timeline').scrollTop");
    await switchTo(other.title); await wait(() => js<boolean>("document.querySelectorAll('[data-run]').length===1"), 'other');
    await switchTo(chosen.title); await wait(() => js<boolean>("document.querySelectorAll('[data-run]').length===36"), 'return');
    assert.ok(Math.abs(await js<number>("document.querySelector('.timeline').scrollTop") - saved) < 3);
    assert.equal(await js<string>("document.querySelector('#composer').value"), 'SYNTHETIC 保留草稿');
    await click('.return-latest');
    await wait(() => js<boolean>("document.querySelector('.timeline').scrollHeight-document.querySelector('.timeline').clientHeight-document.querySelector('.timeline').scrollTop<3"), 'latest');
    assert.equal(await js<string>("document.querySelector('.artifact-status').dataset.status"), 'unchecked');
    for (const status of ['ready', 'changed', 'missing', 'unavailable'] as const) {
      previewStatus = status; await click('.artifact');
      await wait(() => js<boolean>(`document.querySelector('.artifact-status').dataset.status===${JSON.stringify(status)}`), status);
      assert.equal(await js<boolean>("!!document.querySelector('.preview img')"), false);
      assert.equal(await js<boolean>("!!document.querySelector('.preview pre')"), status === 'ready');
    }
    delayPreview = true; await click('.artifact');
    await wait(async () => !!releasePreview, 'delayed_preview');
    await switchTo(other.title); await wait(() => js<boolean>("document.querySelectorAll('[data-run]').length===1"), 'switch_during_preview');
    releasePreview!(); delayPreview = false;
    await new Promise(r => setTimeout(r, 200));
    assert.equal(await js<boolean>("!!document.querySelector('.preview')"), false);
    assert.equal(commands, 0, 'view interactions must not submit execution commands');
    const directory = join(app.getAppPath(), '../../.artifacts/ui-p2-frontend'); mkdirSync(directory, {recursive: true});
    writeFileSync(join(directory, 'interaction-results.json'), JSON.stringify({scope: 'SYNTHETIC display fixtures in real Electron; no model calls or execution claims',metrics,anchorPreserved: true,threadScrollRestored: true,draftAndSelectionPreserved: true,latePreviewRejected: true,previewStatuses: ['ready','changed','missing','unavailable'],commands}, null, 2));
    console.log('UI-P2 frontend: 3 sizes / 3 widths, collapsed approvals/stop, scroll anchor + thread restore, draft/focus, preview statuses and late response fencing passed (SYNTHETIC UI fixtures)');
  } finally { releasePreview?.(); host.request = request; }
}
