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
    console.log(`frontend wait: ${label}`);
    const end = Date.now() + 10000;
    while (!await check()) { if (Date.now() > end) { console.log('frontend timeout state',await js("(()=>{const t=document.querySelector('.timeline');return {top:t?.scrollTop,height:t?.scrollHeight,client:t?.clientHeight,focus:document.activeElement?.className,overlay:document.querySelector('.content-grid')?.dataset.overlay,inspectorHidden:document.querySelector('.inspector')?.hidden,runs:document.querySelectorAll('[data-run]').length}})()")); throw Error('frontend_timeout:' + label); } await new Promise(r => setTimeout(r, 35)); }
  };
  const click = async (selector: string) => {
    // Like smoke.ts: a published page does not mean the async button is ready.
    // Wait before the single click; never retry an already submitted action.
    await wait(() => js<boolean>(`(() => { const b=document.querySelector(${JSON.stringify(selector)}); return Boolean(b && !b.disabled); })()`), `button_ready:${selector}`);
    await js(`(() => { const b=document.querySelector(${JSON.stringify(selector)}); if(!b || b.disabled) throw Error('button_unavailable'); b.click(); })()`);
  };
  const switchTo = (name: string) => js(`[...document.querySelectorAll('.thread-link')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(name)}).click()`);
  const request = host.request.bind(host);
  const home = await request({type: 'home'}) as DesktopHome;
  const chosen = home.threads.find(t => t.title === 'SYNTHETIC allow')!;
  const other = home.threads.find(t => t.id !== chosen.id)!;
  const original = await request({type: 'thread', threadId: chosen.id}) as DesktopThread;
  const fixture = structuredClone(original);
  const originalRun = original.runs[0]!;
  fixture.runs = Array.from({length: 36}, (_, i) => ({...originalRun, id: `SYNTHETIC-ui-run-${i}`, state: 'completed'}));
  fixture.runs.at(-1)!.id = originalRun.id; // Preserve the already-browsed real head identity in this UI-only projection.
  fixture.inputs = fixture.runs.map((r, i) => ({id: r.id, text: `SYNTHETIC history ${i}\n` + '可读的旧记录，不是真实模型输出。'.repeat(12)}));
  fixture.presentations = [];
  fixture.artifacts = Array.from({length:30}, (_, i) => ({...original.artifacts[0]!, id:i===0?original.artifacts[0]!.id:`SYNTHETIC-artifact-${i}`, version:i+1}));
  fixture.operations = [{...original.operations[0]!, state: 'pending', runId: fixture.runs.at(-1)!.id, deadline: Date.now() + 120000}];
  fixture.operations.push(...Array.from({length:15},(_,i)=>({...fixture.operations[0]!,id:`SYNTHETIC-old-operation-${i}`,state:'succeeded' as const})));
  fixture.runs.at(-1)!.state = 'running';
  let revision = original.cursor + 100;
  let eventKind = 'SYNTHETIC_UI_ONLY', eventRun = originalRun.id;
  let entryReads=0, historyReads=0, operationReads=0;
  let operationError='', delayOperation=false; let releaseOperation:(()=>void)|undefined;
  let previewStatus: Preview['status'] = 'ready';
  let releasePreview: (() => void) | undefined;
  let delayPreview = false;
  let commands = 0;
  let alternateSelection = false;
  let historyError = ''; let workspaceStatus: 'ready'|'invalid' = 'ready';
  let delayHistory = false; let releaseHistory: (() => void) | undefined;
  host.request = async raw => {
    if (raw.type === 'command') commands++;
    if (raw.type === 'home' && alternateSelection) return {...home, workspaces:{selectedId:'SYNTHETIC-other',items:[...home.workspaces.items,{id:'SYNTHETIC-other',path:'/SYNTHETIC-other'}]}};
    if (raw.type === 'thread' && raw.threadId === chosen.id) throw Error('unbounded_renderer_request');
    if (raw.type === 'thread-activity' && raw.threadId === chosen.id) return {thread: fixture.thread, snapshotSeq: revision + 500, activeRun: fixture.runs.at(-1)!, operations: structuredClone(fixture.operations.filter(op => op.state === 'pending')), workspaceStatus};
    if (raw.type === 'history-entry' && raw.threadId === chosen.id) {
      entryReads++; const run=fixture.runs.find(r=>r.id===raw.runId)!;
      return {item:structuredClone({run,input:fixture.inputs.find(i=>i.id===run.id)!.text,presentation:{messages:[],omitted:false},modelOutcome:null}),snapshotSeq:revision};
    }
    if (raw.type === 'history-page' && raw.threadId === chosen.id) {
      historyReads++;
      if (historyError) throw Error(historyError);
      if (delayHistory) { delayHistory = false; await new Promise<void>(r => { releaseHistory = r; }); }
      const offset = Number(raw.page?.cursor ?? 0), limit = raw.page?.limit ?? 8;
      const runs = [...fixture.runs].reverse().slice(offset, offset + limit);
      const hasMore = offset + runs.length < fixture.runs.length;
      return {items: structuredClone(runs.map(run => ({run, input: fixture.inputs.find(i => i.id === run.id)!.text, presentation: {messages: [], omitted: false}, modelOutcome: null}))), hasMore, nextCursor: hasMore ? String(offset + runs.length) : null, snapshotSeq: revision};
    }
    if (raw.type === 'artifact-page' && raw.threadId === chosen.id) return {items: structuredClone(fixture.artifacts), hasMore: false, nextCursor: null, snapshotSeq: revision};
    if (raw.type === 'operation-page' && fixture.runs.some(run => run.id === raw.runId)) {
      operationReads++; if(operationError)throw Error(operationError);
      if(delayOperation){delayOperation=false;await new Promise<void>(r=>{releaseOperation=r;});}
      const offset=Number(raw.page?.cursor??0), limit=raw.page?.limit??8, all=fixture.operations.filter(op=>op.runId===raw.runId);
      const items=all.slice(offset,offset+limit), hasMore=offset+items.length<all.length;
      return {items:structuredClone(items),hasMore,nextCursor:hasMore?String(offset+items.length):null,snapshotSeq:revision};
    }
    if (raw.type === 'events' && raw.threadId === chosen.id) return raw.cursor < revision ? [{seq: revision, runSeq: 1, threadId: chosen.id, runId: eventRun, kind: eventKind, entityId: chosen.id, eventType: null, sourceType: null}] : [];
    if (raw.type === 'preview' && fixture.artifacts.some(a => a.id === raw.artifactId)) {
      if (delayPreview) await new Promise<void>(resolve => {releasePreview = resolve;});
      return {status: previewStatus, ...(previewStatus === 'ready' ? {text: 'SYNTHETIC <img onerror=unsafe()> UI preview'} : {})};
    }
    return request(raw);
  };
  const metrics: unknown[] = [];
  try {
    alternateSelection = true; historyError = 'page_item_too_large';
    await switchTo(other.title); await wait(() => js<boolean>("document.querySelectorAll('[data-run]').length===1"), 'before_failed_first_page');
    await switchTo(chosen.title);
    await wait(() => js<boolean>("!!document.querySelector('.retry-pages') && document.querySelector('h1').textContent==='SYNTHETIC allow'"), 'failed_first_page_activity');
    await click('.show-approvals');
    await wait(() => js<boolean>("document.activeElement.matches('.current-approvals .approval') && document.querySelectorAll('.approval').length===1"),'approval_without_history');
    const expectedWorkspace = home.workspaces.items.find(w => w.id === chosen.workspaceId)!.path;
    assert.equal(await js<string>("document.querySelector('.execution-summary span').title"), expectedWorkspace);
    assert.equal(await js<boolean>("!!document.querySelector('.view-toolbar .stop')"), true);
    alternateSelection = false; historyError = ''; await click('.retry-pages');
    await wait(() => js<boolean>("document.querySelectorAll('[data-run]').length===8"), 'first_page');
    assert.equal(await js<boolean>("document.querySelectorAll('.approval').length===1 && document.querySelector('.approval').closest('[data-operation]').dataset.operation===document.querySelector('.approval').dataset.approval && !document.querySelector('.current-approvals')"),true);
    await wait(() => js<boolean>("!!document.querySelector('.load-operations')"), 'tools_first_page');
    operationError='page_item_too_large';await click('.load-operations');
    await wait(()=>js<boolean>("!!document.querySelector('.retry-pages')"),'query_tool_error');
    const failedReads=operationReads;await new Promise(r=>setTimeout(r,800));assert.equal(operationReads,failedReads);
    assert.equal(await js<boolean>("!!document.querySelector('.view-toolbar .stop') && document.querySelector('.approval-indicator').textContent==='1 项待审批'"),true);
    operationError='';await click('.retry-pages');
    await wait(()=>js<boolean>("!document.querySelector('.retry-pages') && !document.querySelector('.load-operations').disabled"),'query_manual_retry');
    delayOperation=true;await click('.load-operations');
    await wait(async()=>Boolean(releaseOperation),'query_slow_tool');
    assert.equal(await js<boolean>("document.querySelector('.load-operations').disabled && !!document.querySelector('.view-toolbar .stop')"),true);
    releaseOperation!();
    await wait(() => js<boolean>("document.querySelectorAll('.operation-record').length===16 && !document.querySelector('.load-operations')"), 'tools_more');
    for (const count of [16, 24, 32, 36]) {
      await click('.load-history');
      await wait(() => js<boolean>(`document.querySelectorAll('[data-run]').length===${count}`), 'older_page');
    }
    assert.equal(await js<boolean>("!!document.querySelector('.load-history')"), false);
    await wait(() => js<boolean>("document.querySelector('.timeline').scrollTop>1000"), 'initial_latest');
    await js("(()=>{const t=document.querySelector('#composer');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'SYNTHETIC 保留草稿');t.dispatchEvent(new Event('input',{bubbles:true}));t.focus();t.setSelectionRange(3,7)})()");
    revision++;
    await new Promise(r => setTimeout(r, 500));
    assert.deepEqual(await js("[document.activeElement.id,document.querySelector('#composer').selectionStart,document.querySelector('#composer').selectionEnd]"), ['composer', 3, 7]);
    await captureLayout(window, 'ui-p2-approval');
    await click('.inspector-toggle');
    const originalSize = window.getContentSize();
    const frame = () => js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const rail = (name: string) => `[role=separator][aria-label="${name}"]`;
    const leftRail = rail('导航栏宽度'), rightRail = rail('详情栏宽度');
    const paneWidth = (selector: string) => js<number>(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().width`);
    const key = async (selector: string, key: string) => {
      await js(`document.querySelector(${JSON.stringify(selector)}).focus()`);
      window.webContents.sendInputEvent({type: 'keyDown', keyCode: key});
      window.webContents.sendInputEvent({type: 'keyUp', keyCode: key});
      await frame();
    };
    const drag = async (selector: string, delta: number) => {
      const point = await js<{x: number; y: number}>(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
      window.webContents.sendInputEvent({type: 'mouseMove', ...point});
      window.webContents.sendInputEvent({type: 'mouseDown', button: 'left', clickCount: 1, ...point});
      window.webContents.sendInputEvent({type: 'mouseMove', x: point.x+delta, y: point.y});
      await frame();
      window.webContents.sendInputEvent({type: 'mouseUp', button: 'left', clickCount: 1, x: point.x+delta, y: point.y});
      await frame();
      assert.equal(await js<boolean>("!!document.querySelector('[data-resizing=true]')"), false);
    };
    for (const [width, height] of [[1320, 860], [1024, 720], [820, 640]]) {
      window.setContentSize(width!, height!); await frame();
      for (const selector of [leftRail, rightRail]) {
        const pane = selector === leftRail ? '.sidebar' : '.inspector-pane';
        await key(selector, 'Home');
        const before = await paneWidth(pane);
        await drag(selector, selector === leftRail ? 48 : -48);
        assert.ok(Math.abs(await paneWidth(pane)-before-48)<2, 'real pointer drag changes pane width');
        const after = await paneWidth(pane);
        window.webContents.sendInputEvent({type:'mouseMove',x:500,y:250}); await frame();
        assert.equal(await paneWidth(pane), after, 'released pointer must not keep resizing');
        await key(selector, 'End');
        assert.equal(await paneWidth(pane), await js<number>(`Number(document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-valuemax'))`));
        await key(selector, 'Enter');
      }
      const boxes = await js<{overflow: boolean; rail: number; composerVisible: boolean; overlay: boolean}>("(()=>{const c=document.querySelector('.composer').getBoundingClientRect();return {overflow:document.body.scrollWidth>innerWidth,rail:document.querySelector('.inspector').getBoundingClientRect().width,composerVisible:c.bottom<=innerHeight&&c.width>200,overlay:document.querySelector('.content-grid').dataset.overlay==='true'}})()");
      assert.equal(boxes.overflow, false); assert.equal(boxes.composerVisible, true); assert.equal(boxes.overlay, width!<1000);
      metrics.push({width, height, ...boxes});
      if (boxes.overlay) {
        assert.equal(await js<boolean>("document.querySelector('.conversation').inert && document.activeElement.className==='pane-resize'"), true);
        await key(rightRail, 'Escape');
        assert.equal(await js<boolean>("document.activeElement.className==='inspector-toggle' && !document.querySelector('.conversation').inert"), true);
      } else await click('.inspector-toggle');
      assert.equal(await js<boolean>("document.querySelector('.inspector').hidden"), true);
      assert.equal(await js<string>("document.querySelector('.approval-indicator').textContent"), '1 项待审批');
      assert.equal(await js<boolean>("(()=>{const e=document.querySelector('.view-toolbar .stop');const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))})()"), true);
      await click('.show-approvals'); await frame();
      assert.equal(await js<boolean>("document.querySelector('.inspector').hidden && document.activeElement.matches('.approval') && !document.querySelector('.inspector .approval')"), true);
      await click('.inspector-toggle'); await frame();
      await click('.sidebar-toggle');
      assert.equal(await js<boolean>("document.querySelector('.sidebar').hidden && !document.querySelector('[aria-label=导航栏宽度]')"), true);
      await click('.sidebar-toggle');
      assert.equal(await js<boolean>("!document.querySelector('.sidebar').hidden"), true);
    }
    window.setContentSize(originalSize[0]!, originalSize[1]!); await frame();
    await key(leftRail, 'Enter'); await key(rightRail, 'Enter');
    // Width preferences survive window resize; shrinking only clamps rendered width.
    await key(rightRail, 'End');
    const preferred = await paneWidth('.inspector-pane');
    window.setContentSize(820,640); await frame();
    assert.ok(await paneWidth('.inspector-pane') < preferred);
    window.setContentSize(originalSize[0]!,originalSize[1]!); await frame();
    assert.equal(await paneWidth('.inspector-pane'),preferred);
    await key(rightRail,'Enter');
    assert.equal(await js<string>("document.querySelector('#composer').value"), 'SYNTHETIC 保留草稿');
    await js("document.querySelector('.timeline').scrollTop=1500");
    await wait(() => js<boolean>("!!document.querySelector('.return-latest')"), 'browsing');
    const anchor = await js<{id: string; offset: number}>("(()=>{const t=document.querySelector('.timeline');const y=t.getBoundingClientRect().top;const e=[...t.querySelectorAll('[data-run]')].find(e=>e.getBoundingClientRect().bottom>y);return {id:e.dataset.run,offset:e.getBoundingClientRect().top-y}})()");
    const beforeHistoryReads=historyReads,beforeEntryReads=entryReads;
    eventKind='display.replaced';eventRun=fixture.runs[0]!.id;
    fixture.inputs[0]!.text += '\n' + 'SYNTHETIC earlier record grows\n'.repeat(30); revision++;
    await wait(async()=>entryReads>beforeEntryReads,'targeted_body_read');
    await new Promise(r => setTimeout(r, 100));
    assert.equal(entryReads-beforeEntryReads,1);assert.equal(historyReads,beforeHistoryReads);
    eventKind='SYNTHETIC_UI_ONLY';eventRun=originalRun.id;
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
    // Explicit approval navigation remains owned by the timeline scroll hook.
    await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const saved = await js<number>("document.querySelector('.timeline').scrollTop");
    await switchTo(other.title); await wait(() => js<boolean>("document.querySelectorAll('[data-run]').length===1"), 'other');
    await switchTo(chosen.title); await wait(() => js<boolean>("document.querySelectorAll('[data-run]').length===36"), 'return');
    const restored = await js<number>("document.querySelector('.timeline').scrollTop");
    assert.ok(Math.abs(restored - saved) < 3, `thread scroll changed: saved=${saved}, restored=${restored}`);
    assert.equal(await js<string>("document.querySelector('#composer').value"), 'SYNTHETIC 保留草稿');
    if (await js<boolean>("!!document.querySelector('.return-latest')")) await click('.return-latest');
    await wait(() => js<boolean>("document.querySelector('.timeline').scrollHeight-document.querySelector('.timeline').clientHeight-document.querySelector('.timeline').scrollTop<3"), 'latest');
    await click('.inspector-toggle');
    assert.equal(await js<string>("document.querySelector('.artifact-status').dataset.status"), 'unchecked');
    for (const status of ['ready', 'changed', 'missing', 'unavailable'] as const) {
      previewStatus = status; await click('.artifact');
      await wait(() => js<boolean>(`document.querySelector('.artifact-status').dataset.status===${JSON.stringify(status)}`), status);
      assert.equal(await js<boolean>("!!document.querySelector('.preview img')"), false);
      assert.equal(await js<boolean>("!!document.querySelector('.preview pre')"), status === 'ready');
    }
    assert.equal(await js<string>("document.querySelector('.artifacts-heading').textContent.trim()"), '成果版本 30');
    for (const index of [0, 14, 29]) {
      previewStatus = 'ready';
      await js(`document.querySelectorAll('.artifact')[${index}].scrollIntoView({block:'nearest'})`);
      const timelineTop = await js<number>("document.querySelector('.timeline').scrollTop");
      await click(`.artifact[data-artifact="${fixture.artifacts[index]!.id}"]`);
      await wait(() => js<boolean>("Boolean(document.querySelector('.preview pre'))"), 'nearby_preview_'+index);
      assert.equal(await js<boolean>(`(()=>{const p=document.querySelector('.preview');const b=p.getBoundingClientRect();const r=document.querySelector('.inspector').getBoundingClientRect();return p.previousElementSibling.dataset.artifact===${JSON.stringify(fixture.artifacts[index]!.id)} && p===document.activeElement && b.top>=r.top && b.top<r.bottom && p.querySelector('h3').textContent.includes('版本 ${index+1}');})()`), true);
      const afterPreviewTop=await js<number>("document.querySelector('.timeline').scrollTop");
      assert.ok(Math.abs(afterPreviewTop-timelineTop)<3,`preview ${index} changed timeline ${timelineTop} -> ${afterPreviewTop}`);
      await click('.preview button[aria-label="关闭预览"]');
      assert.equal(await js<string>("document.activeElement.dataset.artifact"), fixture.artifacts[index]!.id);
    }
    for (const code of ['page_cursor_invalid', 'page_item_too_large']) {
      historyError = code; revision++;
      await wait(() => js<boolean>("!!document.querySelector('.retry-pages')"), 'page_error');
      assert.equal(await js<number>("document.querySelectorAll('[data-run]').length"), 36);
      assert.equal(await js<boolean>("!!document.querySelector('.view-toolbar .stop')"), true);
      historyError = ''; await click('.retry-pages');
      await wait(() => js<boolean>("!document.querySelector('.retry-pages')"), 'page_retry');
    }
    workspaceStatus = 'invalid';
    await wait(() => js<boolean>("document.querySelector('.composer .primary').disabled && document.querySelector('.notice.error')?.textContent.includes('工作目录')"), 'invalid_workspace');
    workspaceStatus = 'ready';
    await wait(() => js<boolean>("!document.querySelector('.notice.error')"), 'valid_workspace');
    delayHistory = true; revision++;
    await wait(async () => !!releaseHistory, 'delayed_history');
    fixture.operations[0]!.state = 'denied';
    await wait(() => js<boolean>("document.querySelector('.approval-indicator').textContent==='暂无待审批'"), 'activity_during_slow_history');
    await switchTo(other.title); await wait(() => js<boolean>("document.querySelectorAll('[data-run]').length===1"), 'switch_during_page');
    releaseHistory!();
    await new Promise(r => setTimeout(r, 400));
    assert.equal(await js<number>("document.querySelectorAll('[data-run]').length"), 1);
    await switchTo(chosen.title); await wait(() => js<boolean>("document.querySelectorAll('[data-run]').length===36"), 'restore_after_late_page');
    delayPreview = true; await click('.artifact');
    await wait(async () => !!releasePreview, 'delayed_preview');
    await switchTo(other.title); await wait(() => js<boolean>("document.querySelectorAll('[data-run]').length===1"), 'switch_during_preview');
    releasePreview!(); delayPreview = false;
    await new Promise(r => setTimeout(r, 200));
    assert.equal(await js<boolean>("!!document.querySelector('.preview')"), false);
    // Native pointer cancellation on window blur, plus actual reload of local preferences.
    await key(leftRail, 'Home');
    const point = await js<{x:number;y:number}>(`(()=>{const r=document.querySelector(${JSON.stringify(leftRail)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:120}})()`);
    window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point}); await frame();
    assert.equal(await js<boolean>("!!document.querySelector('[data-resizing=true]')"),true);
    // Explicitly synthetic browser lifecycle event; real native pointer owns capture.
    await js("window.dispatchEvent(new Event('blur'))"); await frame();
    window.webContents.sendInputEvent({type:'mouseMove',x:point.x+80,y:point.y});
    window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:point.x+80,y:point.y}); await frame();
    assert.equal(await paneWidth('.sidebar'),180);
    assert.equal(await js<boolean>("!!document.querySelector('[data-resizing=true]')"),false);
    await drag(leftRail,60);
    await click('.sidebar-toggle');
    const reload = async () => {
      await new Promise<void>(resolve => { window.webContents.once('did-finish-load',resolve); window.webContents.reload(); });
      await wait(() => js<boolean>("!!document.querySelector('.sidebar-toggle')"),'pane_preferences_reload');
    };
    await reload();
    assert.equal(await js<boolean>("document.querySelector('.sidebar').hidden"),true);
    await click('.sidebar-toggle'); await frame();
    assert.equal(await paneWidth('.sidebar'),240);
    // Corrupted local UI preferences cannot break startup or create arbitrary widths.
    await js(`localStorage.setItem('pi-workbench.panes.v1','{"sidebar":"bad","inspector":999999,"collapsed":"true"}')`);
    await reload(); await frame();
    assert.equal(await paneWidth('.sidebar'),224);
    assert.equal(await js<boolean>("document.querySelector('.sidebar').hidden"),false);
    assert.equal(commands, 0, 'view interactions must not submit execution commands');
    const directory = join(app.getAppPath(), '../../.artifacts/ui-p2-frontend'); mkdirSync(directory, {recursive: true});
    writeFileSync(join(directory, 'interaction-results.json'), JSON.stringify({scope: 'SYNTHETIC display fixtures in real Electron; no model calls or execution claims',metrics,anchorPreserved: true,threadScrollRestored: true,draftAndSelectionPreserved: true,latePreviewRejected: true,inlineApprovalIdentity: true,approvalWithoutHistory: true,nativePaneDragging: true,keyboardResize: true,overlayFocus: true,preferenceReload: true,invalidPreferencesFallback: true,blurStopsDrag: true,previewStatuses: ['ready','changed','missing','unavailable'],commands}, null, 2));
    console.log('UI-P2 frontend: 3 sizes / native pointer + keyboard resize, overlay/collapse and approvals/stop, scroll anchor + thread restore, draft/focus, preview statuses and late response fencing passed (SYNTHETIC UI fixtures)');
  } finally { releaseHistory?.(); releasePreview?.(); host.request = request; }
}
