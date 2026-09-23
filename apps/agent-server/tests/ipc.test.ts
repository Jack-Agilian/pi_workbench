import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEnvelope, MAX_MESSAGE_BYTES } from '../../../packages/app-contracts/worker-ipc.ts';
import { IpcSender } from '../../../packages/pi-adapter/ipc-channel.ts';
const envelope = { version: 1, instanceId: 'worker', runtimeBindingId: 'binding', requestId: 'request', body: { type: 'hello', pid: 12 } };
test('closed IPC schema rejects authority injection, unknown/version/accessor fields', () => {
  assert.deepEqual(parseEnvelope(envelope), envelope);
  for (const value of [{ ...envelope, version: 2 }, { ...envelope, hostClean: true }, { ...envelope, body: { type: 'done', ok: true, hostClean: true } },
    { ...envelope, body: { type: 'execute-anything' } }, { ...envelope, get requestId() { throw new Error('accessor_executed'); } }]) {
    assert.throws(() => parseEnvelope(value), /protocol_version|unknown_field|unknown_message|invalid_record/);
  }
});
test('IPC sender bounds count/bytes, handles false backpressure via callback, rejects disconnected queue', async () => {
  let callback: ((error: Error | null) => void) | undefined; let calls = 0;
  const sender = new IpcSender((_message, done) => { calls++; callback = done; return false; });
  const first = sender.send(envelope); await Promise.resolve(); assert.equal(calls, 1);
  const waiting = Array.from({ length: 15 }, () => sender.send(envelope));
  const rejected = waiting.map(p => assert.rejects(p, /ipc_closed/));
  await assert.rejects(sender.send(envelope), /ipc_backpressure/);
  await assert.rejects(sender.send({ data: 'x'.repeat(MAX_MESSAGE_BYTES) }), /ipc_backpressure/);
  sender.close(); callback!(null); await first; await Promise.all(rejected); assert.equal(calls, 1);
});
