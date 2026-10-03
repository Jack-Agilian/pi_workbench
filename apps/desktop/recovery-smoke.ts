// SYNTHETIC transport faults around real Renderer -> preload -> HostClient ->
// SQLite/Worker reads. This module is loaded only by the explicit smoke driver.
import assert from 'node:assert/strict';
import type { BrowserWindow } from 'electron';
import type { HostClient } from './host-client.ts';
import type { DesktopThread } from '../../packages/app-contracts/desktop.ts';

export async function runRecoverySmoke(window: BrowserWindow, host: HostClient, threadId: string, operationId: string) {
  const js = <T>(source: string): Promise<T> => window.webContents.executeJavaScript(source, true);
  const wait = async (predicate: () => Promise<boolean>, name: string) => {
    const until = Date.now() + 15000;
    while (!await predicate()) { if (Date.now() > until) throw Error(`recovery_timeout:${name}`); await new Promise(r => setTimeout(r, 30)); }
  };
  const original = host.request.bind(host), pid = host.processId;
  let mode: 'normal' | 'disconnected' | 'read-error' = 'normal';
  let reads = 0, commands = 0, rejectCommand = '';
  let allowOldActivity = false;
  let holdNextHome = false, holding = false, release: (() => void) | undefined;
  host.request = async raw => {
    if (raw.type === 'command') { commands++; if (rejectCommand) throw Error(rejectCommand); }
    if (raw.type === 'home' || raw.type === 'thread-activity') {
      reads++;
      if (holdNextHome && raw.type === 'home') {
        holdNextHome = false; const value = await original(raw); holding = true;
        await new Promise<void>(resolve => { release = resolve; }); holding = false; allowOldActivity = true; return value;
      }
      if (allowOldActivity && raw.type === 'thread-activity') { allowOldActivity = false; return original(raw); }
      if (mode !== 'normal') throw Error(mode === 'disconnected' ? 'disconnected' : 'SYNTHETIC_read_failure');
    }
    return original(raw);
  };
  try {
    // A transient read failure is not an unconfirmed command or a reason to restart.
    mode = 'read-error';
    await wait(() => js<boolean>("document.querySelector('.request-problem')?.textContent.includes('状态暂时无法读取') === true"), 'read_failure');
    mode = 'normal';
    await wait(() => js<boolean>("!document.querySelector('.notice.error')"), 'read_recovers');
    assert.equal(commands, 0); assert.equal(host.processId, pid);

    mode = 'disconnected';
    await wait(() => js<boolean>("!!document.querySelector('.connection-problem') && document.querySelector('.stop').disabled"), 'disconnect');
    mode = 'read-error'; const at = reads;
    await wait(async () => reads >= at + 2, 'non_connection_errors');
    assert.equal(await js<boolean>("!!document.querySelector('.connection-problem') && document.querySelector('.stop').disabled"), true);
    mode = 'normal';
    await wait(() => js<boolean>("!document.querySelector('.notice.error') && !document.querySelector('.stop').disabled"), 'recovered_without_restart');

    // Hold an old successful read while a newer command reports disconnection.
    holdNextHome = true;
    await wait(async () => holding, 'old_read_held');
    rejectCommand = 'disconnected'; mode = 'disconnected';
    await js("document.querySelector('.approval .primary').click()");
    await wait(() => js<boolean>("!!document.querySelector('.connection-problem')"), 'newer_command_failure');
    await js("window.recoveryLostBanner=false;window.recoveryObserver=new MutationObserver(()=>{if(!document.querySelector('.connection-problem'))window.recoveryLostBanner=true});window.recoveryObserver.observe(document.querySelector('main'),{subtree:true,childList:true})");
    release!();
    const failedReads = reads;
    await wait(async () => reads >= failedReads + 2, 'old_read_released');
    assert.equal(await js<boolean>("!!document.querySelector('.connection-problem')"), true);
    assert.equal(await js<boolean>("window.recoveryObserver.disconnect();window.recoveryLostBanner"), false);
    mode = 'normal'; rejectCommand = '';
    await wait(() => js<boolean>("!document.querySelector('.connection-problem') && document.querySelector('.request-problem')?.textContent.includes('请求未获确认') === true"), 'connection_not_acknowledgement');
    assert.equal(commands, 1); assert.equal(host.processId, pid);

    // A slow explicit refresh must not erase an error raised after it started.
    holdNextHome = true;
    await js("document.querySelector('.request-problem button').click()");
    await wait(async () => holding, 'refresh_held');
    rejectCommand = 'SYNTHETIC_unconfirmed';
    await js("document.querySelector('.approval .primary').click()");
    await wait(async () => commands === 2, 'newer_request');
    await wait(() => js<boolean>("!document.querySelector('.stop').disabled"), 'command_finished');
    release!(); rejectCommand = '';
    await wait(() => js<boolean>("!!document.querySelector('.request-problem button') && !document.querySelector('.request-problem button').disabled"), 'newer_error_preserved');
    await js("document.querySelector('.request-problem button').click()");
    await wait(() => js<boolean>("!document.querySelector('.notice.error')"), 'explicit_read_confirmed');
    const state = await original({type: 'thread', threadId}) as DesktopThread;
    assert.equal(state.runs[0]!.state, 'running');
    assert.equal(state.operations.find(op => op.id === operationId)?.state, 'pending');
    assert.equal(state.artifacts.length, 0); assert.equal(host.processId, pid); assert.equal(commands, 2);
    console.log('recovery: transient reads, stale read/new error, connection versus command confirmation, explicit read and unchanged real pending Worker passed; SYNTHETIC faults, zero replay');
  } finally { release?.(); host.request = original; await js("window.recoveryObserver?.disconnect()"); }
}
