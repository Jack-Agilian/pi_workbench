import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { DesktopHost } from '../agent-server/desktop-host.ts';
import { parseDesktopRequest, type DesktopHome, type DesktopThread } from '../../packages/app-contracts/desktop.ts';
import type { Ack } from '../../packages/app-contracts/index.ts';
import { parsePresentation, displayText } from '../../packages/app-contracts/presentation.ts';
import { shouldSubmit } from './composer-key.ts';
import { HostClient } from './host-client.ts';
import { repository } from '../agent-server/worker-launcher.ts';
import { projectMessages } from '../../packages/pi-adapter/presentation.ts';
import type { SessionEntry } from '@earendil-works/pi-coding-agent';
const until = async (predicate: () => boolean | Promise<boolean>, label: string) => {
  const end = Date.now() + 15000;
  while (!await predicate()) { if (Date.now() > end) throw new Error(`timeout:${label}`); await new Promise<void>(r => setTimeout(r, 25)); }
};
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'c-desktop-'))); const host = new DesktopHost(root);
  const thread = host.core.handle({ type: 'threads.create', requestId: 'thread', workspaceId: 'demo-workspace', title: 'SYNTHETIC desktop test' }).id;
  const start = { type: 'runs.start' as const, requestId: 'start', threadId: thread, input: 'SYNTHETIC desktop 中文 <script>bad()</script>' };
  const snapshot = () => host.request({ type: 'thread', threadId: thread }) as DesktopThread;
  return { root, host, thread, start, snapshot, dispose: async () => { await host.close(); rmSync(root, { recursive: true, force: true }); } };
}
test('desktop request whitelist rejects authority, accessors, oversize and arbitrary channels', () => {
  for (const value of [{ type: 'execute', script: 'x' }, { type: 'home', database: 'x' }, { type: 'thread', threadId: ['x'] },
    { type: 'events', threadId: 'x', cursor: -1 }, { type: 'command', command: { type: 'runs.start', requestId: 'x', threadId: 'x', input: 'a'.repeat(17000) } },
    { type: 'command', command: { type: 'runs.start', requestId: 'x', threadId: 'x', input: 'x', driver: 'arbitrary' } },
    Object.defineProperty({}, 'type', { get() { throw new Error('accessor_executed'); } })]) assert.throws(() => parseDesktopRequest(value), error => error instanceof Error && error.message !== 'accessor_executed');
});
test('presentation is bounded and excludes non-text SDK data; thinking/credential metadata never enter display', () => {
  const entries: SessionEntry[] = [{ type: 'message', id: 'synthetic', parentId: null, timestamp: new Date().toISOString(),
    message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'SYNTHETIC hidden internal text' }, { type: 'text', text: '<img onerror=bad()> sk-syntheticCredential12345678\n' + '中文'.repeat(2000) }],
      api: 'openai-responses', model: 'metadata-secret', provider: 'metadata-secret', timestamp: 1, stopReason: 'stop',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } } }];
  const projected = projectMessages(entries); assert.equal(projected.messages[0]!.truncated, true);
  assert.ok(projected.messages[0]!.text.startsWith('<img onerror=bad()> [redacted token]'));
  assert.equal(JSON.stringify(projected).includes('metadata-secret'), false); assert.equal(JSON.stringify(projected).includes('hidden internal'), false);
  assert.ok(projected.messages[0]!.text.length <= 2048);
  assert.deepEqual(parsePresentation(projected), projected);
  assert.throws(() => parsePresentation({ ...projected, token: 'x' }));
  assert.throws(() => parsePresentation({ ...projected, messages: [{ ...projected.messages[0], role: 'toolResult' }] }));
  assert.throws(() => parsePresentation({ messages: Array.from({ length: 16 }, (_, n) => ({ id: `m${n}`, role: 'user', text: 'x'.repeat(2048), truncated: false })), omitted: false }));
  assert.equal(displayText('api_key=synthetic-private Bearer synthetic-private'), 'api_key=[redacted] Bearer [redacted]');
});
test('community Composer guard handles Enter, Shift, modern and legacy IME, and repeat', () => {
  const event = { key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13, repeat: false };
  assert.equal(shouldSubmit(event), true);
  for (const change of [{ shiftKey: true }, { isComposing: true }, { keyCode: 229 }, { repeat: true }, { key: 'Escape' }]) assert.equal(shouldSubmit({ ...event, ...change }), false);
});
for (const decision of ['allow','deny','cancel'] as const) test(`real desktop host ${decision}: durable start, native projection, one tool, isolated Worker`, async () => {
  const f = fixture();
  try {
    f.host.request({ type: 'command', command: f.start }); f.host.request({ type: 'command', command: f.start });
    await until(() => f.snapshot().operations.length === 1, 'approval');
    const op = f.snapshot().operations[0]!; const worker = f.host.supervisor.workerPid; assert.ok(worker && worker !== process.pid);
    assert.equal(f.snapshot().runs.length, 1); assert.equal(existsSync(join(f.root, 'workspace', op.artifactPath!)), false);
    assert.ok(f.snapshot().presentations[0]!.value.messages.some(m => m.role === 'assistant'));
    if (decision === 'cancel') {
      f.host.request({ type: 'command', command: { type: 'approvals.resolve', requestId: 'approve', operationId: op.id, parametersDigest: op.parametersDigest, decision: 'allow' } });
      f.host.request({ type: 'command', command: { type: 'runs.cancel', requestId: 'cancel', runId: op.runId } });
    } else f.host.request({ type: 'command', command: { type: 'approvals.resolve', requestId: 'approve', operationId: op.id, parametersDigest: op.parametersDigest, decision } });
    await f.host.supervisor.completion;
    const snapshot = f.snapshot(); assert.equal(snapshot.runs[0]!.state, decision === 'allow' ? 'completed' : decision === 'deny' ? 'failed' : 'cancelled');
    assert.equal(existsSync(join(f.root, 'workspace', op.artifactPath!)), decision === 'allow');
    assert.throws(() => process.kill(worker!, 0));
    assert.equal(JSON.stringify(snapshot).includes('nativeSessionRef'), false);
    assert.equal(JSON.stringify(snapshot).includes('runtimeBindingId'), false);
    const original = snapshot.presentations;
    const ref = f.host.core.nativeSessionReference(f.thread); assert.ok(ref.persisted && ref.reference);
    await f.host.close();
    const reopened = new DesktopHost(f.root);
    try { assert.deepEqual((reopened.request({ type: 'thread', threadId: f.thread }) as DesktopThread).presentations, original); }
    finally { await reopened.close(); }
  } finally { await f.dispose(); }
});
test('real Worker SIGKILL after bytes written: reconnect checks the original artifact without rewriting', async () => {
  const f = fixture();
  try {
    f.host.request({ type: 'command', command: f.start }); await until(() => f.snapshot().operations.length === 1, 'approval');
    const op = f.snapshot().operations[0]!;
    // Kill the real Worker on the synchronous artifact-recorded product commit, before normal close.
    const subscription = f.host.core.subscribe(f.thread, f.snapshot().cursor, event => {
      if (event.kind === 'artifact.recorded') process.kill(f.host.supervisor.workerPid!, 'SIGKILL');
    });
    f.host.request({ type: 'command', command: { type: 'approvals.resolve', requestId: 'approve', operationId: op.id, parametersDigest: op.parametersDigest, decision: 'allow' } });
    await f.host.supervisor.completion; subscription.unsubscribe();
    assert.equal(f.snapshot().runs[0]!.state, 'unknown');
    const file = join(f.root, 'workspace', op.artifactPath!); const bytes = readFileSync(file); const before = statSync(file, { bigint: true }).mtimeNs;
    await f.host.close(); const reopened = new DesktopHost(f.root);
    try {
      const snapshot = reopened.request({ type: 'thread', threadId: f.thread }) as DesktopThread;
      assert.equal(snapshot.runs[0]!.state, 'failed'); assert.equal(snapshot.artifacts.length, 1);
      assert.deepEqual(readFileSync(file), bytes); assert.equal(statSync(file, { bigint: true }).mtimeNs, before);
      assert.equal(snapshot.operations.length, 1);
    } finally { await reopened.close(); }
  } finally { await f.dispose(); }
});
test('late presentation from an invalidated binding cannot overwrite the current display cache', async () => {
  const f = fixture();
  try {
    f.host.core.handle(f.start); const binding = f.host.core.dispatchNext()!;
    f.host.core.markRunning(binding); const next = f.host.core.replaceBinding(binding, { piIdle: true, hostClean: true });
    f.host.core.projectSession(next, { messages: [{ id: 'new', role: 'assistant', text: 'current', truncated: false }], omitted: false });
    assert.throws(() => f.host.core.projectSession(binding, { messages: [], omitted: false }), /stale_binding/);
    assert.equal(f.host.core.presentation(next.runId).messages[0]!.text, 'current');
    // This isolated cache test uses explicitly synthetic host cleanup evidence; no Worker was launched.
    f.host.core.settle(next, 'failed', { piIdle: true, hostClean: true });
  } finally { await f.dispose(); }
});
test('cross-thread product snapshots contain only that Thread and its persisted intent', async () => {
  const f = fixture();
  try {
    const other = f.host.core.handle({ type: 'threads.create', requestId: randomUUID(), workspaceId: 'demo-workspace', title: 'other' }).id;
    f.host.core.handle(f.start);
    const otherView = f.host.request({ type: 'thread', threadId: other }) as DesktopThread;
    assert.equal(otherView.runs.length, 0); assert.equal(otherView.inputs.length, 0); assert.equal(otherView.presentations.length, 0);
    assert.equal(f.snapshot().inputs[0]!.text, f.start.input);
  } finally { await f.dispose(); }
});
test('actual App Server transport closes on exit+disconnect and reopens SQLite without an overlapping host', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'c-client-'))); const client = new HostClient(process.execPath, repository, root);
  try {
    await client.connect(); const original = client.processId!; assert.notEqual(original, process.pid);
    const command = { type: 'threads.create' as const, requestId: 'persisted-thread', workspaceId: 'demo-workspace', title: 'SYNTHETIC reconnect' };
    const ack = await client.request({ type: 'command', command });
    await client.reconnect(); assert.notEqual(client.processId, original); assert.throws(() => process.kill(original, 0));
    assert.deepEqual(await client.request({ type: 'command', command }), ack);
    const second = client.processId!; await client.close(); assert.throws(() => process.kill(second, 0));
    await client.close(); await assert.rejects(client.request({ type: 'home' }), /disconnected/);
  } finally { await client.close(); rmSync(root, { recursive: true, force: true }); }
});
test('close during host reconnect shares completion and cannot publish a late host', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'c-rebind-close-'))); const client = new HostClient(process.execPath, repository, root);
  try {
    await client.connect(); const original = client.processId!;
    const reconnect = client.reconnect(); const rejection = assert.rejects(reconnect, /disconnected/);
    const first = client.close(); assert.equal(client.close(), first); await first; await rejection;
    assert.throws(() => process.kill(original, 0)); assert.equal(client.processId, original);
    await assert.rejects(client.connect(), /disconnected/);
  } finally { await client.close(); rmSync(root, { recursive: true, force: true }); }
});
for (const fault of ['missing-receipt', 'killed-during-close'] as const) test(`real App Server ${fault}: shared close failure, durable unknown and evidence-based recovery`, async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'c-close-failure-')));
  const client = new HostClient(process.execPath, repository, root);
  let reopened: HostClient | undefined;
  try {
    await client.connect(); const hostPid = client.processId!;
    const thread = await client.request({ type: 'command', command: { type: 'threads.create', requestId: 'thread', workspaceId: 'demo-workspace', title: 'SYNTHETIC cleanup fault' } }) as Ack;
    const start = { type: 'runs.start' as const, requestId: 'intent', threadId: thread.id, input: 'SYNTHETIC cleanup fault' };
    const ack = await client.request({ type: 'command', command: start });
    let snapshot: DesktopThread;
    await until(async () => { snapshot = await client.request({ type: 'thread', threadId: thread.id }) as DesktopThread; return snapshot.operations.length === 1; }, 'approval');
    const leases = join(root, 'state/leases'); assert.equal(readdirSync(leases).length, 1);
    const receipt = join(leases, readdirSync(leases)[0]!, 'cleanup.json');
    // Test-owned fault: block the real guardian's atomic receipt rename, after it stops the Worker.
    // Never forge a successful receipt, and never add a fault switch to the desktop protocol.
    if (fault === 'missing-receipt') mkdirSync(receipt);
    const closing = client.close(); assert.equal(client.close(), closing);
    const rejected = assert.rejects(closing, /host_cleanup_unconfirmed/);
    if (fault === 'killed-during-close') process.kill(hostPid, 'SIGKILL');
    await rejected; assert.equal(client.close(), closing);
    const firstError = await closing.catch(error => error);
    assert.equal(await client.close().catch(error => error), firstError);
    assert.throws(() => process.kill(hostPid, 0));
    const proofPath = fault === 'missing-receipt' ? receipt + '.tmp' : receipt;
    await until(() => existsSync(proofPath), 'actual_guardian_receipt');
    const proof = JSON.parse(readFileSync(proofPath, 'utf8')) as { exited: boolean; groupGone: boolean; workerPid: number };
    assert.equal(proof.exited, true); assert.equal(proof.groupGone, true);
    assert.throws(() => process.kill(proof.workerPid, 0)); assert.throws(() => process.kill(-proof.workerPid, 0));
    reopened = new HostClient(process.execPath, repository, root); await reopened.connect();
    let home = await reopened.request({ type: 'home' }) as DesktopHome;
    snapshot = await reopened.request({ type: 'thread', threadId: thread.id }) as DesktopThread;
    if (fault === 'missing-receipt') {
      assert.equal(home.recovery, 'blocked'); assert.equal(snapshot.runs[0]!.state, 'unknown');
      assert.equal(snapshot.operations[0]!.state, 'denied');
      rmSync(receipt, { recursive: true }); renameSync(proofPath, receipt); // Restore the untouched, real guardian bytes.
      home = await reopened.request({ type: 'recover' }) as DesktopHome;
    }
    assert.equal(home.recovery, 'ready');
    snapshot = await reopened.request({ type: 'thread', threadId: thread.id }) as DesktopThread;
    assert.equal(snapshot.runs[0]!.state, 'failed'); assert.equal(snapshot.runs.length, 1);
    assert.equal(snapshot.operations.length, 1); assert.equal(snapshot.artifacts.length, 0);
    assert.equal(existsSync(join(root, 'workspace', snapshot.operations[0]!.artifactPath!)), false);
    assert.deepEqual(await reopened.request({ type: 'command', command: start }), ack);
    assert.equal((await reopened.request({ type: 'thread', threadId: thread.id }) as DesktopThread).runs.length, 1);
  } finally { await client.close().catch(() => {}); await reopened?.close(); rmSync(root, { recursive: true, force: true }); }
});
test('schema v3 forward migration preserves the pre-Assistant product intent and native metadata', async () => {
  const f = fixture();
  try {
    f.host.core.handle(f.start); const original = f.snapshot(); const native = f.host.core.nativeSessionReference(f.thread);
    await f.host.close();
    const db = new DatabaseSync(join(f.root, 'host/product.sqlite'));
    db.exec('DROP TABLE run_display; PRAGMA user_version=3;'); db.close();
    const reopened = new DesktopHost(f.root);
    try {
      const restored = reopened.request({ type: 'thread', threadId: f.thread }) as DesktopThread;
      assert.deepEqual(restored, original); assert.deepEqual(reopened.core.nativeSessionReference(f.thread), native);
    } finally { await reopened.close(); }
  } finally { await f.dispose(); }
});
