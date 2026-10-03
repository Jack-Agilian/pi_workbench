// Trusted Electron test capture. Never loaded by Renderer or an online model.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';
// Test-only phase deadline; never changes product request or model deadlines.
async function phase<T>(label:string, work:()=>Promise<T>):Promise<T> {
  console.log(`layout phase start: ${label}`);
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const result=await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(`layout_phase_timeout:${label}`)),8000);})]);
    console.log(`layout phase done: ${label}`);return result;
  } finally { clearTimeout(timer); }
}
export async function captureLayout(window: BrowserWindow, label: string): Promise<void> {
  const out = join(app.getAppPath(), '../../.artifacts/ui-layout');
  mkdirSync(out, { recursive: true });
  const original = window.getContentSize();
  const records: unknown[] = [];
  for (const [width, height] of [[1320, 860], [1024, 720], [820, 640]]) {
    window.setContentSize(width!, height!);
    await new Promise(r => setTimeout(r, 180));
    // Wait for the resized Renderer to produce a frame before asking Chromium to copy it.
    await phase(`${label}:${width}:frame`, () => window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'));
    // Approval is now in its operation record. Navigate explicitly instead of
    // depending on a permanently visible inspector or stealing passive readers' focus.
    await window.webContents.executeJavaScript("document.querySelector('.show-approvals')?.click()");
    await phase(`${label}:${width}:approval-frame`, () => window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'));
    const metrics = await phase(`${label}:${width}:metrics`, () => window.webContents.executeJavaScript(`(() => {
      const actionable = selector => { const e=document.querySelector(selector); if(!e)return false; const b=e.getBoundingClientRect(); const top=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2); return b.x>=0 && b.y>=0 && b.right<=innerWidth && b.bottom<=innerHeight && !!top && e.contains(top); };
      const box = selector => { const e = document.querySelector(selector); if (!e) return null;
        const b = e.getBoundingClientRect(); return {x:b.x,y:b.y,width:b.width,height:b.height,
          scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,visible:b.width>0&&b.height>0}; };
      return {viewport:{width:innerWidth,height:innerHeight},bodyOverflow:document.body.scrollWidth>innerWidth,
        approvalActionable:actionable('.approval .primary'),stopVisible:actionable('.stop'),
        sidebar:box('.sidebar'),header:box('.thread-heading'),timeline:box('.timeline'),
        composer:box('.composer'),inspector:box('.inspector'),approval:box('.approval'),
        approve:box('.approval .primary'),stop:box('.stop')}; })()`));
    if (!metrics.approvalActionable || !metrics.stopVisible || metrics.bodyOverflow || metrics.composer.y+metrics.composer.height>metrics.viewport.height+1) throw new Error('critical_control_outside_viewport:'+width);
    if (metrics.approval.y < metrics.timeline.y - 1 || metrics.approval.y + metrics.approval.height > metrics.timeline.y + metrics.timeline.height + 1) throw new Error('approval_card_clipped:'+width);
    records.push(metrics);
    console.log(`layout capture: ${label} ${width}x${height}`);
    try {
      const screenshot = await phase(`${label}:${width}:capture`, () => window.webContents.capturePage(undefined, {stayAwake: true}));
      if (screenshot.isEmpty()) throw new Error('empty_capture');
      writeFileSync(join(out, `${label}-${width}x${height}.png`), screenshot.toPNG());
    } catch (cause) { throw new Error(`layout_capture_failed:${label}:${width}x${height}:visible=${window.isVisible()}:minimized=${window.isMinimized()}`, {cause}); }
  }
  writeFileSync(join(out, `${label}.json`), JSON.stringify(records, null, 2)+'\n');
  window.setContentSize(original[0]!, original[1]!);
  await new Promise(r => setTimeout(r, 120));
}
