// Actual Electron Renderer/IPC/Worker integration; reachable only by the local --smoke-test launch flag.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';
import type { HostClient } from './host-client.ts';
import type { DesktopHome, DesktopThread } from '../../packages/app-contracts/desktop.ts';
export async function runSmoke(window: BrowserWindow, host: HostClient, profile: string) {
  const wc = window.webContents;
  const js = <T>(source: string): Promise<T> => wc.executeJavaScript(source, true);
  const wait = async (predicate: () => Promise<boolean>, name: string) => {
    const until = Date.now() + 20000;
    while (!await predicate()) { if (Date.now() > until) throw new Error(`ui_timeout:${name}`); await new Promise<void>(r => setTimeout(r, 60)); }
  };
  const click = async (text: string) => {
    await js(`(() => { const b = [...document.querySelectorAll('button')].find(b => (b.textContent.trim() === ${JSON.stringify(text)} || b.getAttribute('aria-label') === ${JSON.stringify(text)})); if (!b || b.disabled) throw new Error('button_unavailable'); b.click(); })()`);
  };
  const fill = async (selector: string, value: string) => {
    await js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  };
  await wait(() => js<boolean>("Boolean(document.querySelector('.new-thread'))"), 'render');
  assert.equal(await js("typeof window.require + ':' + typeof window.process + ':' + typeof window.workbench.send"), 'undefined:undefined:undefined');
  assert.notEqual(wc.getOSProcessId(), process.pid);
  assert.ok(host.processId && host.processId !== process.pid && host.processId !== wc.getOSProcessId());
  const unsafe = await js<boolean>("window.workbench.command({type:'runs.start',requestId:'invalid',threadId:'x',input:'x',path:'/tmp/escape'}).then(()=>false,()=>true)");
  assert.equal(unsafe, true);
  assert.equal(await js<boolean>("fetch('https://example.com').then(()=>false,()=>true)"), true);
  assert.equal(await js<boolean>("fetch('file:///etc/passwd').then(()=>false,()=>true)"), true);
  const counts = [];
  for (const scenario of ['allow','deny','cancel','crash']) {
    console.log(`desktopSmoke scenario: ${scenario}`);
    await fill('#title', `SYNTHETIC ${scenario}`); await click('＋ 新建任务');
    await wait(() => js<boolean>(`document.querySelector('h1')?.textContent === ${JSON.stringify(`SYNTHETIC ${scenario}`)}`), 'thread');
    const text = `SYNTHETIC ${scenario} 中文任务 <img src=x onerror="globalThis.injection=true"> sk-syntheticSecret123456789`;
    await fill('#composer', text);
    // IME and Shift+Enter do not submit. Plain Enter does.
    await js("document.querySelector('#composer').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}))");
    await js("document.querySelector('#composer').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true}))");
    let home = await host.request({ type: 'home' }) as DesktopHome; const threadId = home.threads[0]!.id;
    assert.equal((await host.request({ type: 'thread', threadId }) as DesktopThread).runs.length, 0);
    await js("document.querySelector('#composer').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
    await wait(() => js<boolean>("Boolean(document.querySelector('.approval'))"), 'approval');
    let snapshot = await host.request({ type: 'thread', threadId }) as DesktopThread;
    assert.equal(snapshot.runs.length, 1); const run = snapshot.runs[0]!; const op = snapshot.operations[0]!;
    assert.equal(existsSync(join(profile, 'workspace', op.artifactPath!)), false);
    assert.equal(await js<boolean>("Boolean(globalThis.injection) || !!document.querySelector('.timeline img')"), false);
    assert.equal(await js<boolean>("document.querySelector('.timeline').textContent.includes('sk-syntheticSecret123456789')"), false);
    if (scenario === 'crash') {
      process.kill(host.processId!, 'SIGKILL');
      await wait(() => js<boolean>("document.querySelector('.notice')?.textContent.includes('连接已断开') === true"), 'host_disconnect');
      await wait(async () => readdirSync(join(profile, 'state/leases')).every(lease => {
        const path = join(profile, 'state/leases', lease, 'cleanup.json');
        if (!existsSync(path)) return false;
        const receipt = JSON.parse(readFileSync(path, 'utf8')) as { exited: boolean; groupGone: boolean };
        return receipt.exited && receipt.groupGone;
      }), 'guardian_cleanup');
      await click('重新连接');
      await wait(() => js<boolean>("!document.querySelector('.notice.error')"), 'reconnect');
    } else if (scenario === 'deny') await click('拒绝');
    else { await click('仅本次允许'); if (scenario === 'cancel') { await wait(() => js<boolean>("!document.querySelector('.stop')?.disabled"), 'cancel_enabled'); await click('停止'); } }
    const expected = scenario === 'allow' ? 'completed' : scenario === 'cancel' ? 'cancelled' : 'failed';
    await wait(async () => { snapshot = await host.request({ type: 'thread', threadId }) as DesktopThread; return snapshot.runs[0]?.state === expected; }, expected);
    await wait(() => js<boolean>(`Boolean(document.querySelector('[data-state="${expected}"]'))`), 'state');
    if (scenario === 'allow') {
      const artifact = snapshot.artifacts[0]!; assert.ok(artifact); assert.ok(readFileSync(join(profile, 'workspace', artifact.path), 'utf8').includes(text));
      await wait(() => js<boolean>("Boolean(document.querySelector('.artifact'))"), 'artifact');
      await js("document.querySelector('.artifact').click()");
      await wait(() => js<boolean>("Boolean(document.querySelector('.preview pre'))"), 'preview');
      assert.equal(await js<boolean>("Boolean(globalThis.injection) || !!document.querySelector('.preview img')"), false);
      assert.equal(await js<boolean>("document.querySelector('.preview').textContent.includes('sk-syntheticSecret123456789')"), false);
      const root = join(profile, 'evidence'); mkdirSync(root, { recursive: true });
      const screenshot = await wc.capturePage(); writeFileSync(join(root, 'desktop.png'), screenshot.toPNG());
      // Stable workspace artifact copied to the repository's ignored evidence directory by this trusted harness.
      const evidence = join(app.getAppPath(), '../../.artifacts/c-desktop'); mkdirSync(evidence, { recursive: true });
      writeFileSync(join(evidence, 'desktop.png'), screenshot.toPNG());
      writeFileSync(join(profile, 'workspace', artifact.path), 'EXTERNAL SYNTHETIC edit');
      await click('重新核验文件');
      await wait(() => js<boolean>("document.querySelector('.preview').textContent.includes('文件已被外部修改')"), 'changed');
    } else assert.equal(existsSync(join(profile, 'workspace', op.artifactPath!)), false);
    const cursor = snapshot.cursor;
    await host.reconnect(); // Actual App Server exit + SQLite reopen, same native references. No tool replay.
    snapshot = await host.request({ type: 'thread', threadId }) as DesktopThread;
    assert.equal(snapshot.runs[0]!.state, expected); assert.equal(snapshot.runs.length, 1);
    assert.deepEqual(await host.request({ type: 'events', threadId, cursor }), []);
    counts.push({ scenario, runId: run.id, state: expected, nativeProjection: snapshot.presentations[0]!.value.messages.length });
    await new Promise<void>(resolve => { wc.once('did-finish-load', resolve); wc.reload(); });
    await wait(() => js<boolean>("Boolean(document.querySelector('.new-thread'))"), 'reload');
  }
  // Switching threads preserves their own inputs/results, without exposing the native Session path or bindings.
  const home = await host.request({ type: 'home' }) as DesktopHome;
  assert.equal(home.threads.length, 4);
  for (const t of home.threads) {
    const snapshot = await host.request({ type: 'thread', threadId: t.id }) as DesktopThread;
    assert.equal(snapshot.runs.length, 1);
    assert.equal(JSON.stringify(snapshot).includes('runtimeBindingId'), false);
    assert.equal(JSON.stringify(snapshot).includes('nativeSessionRef'), false);
    await click(t.title);
    await wait(() => js<boolean>(`document.querySelector('h1')?.textContent === ${JSON.stringify(t.title)}`), 'switch_thread');
    await wait(() => js<boolean>(`document.querySelectorAll('[data-run]').length === 1 && document.querySelector('[data-run]')?.getAttribute('data-run') === ${JSON.stringify(snapshot.runs[0]!.id)}`), 'thread_isolation');
    await fill('#composer', `草稿 ${t.id}`);
  }
  const first = home.threads[0]!; await click(first.title);
  await wait(() => js<boolean>(`document.querySelector('#composer')?.value === ${JSON.stringify(`草稿 ${first.id}`)}`), 'draft_restore');
  console.log(JSON.stringify({ desktopSmoke: 'passed', versions: { electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node, abi: process.versions.modules }, platform: process.platform, arch: process.arch, scenarios: counts, realModelCalls: 0 }));
}
