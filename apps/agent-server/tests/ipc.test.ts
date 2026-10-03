import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEnvelope, MAX_MESSAGE_BYTES } from '../../../packages/app-contracts/worker-ipc.ts';
import { IpcSender } from '../../../packages/pi-adapter/ipc-channel.ts';
const envelope = { version: 11, instanceId: 'worker', runtimeBindingId: 'binding', requestId: 'request', body: { type: 'hello', pid: 12 } };
test('IPC enums require original JSON strings, never coercible arrays or objects', () => {
  for (const [field, body, values] of [
    ['tool', { type: 'operation', toolCallId: 'call', parametersDigest: 'a'.repeat(64), target: 'report.md', resourceLock: 'b'.repeat(64) }, ['write','edit','bash']],
    ['kind', { type: 'observation', eventType: 'agent_settled', sourceType: null }, ['activity','idle','diagnostic']],
    ['code', { type: 'fault' }, ['initialization_failed','execution_failed','protocol_failed']],
  ] as const) {
    for (const value of values) {
      const wire = (v: unknown): unknown => JSON.parse(JSON.stringify({ ...envelope, body: { ...body, [field]: v } }));
      assert.doesNotThrow(() => parseEnvelope(wire(value)));
      for (const invalid of [[value], [[value]], { value }, null, 1, true, '', 'unknown']) assert.throws(() => parseEnvelope(wire(invalid)), /tool_not_admitted|invalid_kind|invalid_fault/);
    }
  }
});
test('closed IPC schema rejects authority injection, unknown/version/accessor fields', () => {
  assert.deepEqual(parseEnvelope(envelope), envelope);
  for (const value of [{ ...envelope, version: 1 }, { ...envelope, version: 9 }, { ...envelope, hostClean: true }, { ...envelope, body: { type: 'done', ok: true, hostClean: true } },
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

test('Shell wire additions remain closed, bounded, and reject prior protocol', () => {
  const outcome = { exitCode: 0, signal: null, timedOut: false, stdout: '中文', stderr: '', truncated: false, sideEffects: 'possible' };
  assert.doesNotThrow(() => parseEnvelope({ ...envelope, body: { type: 'shell-result', outcome } }));
  for (const invalid of [{ ...outcome, sideEffects: ['possible'] }, { ...outcome, stdout: 'x'.repeat(8193) }, { ...outcome, hostClean: true }, { ...outcome, exitCode: NaN }]) assert.throws(() => parseEnvelope({ ...envelope, body: { type: 'shell-result', outcome: invalid } }));
  assert.throws(() => parseEnvelope({ ...envelope, version: 3 }), /protocol_version/);
  assert.throws(() => parseEnvelope({ ...envelope, body: { type: 'shell-exec', operationId: 'operation', parametersDigest: 'a'.repeat(64), executable: '/bin/bash' } }), /unknown_field/);
});
