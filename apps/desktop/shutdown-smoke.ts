// Explicit SYNTHETIC test driver of the real desktop lifecycle; never exposed through preload.
import assert from 'node:assert/strict';
import { app, dialog, type BrowserWindow } from 'electron';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HostClient } from './host-client.ts';
import type { Ack } from '../../packages/app-contracts/index.ts';
import type { DesktopHome, DesktopThread } from '../../packages/app-contracts/desktop.ts';

export async function runShutdownSmoke(window: BrowserWindow, currentHost: () => HostClient, profile: string, scenario: string, pendingHost: () => HostClient | undefined) {
  if (!['idle','starting','approval','executing','cancelling','completed','sigterm','sigint','sigkill','missing-proof','unresolved','recovery-close-race'].includes(scenario)) throw new Error('unknown_shutdown_scenario');
  const host = currentHost(); const pids = new Set<number>([host.processId!]);
  const result: { scenario: string; synthetic: true; hostPids: number[]; processPids: number[]; readyForSignal: boolean; willQuit: boolean; warning: boolean; raceWaitVerified?: boolean; blockedState?: string; beforeState?: string; threadId?: string; completedFile?: { path: string; text: string; mtime: string } } = {
    scenario, synthetic: true, hostPids: [host.processId!], processPids: [], readyForSignal: false, willQuit: false, warning: false,
  };
  const record = () => { result.processPids = [...pids]; writeFileSync(join(profile, 'shutdown.json'), JSON.stringify(result)); };
  const captureChildren = (parent: number) => {
    let children: string;
    try { children = execFileSync('/usr/bin/pgrep', ['-P', String(parent)], { encoding: 'utf8', env: {} }); }
    catch (error) { if (error instanceof Error && 'status' in error && error.status === 1) return; throw error; }
    for (const child of children.trim().split(/\s+/).map(Number)) if (child > 0) { pids.add(child); captureChildren(child); }
  };
  const wait = async (condition: () => boolean | Promise<boolean>, label: string) => {
    const end = Date.now() + 15000;
    while (!await condition()) { if (Date.now() > end) throw new Error('shutdown_timeout:' + label); await new Promise<void>(resolve => setTimeout(resolve, 25)); }
  };
  app.on('will-quit', () => { result.willQuit = true; record(); });
  if (scenario === 'idle') { record(); app.quit(); return; }
  const thread = await host.request({ type: 'command', command: { type: 'threads.create', requestId: 'shutdown-thread', workspaceId: 'demo-workspace', title: 'SYNTHETIC 中文退出 ' + scenario } }) as Ack;
  result.threadId = thread.id;
  await host.request({ type: 'command', command: { type: 'runs.start', requestId: 'shutdown-run', threadId: thread.id, input: 'SYNTHETIC shutdown only; no model' } });
  const snapshot = async () => await currentHost().request({ type: 'thread', threadId: thread.id }) as DesktopThread;
  if (scenario === 'starting') {
    assert.equal((await snapshot()).runs[0]!.state, 'starting');
  } else {
    await wait(async () => (await snapshot()).operations.some(op => op.state === 'pending'), 'pending');
  }
  if (['executing','cancelling','completed','unresolved'].includes(scenario)) {
    const op = (await snapshot()).operations[0]!;
    await host.request({ type: 'command', command: { type: 'approvals.resolve', requestId: 'shutdown-approve', operationId: op.id, parametersDigest: op.parametersDigest, decision: 'allow' } });
    if (scenario === 'completed') {
      await wait(async () => (await snapshot()).runs[0]!.state === 'completed', 'completed');
      const path = op.artifactPath!; const file = join(profile, 'workspace', path);
      result.completedFile = { path, text: readFileSync(file, 'utf8'), mtime: statSync(file, { bigint: true }).mtimeNs.toString() };
    } else {
      assert.equal((await snapshot()).operations[0]!.state, 'executing');
      if (scenario === 'cancelling') {
        await host.request({ type: 'command', command: { type: 'runs.cancel', requestId: 'shutdown-cancel', runId: op.runId } });
        assert.equal((await snapshot()).runs[0]!.state, 'cancelling');
      }
      if (scenario === 'unresolved') writeFileSync(join(profile, 'workspace', op.artifactPath!), '# SYNTHETIC external, unresolved version\n', { flag: 'wx' });
    }
  }
  result.beforeState = (await snapshot()).runs[0]!.state;
  // Preserve a queued intent in the same product database; close must cancel it without dispatch.
  if (!['completed','cancelling'].includes(scenario)) await host.request({ type: 'command', command: { type: 'runs.start', requestId: 'shutdown-queued', threadId: thread.id, input: 'SYNTHETIC queued must never dispatch' } });
  captureChildren(host.processId!); record();
  if (['sigterm','sigint','sigkill'].includes(scenario)) { result.readyForSignal = true; record(); return; }
  if (!['missing-proof','unresolved','recovery-close-race'].includes(scenario)) { window.close(); app.quit(); return; }

  const leases = join(profile, 'state/leases');
  const active = readdirSync(leases).filter(lease => !existsSync(join(leases, lease, 'cleanup.json'))); assert.equal(active.length, 1);
  const receipt = join(leases, active[0]!, 'cleanup.json');
  if (scenario !== 'unresolved') mkdirSync(receipt);
  const showDialog = dialog.showMessageBox; let warnings = 0;
  dialog.showMessageBox = async (arg: Electron.BaseWindow | Electron.MessageBoxOptions, options?: Electron.MessageBoxOptions) => {
    const message = options ?? arg as Electron.MessageBoxOptions;
    assert.equal(message.title, '清理尚未确认'); warnings++; result.warning = true; record(); return { response: 0, checkboxChecked: false };
  };
  try {
    window.close();
    await wait(() => result.warning, 'blocked_quit'); assert.equal(window.isDestroyed(), false);
    await assert.rejects(host.close(), /host_cleanup_unconfirmed/); assert.equal(result.willQuit, false);
    if (scenario === 'recovery-close-race') {
      const recovering = window.webContents.executeJavaScript('window.workbench.reconnect().then(()=>true,()=>false)', true);
      await wait(() => !!pendingHost()?.processId, 'candidate_host_spawned');
      const candidate = pendingHost()!; const pid = candidate.processId!; pids.add(pid); result.hostPids.push(pid);
      process.kill(pid, 'SIGSTOP');
      try {
        window.close();
        await new Promise<void>(resolve => setTimeout(resolve, 60));
        assert.equal(warnings, 1); assert.equal(currentHost(), host); assert.equal(window.isDestroyed(), false);
      } finally { process.kill(pid, 'SIGCONT'); }
      assert.equal(await recovering, false);
      await wait(() => warnings === 2, 'candidate_close_settled');
      await candidate.waitForExit(); assert.throws(() => process.kill(pid, 0)); assert.equal(currentHost(), host);
      result.raceWaitVerified = true;
    }
    // Existing public UI recovery action creates a fresh host only after the old process is gone.
    await wait(() => window.webContents.executeJavaScript("Boolean(document.querySelector('.notice.error button') && !document.querySelector('.notice.error button').disabled)"), 'reconnect_button');
    await window.webContents.executeJavaScript("document.querySelector('.notice.error button').click()", true);
    await wait(() => currentHost() !== host, 'replacement_published');
    assert.notEqual(currentHost(), host); result.hostPids.push(currentHost().processId!); pids.add(currentHost().processId!);
    const home = await currentHost().request({ type: 'home' }) as DesktopHome; assert.equal(home.recovery, 'blocked');
    const blocked = await snapshot(); assert.equal(blocked.runs.find(run => run.state === 'unknown')?.state, 'unknown');
    assert.equal(blocked.runs.find(run => run.state === 'queued'), undefined); result.blockedState = 'unknown';
    if (scenario !== 'unresolved') {
      const actual = JSON.parse(readFileSync(receipt + '.tmp', 'utf8')) as { exited: boolean; groupGone: boolean };
      assert.equal(actual.exited, true); assert.equal(actual.groupGone, true);
      rmSync(receipt, { recursive: true }); renameSync(receipt + '.tmp', receipt); // Restore genuine guardian bytes, never forge evidence.
    } else {
      const target = blocked.operations[0]!.artifactPath!; const file = join(profile, 'workspace', target);
      assert.equal(readFileSync(file, 'utf8'), '# SYNTHETIC external, unresolved version\n'); rmSync(file); // Test owner restores the known pre-operation version.
    }
    await wait(() => window.webContents.executeJavaScript("Boolean(document.querySelector('.notice[role=status] button') && !document.querySelector('.notice[role=status] button').disabled)"), 'recovery_button');
    await window.webContents.executeJavaScript("document.querySelector('.notice[role=status] button').click()", true);
    await wait(async () => (await snapshot()).runs.every(run => run.state === 'cancelled'), 'reconciled_cancellation');
    const restored = await snapshot(); assert.equal(restored.runs.length, 2); assert.ok(restored.runs.every(run => run.state === 'cancelled'));
    assert.equal(restored.operations.length, 1); assert.equal(restored.artifacts.length, 0);
    record(); window.close();
  } finally { dialog.showMessageBox = showDialog; }
}
