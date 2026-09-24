import { app, BrowserWindow, dialog, ipcMain, protocol, session } from 'electron';
import { readFileSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { HostClient } from './host-client.ts';
import { parseDesktopRequest, type DesktopReply } from '../../packages/app-contracts/desktop.ts';
const outputDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(outputDirectory, '../..');
// Arguments come only from the local launch script. None is an IPC/Renderer option.
const nodeArg = process.argv.find(arg => arg.startsWith('--host-node='));
const profileArg = process.argv.find(arg => arg.startsWith('--demo-profile='));
if (!process.argv.includes('--demo') || !nodeArg || !profileArg) throw new Error('explicit_demo_launch_required');
const node = realpathSync(nodeArg.slice('--host-node='.length)); const profile = resolve(profileArg.slice('--demo-profile='.length));
if (execFileSync(node, ['-p','process.versions.node'], { env: {}, encoding: 'utf8' }).trim() !== '24.21.0') throw new Error('host_runtime_mismatch');
mkdirSync(join(profile, 'browser'), { recursive: true, mode: 0o700 });
app.setPath('userData', join(profile, 'browser'));
const single = app.requestSingleInstanceLock();
if (!single) app.exit(0);
let host = new HostClient(node, root, profile);
const origin = 'workbench://desktop/index.html';
protocol.registerSchemesAsPrivileged([{ scheme: 'workbench', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.commandLine.appendSwitch('disable-background-networking');
let window: BrowserWindow | undefined; let quitting = false; let closing = false; let shutdownFailed = false;
let reconnecting: Promise<void> | undefined;
let replacement: HostClient | undefined;
app.on('second-instance', () => { window?.show(); window?.focus(); });
app.on('before-quit', event => {
  if (quitting) return; event.preventDefault(); if (closing) return; closing = true;
  // Wait for every owned candidate even if another close has already failed.
  void Promise.allSettled([host.close(), replacement?.close(), reconnecting?.catch(() => {})]).then(results => {
    if (results.some(result => result.status === 'rejected')) throw new Error('host_cleanup_unconfirmed');
    quitting = true; app.quit();
  }).catch(() => {
    closing = false; shutdownFailed = true;
    void dialog.showMessageBox({ type: 'warning', title: '清理尚未确认', message: '执行宿主的清理尚未确认完成。', detail: '工作台保留了任务与操作记录。当前不能报告正常关闭，也不会重新执行未确认的操作。', buttons: ['知道了'] });
    // Remain alive if cleanup cannot be verified. No false successful shutdown.
  });
});
// Terminal/launcher termination uses the same audited shutdown as the window and menu.
process.on('SIGTERM', () => app.quit());
process.on('SIGINT', () => app.quit());
app.on('window-all-closed', () => app.quit());
async function startDesktop() {
await app.whenReady();
session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
session.defaultSession.setPermissionCheckHandler(() => false);
session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('workbench://desktop/') }));
const assets = new Map([['/index.html', ['index.html','text/html; charset=utf-8']], ['/renderer.js',['renderer.js','text/javascript; charset=utf-8']], ['/style.css',['style.css','text/css; charset=utf-8']]]);
protocol.handle('workbench', request => {
  const url = new URL(request.url); const asset = assets.get(url.pathname);
  if (url.host !== 'desktop' || url.search || !asset || request.method !== 'GET') return new Response('Not found', { status: 404 });
  return new Response(readFileSync(join(outputDirectory, asset[0]!)), { headers: { 'Content-Type': asset[1]!,
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" } });
});
const trusted = (event: Electron.IpcMainInvokeEvent) => window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === origin;
let inFlight = 0;
ipcMain.handle('workbench:request', async (event, raw: unknown): Promise<DesktopReply> => {
  if (!trusted(event)) return { ok: false, code: 'invalid_request' };
  if (closing || shutdownFailed) return { ok: false, code: 'disconnected' };
  if (inFlight >= 16) return { ok: false, code: 'busy' };
  let request; try { request = parseDesktopRequest(raw); } catch { return { ok: false, code: 'invalid_request' }; }
  inFlight++;
  try { return { ok: true, value: await host.request(request) }; }
  catch (error) { return { ok: false, code: error instanceof Error && error.message === 'disconnected' ? 'disconnected' : 'request_rejected' }; }
  finally { inFlight--; }
});
ipcMain.handle('workbench:reconnect', async event => {
  if (!trusted(event) || closing) return false;
  if (!reconnecting) reconnecting = (async () => {
    if (!shutdownFailed) return host.reconnect();
    const old = host; await old.waitForExit();
    if (replacement) { await replacement.waitForExit(); replacement = undefined; }
    if (closing || quitting) throw new Error('disconnected');
    const candidate = new HostClient(node, root, profile); replacement = candidate;
    try {
      await candidate.connect();
      if (closing || quitting || host !== old) throw new Error('disconnected');
      host = candidate; replacement = undefined; shutdownFailed = false;
    } catch (error) { await candidate.close().catch(() => {}); throw error; }
  })().finally(() => { reconnecting = undefined; });
  try { await reconnecting; return true; } catch { return false; }
});
await host.connect();
if (closing || quitting || shutdownFailed) return;
window = new BrowserWindow({ width: 1320, height: 900, minWidth: 820, minHeight: 640, title: 'Pi Workbench', backgroundColor: '#f6f7f9',
  webPreferences: { preload: join(outputDirectory, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false } });
window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
window.webContents.on('will-navigate', event => event.preventDefault());
window.webContents.on('will-attach-webview', event => event.preventDefault());
window.on('close', event => { if (!quitting) { event.preventDefault(); app.quit(); } });
await window.loadURL(origin);
const shutdownScenario = process.argv.find(arg => arg.startsWith('--shutdown-test='));
if (shutdownScenario) {
  const { runShutdownSmoke } = await import('./shutdown-smoke.ts');
  // Unlike the UI smoke suite, this driver must exit through the actual app.quit path.
  try { await runShutdownSmoke(window, () => host, profile, shutdownScenario.slice('--shutdown-test='.length), () => replacement); }
  catch (error) { console.error(error); await host.close().catch(() => {}); app.exit(1); }
  return;
}
if (process.argv.includes('--smoke-test')) {
  // Trusted test code only; not bundled into the Renderer or reachable through the preload API.
  const { runSmoke } = await import('./smoke.ts');
  // The smoke suite checks both successful reconnect cleanup and a terminal close failure.
  try { await runSmoke(window, host, profile); quitting = true; app.exit(0); }
  catch (error) { console.error(error); await host.close().catch(() => {}); quitting = true; app.exit(1); }
}

}
void startDesktop().catch(() => { void host.close().finally(() => app.exit(1)); });
