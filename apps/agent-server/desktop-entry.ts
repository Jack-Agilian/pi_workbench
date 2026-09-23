import { DesktopHost } from './desktop-host.ts';
import { exact } from '../../packages/app-contracts/worker-ipc.ts';
import { identifier } from '../../packages/app-contracts/index.ts';
import type { DesktopReply } from '../../packages/app-contracts/desktop.ts';
import { IpcSender } from '../../packages/pi-adapter/ipc-channel.ts';
if (process.argv[2] !== '--demo' || !process.argv[3] || !process.send) throw new Error('explicit_desktop_demo_required');
const host = new DesktopHost(process.argv[3]);
const sender = new IpcSender((message, callback) => process.send!(message, callback), 1_250_000);
let closing: Promise<void> | undefined;
function close() {
  if (!closing) closing = host.close().catch(() => { process.exitCode = 1; }).finally(() => {
    sender.close(); if (process.connected) process.disconnect();
    // Owned execution cleanup has settled above. End this per-desktop host explicitly;
    // a nonzero exit leaves the durable cleanup/recovery evidence authoritative.
    process.exit(process.exitCode ?? 0);
  });
  return closing;
}
process.on('disconnect', () => { void close(); });
process.on('SIGTERM', () => { void close(); });
process.on('message', raw => {
  if (closing) return;
  let id: string;
  try { const r = exact(raw, ['id','request']); id = identifier(r.id); }
  catch { void close(); return; }
  let reply: DesktopReply;
  try {
    const r = exact(raw, ['id','request']); const value = host.request(r.request);
    if (Buffer.byteLength(JSON.stringify(value)) > 1_200_000) throw new Error('response_limit');
    reply = { ok: true, value };
  } catch { reply = { ok: false, code: 'request_rejected' }; }
  void sender.send({ id, reply }).catch(() => close());
});
await sender.send({ type: 'ready' }); host.pump();
