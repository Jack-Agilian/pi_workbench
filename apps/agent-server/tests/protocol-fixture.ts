// SYNTHETIC hostile/duplicate wire producer, never represented as an actual Pi event fixture.
import { parseEnvelope, type WireBody, type WorkerInit } from '../../../packages/app-contracts/worker-ipc.ts';
const instanceId = process.argv[2]!; const runtimeBindingId = process.argv[3]!; const mode = process.argv[4]!;
const envelope = (body: WireBody, requestId: string) => ({ version: 1, instanceId, runtimeBindingId, requestId, body });
const send = (body: WireBody, requestId: string) => process.send!(envelope(body, requestId));
let config: WorkerInit;
process.on('message', raw => {
  const m = parseEnvelope(raw);
  if (m.body.type === 'init') {
    config = m.body.config;
    if (mode === 'old') process.send!({ ...envelope({ type: 'ready', resourceLock: config.resources.id, nativeRef: null }, 'ready'), instanceId: 'old-instance' });
    else if (mode === 'unknown') process.send!({ ...envelope({ type: 'start' }, 'bad'), body: { type: 'execute-anything', hostClean: true } });
    else if (mode === 'oversize') process.send!(envelope({ type: 'init', config: { ...config, resources: { ...config.resources,
      files: Array.from({ length: 256 }, () => ({ path: 'x'.repeat(256), sha256: 'a'.repeat(64) })) } } }, 'oversize'));
    else send({ type: 'ready', resourceLock: config.resources.id, nativeRef: null }, 'ready');
  } else if (m.body.type === 'start' && mode === 'duplicate') {
    const operation: WireBody = { type: 'operation', toolCallId: 'SYNTHETIC-duplicate', tool: 'write', target: 'report.md', parametersDigest: process.argv[5]!, resourceLock: config.resources.id };
    send(operation, 'same-request'); send(operation, 'same-request');
  } else if (m.body.type === 'grant') {
    const operation: WireBody = { type: 'operation', toolCallId: 'SYNTHETIC-duplicate', tool: 'write', target: 'report.md', parametersDigest: process.argv[5]!, resourceLock: config.resources.id };
    send(operation, 'same-request'); process.disconnect();
  }
});
send({ type: 'hello', pid: mode === 'wrong-pid' ? process.pid + 1 : process.pid }, 'hello');
