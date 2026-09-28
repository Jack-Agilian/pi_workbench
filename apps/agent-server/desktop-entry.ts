import { readFileSync } from 'node:fs';
import { parseModelConfiguration } from '../../packages/app-contracts/model.ts';
import { describeModel } from '../../packages/pi-adapter/model-catalog.ts';
import { DesktopHost } from './desktop-host.ts';
import { exact } from '../../packages/app-contracts/worker-ipc.ts';
import { identifier } from '../../packages/app-contracts/index.ts';
import type { DesktopReply } from '../../packages/app-contracts/desktop.ts';
import { IpcSender } from '../../packages/pi-adapter/ipc-channel.ts';
if (!['--demo','--model','--model-offline'].includes(process.argv[2]??'') || !process.argv[3] || !process.send) throw new Error('explicit_desktop_demo_required');
let model:ConstructorParameters<typeof DesktopHost>[1];
if(process.argv[2]==='--model-offline')model={mode:'offline'};
if(process.argv[2]==='--model'){
  model={mode:'live'};
  try { const configuration=parseModelConfiguration(JSON.parse(readFileSync(process.argv[4]!,'utf8'))); const catalog=await describeModel(configuration.provider,configuration.model,configuration.maxOutputTokens);if(configuration.endpoint!==catalog.endpoint)throw new Error('model_endpoint_mismatch');model={mode:'live',configuration,requestUrl:catalog.requestUrl,reserveCostUsd:catalog.reserveCostUsd}; } catch { /* Show not_configured without exposing file contents/parse errors. */ }
}
const host = new DesktopHost(process.argv[3],model);
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
  try { const r = exact(raw, Object.hasOwn(Object(raw),'credential')?['id','credential']:['id','request']); id = identifier(r.id); }
  catch { void close(); return; }
  let reply: DesktopReply;
  try {
    const secret=Object.hasOwn(Object(raw),'credential');const r = exact(raw, secret?['id','credential']:['id','request']);
    if(secret){if(typeof r.credential!=='string')throw new Error('model_key_invalid');host.setModelKey(r.credential);}
    const value = host.request(secret?{type:'home'}:r.request);
    if (Buffer.byteLength(JSON.stringify(value)) > 1_200_000) throw new Error('response_limit');
    reply = { ok: true, value };
  } catch { reply = { ok: false, code: 'request_rejected' }; }
  void sender.send({ id, reply }).catch(() => close());
});
await sender.send({ type: 'ready' }); host.pump();
