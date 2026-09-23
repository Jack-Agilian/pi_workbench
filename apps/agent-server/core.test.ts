import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';
import { parseCommand, type Binding, type ProductEvent } from '../../packages/app-contracts/index.ts';
import { ProductCore } from './core.ts';

const root = process.env.PI_PROBE_ROOT;
assert.ok(root, 'Use npm run test:product-core');
assert.equal(process.permission.has('child'), false);
const settled = { piIdle: true, hostClean: true };
const hash = 'a'.repeat(64);
const contentHash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
function fixture(t: TestContext) {
  const dir = mkdtempSync(join(root!, 'product-')); const workspace = join(dir, '中文 workspace'); mkdirSync(workspace);
  const path = join(dir, 'products.sqlite'); const workspaces = [{ id: 'workspace', path: workspace }];
  const core = new ProductCore(path, workspaces); t.after(() => core.close());
  const thread = core.handle({ type: 'threads.create', requestId: 'thread', workspaceId: 'workspace', title: 'SYNTHETIC task' }).id;
  const start = (requestId = 'start') => core.handle({ type: 'runs.start', requestId, threadId: thread, input: 'SYNTHETIC independent task; no inference' }).id;
  const running = () => { start(); const binding = core.dispatchNext(); assert.ok(binding); core.markRunning(binding); return binding; };
  return { core, dir, workspace, path, workspaces, thread, start, running };
}
function approve(core: ProductCore, binding: Binding, call = 'call') {
  const op = core.requestOperation(binding, { tool: 'write', toolCallId: call, parametersDigest: hash, artifactPath: 'report.md', deadline: Date.now() + 60_000 });
  core.handle({ type: 'approvals.resolve', requestId: 'approve-' + call, operationId: op.id, parametersDigest: hash, decision: 'allow' });
  return op;
}

test('product commands reject unknown authority, functions, accessors and unsupported intents', () => {
  const valid = { type: 'runs.start', requestId: 'request', threadId: 'thread', input: 'SYNTHETIC' };
  assert.deepEqual(parseCommand(valid), valid);
  for (const value of [{ ...valid, runtimeBindingId: 'injected' }, { ...valid, workspacePath: '/tmp' },
    { ...valid, token: 'SYNTHETIC' }, { ...valid, input: () => {} }, { ...valid, input: 'x'.repeat(16_385) },
    { ...valid, type: 'executeAnything' }, { ...valid, type: 'steer' }, { ...valid, type: 'followUp' },
    { ...valid, get secret() { return assert.fail('Accessor must not execute'); } }, null, []]) assert.throws(() => parseCommand(value));
});

test('durable idempotency: reordered input reuses acknowledgement; conflicting reuse fails after reopen', t => {
  const f = fixture(t); const id = f.start(); const before = f.core.snapshot(f.thread);
  assert.equal(f.core.handle({ input: 'SYNTHETIC independent task; no inference', threadId: f.thread, requestId: 'start', type: 'runs.start' }).id, id);
  assert.deepEqual(f.core.snapshot(f.thread), before);
  f.core.close(); const reopened = new ProductCore(f.path, f.workspaces); t.after(() => reopened.close());
  assert.equal(reopened.handle({ type: 'runs.start', requestId: 'start', threadId: f.thread, input: 'SYNTHETIC independent task; no inference' }).id, id);
  assert.throws(() => reopened.handle({ type: 'runs.start', requestId: 'start', threadId: f.thread, input: 'changed' }), /idempotency_conflict/);
  assert.equal(reopened.snapshot(f.thread).runs.length, 1);
});

test('transaction failure rolls back run, request and event together before dispatch', t => {
  const f = fixture(t); const db = new DatabaseSync(f.path); t.after(() => db.close());
  const before = f.core.snapshot(f.thread);
  db.exec("CREATE TRIGGER synthetic_fail BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'SYNTHETIC event failure'); END;");
  assert.throws(() => f.start(), /SYNTHETIC event failure/);
  assert.deepEqual(f.core.snapshot(f.thread), before);
  assert.equal(f.core.dispatchNext(), undefined);
  db.exec('DROP TRIGGER synthetic_fail');
  f.start(); assert.equal(f.core.snapshot(f.thread).runs.length, 1);
});

test('global write admission spans connections, approvals and cancelling; queued input is never double dispatched', t => {
  const f = fixture(t); const binding = f.running(); f.start('second');
  const other = new ProductCore(f.path, f.workspaces); t.after(() => other.close());
  assert.equal(other.dispatchNext(), undefined);
  const independent = new DatabaseSync(f.path); t.after(() => independent.close());
  assert.throws(() => independent.exec("UPDATE runs SET state='running' WHERE state='queued'"), /UNIQUE constraint failed/, 'SQLite itself enforces the global writer constraint');
  const op = f.core.requestOperation(binding, { tool: 'write', toolCallId: 'pending', parametersDigest: hash, deadline: Date.now() + 60_000 });
  assert.equal(f.core.dispatchNext(), undefined);
  assert.throws(() => f.core.settle(binding, 'completed', settled), /cleanup_unconfirmed/);
  f.core.handle({ type: 'runs.cancel', requestId: 'cancel', runId: binding.runId });
  assert.equal(f.core.snapshot(f.thread).operations[0]?.state, 'denied');
  assert.throws(() => f.core.handle({ type: 'approvals.resolve', requestId: 'late-approve', operationId: op.id, parametersDigest: hash, decision: 'allow' }), /approval_not_pending/);
  assert.equal(other.dispatchNext(), undefined);
  assert.throws(() => f.core.settle(binding, 'cancelled', { piIdle: true, hostClean: false }), /cleanup_unconfirmed/);
  f.core.settle(binding, 'cancelled', settled);
  const second = other.dispatchNext(); assert.ok(second); assert.notEqual(second.runId, binding.runId);
  assert.equal(f.core.dispatchNext(), undefined);
});

test('approvals bind exact digest and permit one claim; denial performs no execution', t => {
  const f = fixture(t); const binding = f.running();
  const op = f.core.requestOperation(binding, { tool: 'write', toolCallId: 'call', parametersDigest: hash, deadline: Date.now() + 60_000 });
  assert.throws(() => f.core.claimOperation(binding, op.id, hash), /operation_not_authorized/);
  assert.throws(() => f.core.handle({ type: 'approvals.resolve', requestId: 'bad', operationId: op.id, parametersDigest: 'b'.repeat(64), decision: 'allow' }), /approval_digest_mismatch/);
  const allow = { type: 'approvals.resolve', requestId: 'allow', operationId: op.id, parametersDigest: hash, decision: 'allow' };
  f.core.handle(allow); const cursor = f.core.snapshot(f.thread).cursor; f.core.handle(allow);
  assert.equal(f.core.snapshot(f.thread).cursor, cursor);
  assert.throws(() => f.core.claimOperation(binding, op.id, 'b'.repeat(64)), /operation_not_authorized/);
  f.core.claimOperation(binding, op.id, hash);
  assert.throws(() => f.core.claimOperation(binding, op.id, hash), /operation_not_authorized/);
  f.core.finishOperation(binding, op.id, 'succeeded');
  const denied = f.core.requestOperation(binding, { tool: 'write', toolCallId: 'denied', parametersDigest: hash, deadline: Date.now() + 60_000 });
  f.core.handle({ type: 'approvals.resolve', requestId: 'deny', operationId: denied.id, parametersDigest: hash, decision: 'deny' });
  assert.throws(() => f.core.claimOperation(binding, denied.id, hash), /operation_not_authorized/);
  assert.throws(() => f.core.finishOperation(binding, denied.id, 'succeeded'), /operation_not_executing/);
});

test('operation intent identity and deadline cannot be changed after approval; expiration stays blocked until cancel', t => {
  const f = fixture(t); const binding = f.running(); const deadline = Date.now() + 60_000;
  const intent = { tool: 'write', toolCallId: 'call', parametersDigest: hash, deadline };
  const op = f.core.requestOperation(binding, intent);
  assert.equal(f.core.requestOperation(binding, intent).id, op.id);
  assert.throws(() => f.core.requestOperation(binding, { ...intent, parametersDigest: 'b'.repeat(64) }), /operation_conflict/);
  assert.throws(() => f.core.requestOperation(binding, { ...intent, deadline: 0 }), /invalid_deadline/);
  const db = new DatabaseSync(f.path); t.after(() => db.close());
  // Deterministic synthetic expiry at the persistence seam; no fake system clock.
  db.prepare('UPDATE operations SET deadline=0 WHERE id=?').run(op.id);
  assert.throws(() => f.core.handle({ type: 'approvals.resolve', requestId: 'expired', operationId: op.id, parametersDigest: hash, decision: 'allow' }), /approval_not_pending/);
  assert.throws(() => f.core.settle(binding, 'completed', settled), /cleanup_unconfirmed/);
  f.core.handle({ type: 'runs.cancel', requestId: 'cancel', runId: binding.runId });
  f.core.settle(binding, 'cancelled', settled);
});

test('cancelled active operation holds admission until completion and independent cleanup confirmation', t => {
  const f = fixture(t); const binding = f.running(); const op = approve(f.core, binding); f.core.claimOperation(binding, op.id, hash);
  f.start('next'); f.core.handle({ type: 'runs.cancel', requestId: 'cancel', runId: binding.runId });
  assert.equal(f.core.snapshot(f.thread).runs[0]?.state, 'cancelling');
  assert.throws(() => f.core.settle(binding, 'cancelled', settled), /cleanup_unconfirmed/);
  assert.equal(f.core.dispatchNext(), undefined);
  f.core.finishOperation(binding, op.id, 'succeeded');
  assert.throws(() => f.core.settle(binding, 'cancelled', { piIdle: false, hostClean: true }), /cleanup_unconfirmed/);
  f.core.settle(binding, 'cancelled', settled); assert.ok(f.core.dispatchNext());
  assert.equal(f.core.snapshot(f.thread).operations[0]?.state, 'succeeded', 'Cancellation must not invent rollback');
});

test('idle observation is not completion; fresh binding rejects prior Run and Session callbacks', t => {
  const f = fixture(t); const first = f.running();
  const callback = () => f.core.observe(first, 'activity');
  f.core.observe(first, 'idle'); assert.equal(f.core.snapshot(f.thread).runs[0]?.state, 'running');
  const replacement = f.core.replaceBinding(first, settled);
  const cursor = f.core.snapshot(f.thread).cursor;
  assert.equal(callback(), false); assert.equal(f.core.snapshot(f.thread).cursor, cursor);
  assert.notEqual(replacement.sessionGeneration, first.sessionGeneration);
  f.core.settle(replacement, 'completed', settled); f.start('next'); const next = f.core.dispatchNext(); assert.ok(next); f.core.markRunning(next);
  assert.equal(f.core.observe(replacement, 'idle'), false); assert.equal(f.core.observe(next, 'activity'), true);
  assert.equal(f.core.snapshot(f.thread).runs[1]?.state, 'running');
});

test('crash recovery fences observations, retains unknown side effects and requires explicit reconciliation', t => {
  const f = fixture(t); const binding = f.running(); const op = approve(f.core, binding); f.core.claimOperation(binding, op.id, hash); f.start('next');
  f.core.close(); const reopened = new ProductCore(f.path, f.workspaces); t.after(() => reopened.close());
  assert.equal(reopened.dispatchNext(), undefined, 'Opening alone does not replay work');
  reopened.recoverAfterCrash();
  assert.equal(reopened.snapshot(f.thread).runs[0]?.state, 'unknown');
  assert.equal(reopened.snapshot(f.thread).operations[0]?.state, 'unknown');
  assert.equal(reopened.observe(binding, 'activity'), false); assert.equal(reopened.dispatchNext(), undefined);
  assert.throws(() => reopened.reconcileRun(binding.runId, 'failed', settled), /cleanup_unconfirmed/);
  reopened.finishOperation(binding, op.id, 'succeeded');
  const late = reopened.eventsAfter(f.thread, 0).find(event => event.kind === 'operation.late_succeeded');
  assert.equal(late?.runId, binding.runId); assert.equal(late?.entityId, op.id);
  assert.throws(() => reopened.reconcileRun(binding.runId, 'failed', { piIdle: true, hostClean: false }), /cleanup_unconfirmed/);
  reopened.reconcileRun(binding.runId, 'failed', settled); const next = reopened.dispatchNext(); assert.ok(next);
  const cursor = reopened.snapshot(f.thread).cursor;
  reopened.finishOperation(binding, op.id, 'succeeded');
  assert.equal(reopened.snapshot(f.thread).cursor, cursor, 'Duplicate late facts do not create events');
  assert.notEqual(next.runtimeBindingId, binding.runtimeBindingId);
});

test('starting crash and explicit unknown operation reconciliation never silently complete or retry', t => {
  const f = fixture(t); f.start(); const starting = f.core.dispatchNext(); assert.ok(starting);
  f.core.recoverAfterCrash(); assert.equal(f.core.observe(starting, 'idle'), false);
  f.core.reconcileRun(starting.runId, 'failed', settled);
  f.start('second'); const second = f.core.dispatchNext(); assert.ok(second); f.core.markRunning(second);
  const op = approve(f.core, second); f.core.claimOperation(second, op.id, hash); f.core.finishOperation(second, op.id, 'unknown');
  assert.equal(f.core.snapshot(f.thread).runs[1]?.state, 'unknown');
  assert.throws(() => f.core.settle(second, 'completed', settled), /stale_binding/);
  f.core.recoverAfterCrash(); f.core.reconcileOperation(op.id, 'failed'); f.core.reconcileRun(second.runId, 'failed', settled);
  assert.equal(f.core.snapshot(f.thread).runs.filter(run => run.state === 'failed').length, 2);
  assert.equal(f.core.dispatchNext(), undefined);
});

test('snapshot-to-subscribe gap replays durable events once; observer failure is isolated and resumable', t => {
  const f = fixture(t); const snapshot = f.core.snapshot(f.thread); f.start();
  const received: ProductEvent[] = []; const subscription = f.core.subscribe(f.thread, snapshot.cursor, event => received.push(event));
  assert.equal(received.length, 1);
  const failed = f.core.subscribe(f.thread, snapshot.cursor, () => { throw new Error('SYNTHETIC listener failure'); });
  assert.equal(failed.status().failed, true); assert.equal(failed.status().cursor, snapshot.cursor);
  const binding = f.core.dispatchNext(); assert.ok(binding); f.core.markRunning(binding);
  subscription.poll(); assert.equal(received.length, 3); assert.equal(new Set(received.map(event => event.seq)).size, 3);
  assert.deepEqual(received.map(event => event.runSeq), [1, 2, 3]);
  subscription.unsubscribe(); subscription.unsubscribe(); f.core.observe(binding, 'activity'); assert.equal(received.length, 3);
  const resumed: ProductEvent[] = []; const retry = f.core.subscribe(f.thread, failed.status().cursor, event => resumed.push(event));
  assert.equal(resumed.length, 4); retry.unsubscribe();
});

test('cross-connection polling and callback reentry retain ordered events without executing on replay', t => {
  const f = fixture(t); const other = new ProductCore(f.path, f.workspaces); t.after(() => other.close());
  const received: ProductEvent[] = []; let reentered = false;
  const sub = f.core.subscribe(f.thread, f.core.snapshot(f.thread).cursor, event => {
    received.push(event);
    if (!reentered) { reentered = true; f.start('nested'); }
  });
  other.handle({ type: 'runs.start', requestId: 'external', threadId: f.thread, input: 'SYNTHETIC' });
  assert.equal(received.length, 0); sub.poll(); assert.equal(received.length, 2);
  assert.ok(received[1]!.seq > received[0]!.seq);
  assert.ok(f.core.snapshot(f.thread).runs.every(run => run.state === 'queued'));
  sub.poll(); assert.equal(received.length, 2); sub.unsubscribe();
});

test('event replay crosses batch boundary, rejects future cursors and never dispatches queued tasks', t => {
  const f = fixture(t); const cursor = f.core.snapshot(f.thread).cursor;
  for (let index = 0; index < 130; index++) f.start('batch-' + index);
  const events: ProductEvent[] = []; const subscription = f.core.subscribe(f.thread, cursor, event => { events.push(event); });
  assert.equal(events.length, 130); assert.equal(new Set(events.map(event => event.seq)).size, 130);
  assert.ok(f.core.snapshot(f.thread).runs.every(run => run.state === 'queued'));
  assert.throws(() => f.core.eventsAfter(f.thread, f.core.snapshot(f.thread).cursor + 1), /future_cursor/);
  assert.throws(() => f.core.eventsAfter(f.thread, -1), /invalid_cursor/);
  f.core.close(); assert.equal(subscription.status().active, false);
});

test('native reference stays host-only; product database contains no transcript or copied Session tree', t => {
  const f = fixture(t); const binding = f.running(); const reference = join(f.dir, 'native', 'private-session.jsonl');
  f.core.bindNativeSession(binding, reference);
  const snapshot = f.core.snapshot(f.thread);
  assert.equal(JSON.stringify(snapshot).includes(reference), false);
  assert.equal(Object.hasOwn(snapshot.runs[0]!, 'runtimeBindingId'), false);
  f.core.settle(binding, 'completed', settled); f.start('next'); const next = f.core.dispatchNext(); assert.ok(next);
  assert.equal(next.nativeSessionRef, reference);
  const db = new DatabaseSync(f.path); t.after(() => db.close());
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%message%'").all(), []);
  assert.equal(db.prepare('SELECT count(*) AS n FROM threads').get()?.n, 1);
});
test('cold fencing leaves current epoch intact; previous epoch approval is revoked on takeover', t => {
  const f = fixture(t); const binding = f.running(); const op = approve(f.core, binding);
  const before = f.core.snapshot(f.thread); f.core.fencePreviousHost(); assert.deepEqual(f.core.snapshot(f.thread), before);
  f.core.close(); const reopened = new ProductCore(f.path, f.workspaces); t.after(() => reopened.close());
  reopened.fencePreviousHost(); assert.equal(reopened.snapshot(f.thread).runs[0]!.state, 'unknown');
  assert.equal(reopened.snapshot(f.thread).operations[0]!.state, 'denied'); assert.throws(() => reopened.claimOperation(binding, op.id, hash), /stale_binding/);
});
test('native reference reservation cannot redirect pending operations or downgrade observed persistence', t => {
  const f = fixture(t); const binding = f.running(); const reference = join(f.dir, 'reserved.jsonl');
  f.core.bindNativeSession(binding, reference, false); assert.equal(f.core.nativeSessionReference(f.thread).persisted, false);
  f.core.bindNativeSession(binding, reference, true); f.core.bindNativeSession(binding, reference, false);
  assert.equal(f.core.nativeSessionReference(f.thread).persisted, true);
  approve(f.core, binding); assert.throws(() => f.core.bindNativeSession(binding, join(f.dir, 'other.jsonl'), false), /native_binding_busy/);
  assert.equal(f.core.nativeSessionReference(f.thread).reference, reference);
});
test('historical artifact recovery checks original operation identity and target before reusing committed metadata', t => {
  const f = fixture(t); const binding = f.running(); const op = approve(f.core, binding); const path = join(f.workspace, 'report.md');
  writeFileSync(path, '# SYNTHETIC report\n'); f.core.claimOperation(binding, op.id, hash); f.core.finishOperation(binding, op.id, 'succeeded', contentHash(path));
  const artifact = f.core.recordArtifact(binding, op.id, 'report.md'); f.core.recoverAfterCrash(); rmSync(path);
  assert.equal(f.core.reconcileArtifact(binding, op.id, 'report.md').id, artifact.id);
  assert.throws(() => f.core.reconcileArtifact({ ...binding, runtimeBindingId: 'unrelated' }, op.id, 'report.md'), /artifact_origin_mismatch/);
  assert.throws(() => f.core.reconcileArtifact({ ...binding, threadId: 'unrelated' }, op.id, 'report.md'), /artifact_origin_mismatch/);
  assert.throws(() => f.core.reconcileArtifact(binding, op.id, 'other.md'), /artifact_target_mismatch/);
  assert.throws(() => f.core.recordArtifact(binding, op.id, 'report.md'), /ENOENT/);
});

test('artifacts require actual bounded files and successful origin; versions detect changes and missing files', t => {
  const f = fixture(t); const binding = f.running(); const op = approve(f.core, binding); const path = join(f.workspace, 'report.md');
  writeFileSync(path, '# SYNTHETIC report\n');
  assert.throws(() => f.core.recordArtifact(binding, op.id, 'report.md'), /artifact_origin_mismatch/);
  f.core.claimOperation(binding, op.id, hash); f.core.finishOperation(binding, op.id, 'succeeded', contentHash(path));
  const first = f.core.recordArtifact(binding, op.id, 'report.md');
  assert.equal(first.version, 1); assert.equal(f.core.recordArtifact(binding, op.id, 'report.md').id, first.id);
  assert.deepEqual(f.core.previewArtifact(first.id), { status: 'ready', text: '# SYNTHETIC report\n' });
  writeFileSync(join(f.workspace, 'copy.md'), '# SYNTHETIC report\n');
  assert.throws(() => f.core.recordArtifact(binding, op.id, 'copy.md'), /artifact_target_mismatch/, 'Equal bytes do not prove an approved target');
  writeFileSync(path, '# SYNTHETIC external edit\n'); assert.deepEqual(f.core.previewArtifact(first.id), { status: 'changed' });
  assert.throws(() => f.core.recordArtifact(binding, op.id, 'report.md'), /artifact_content_mismatch/);
  const next = approve(f.core, binding, 'second-write'); f.core.claimOperation(binding, next.id, hash);
  writeFileSync(path, '# SYNTHETIC second operation\n');
  f.core.finishOperation(binding, next.id, 'succeeded', contentHash(path));
  const second = f.core.recordArtifact(binding, next.id, 'report.md'); assert.equal(second.version, 2); assert.notEqual(first.digest, second.digest);
  assert.throws(() => f.core.recordArtifact(binding, op.id, 'missing.md'), /ENOENT/);
  assert.throws(() => f.core.recordArtifact(binding, op.id, '../outside.md'), /outside_workspace/);
  rmSync(path); assert.deepEqual(f.core.previewArtifact(second.id), { status: 'missing' });
  assert.equal(f.core.snapshot(f.thread).artifacts.length, 2);
});

test('artifact preview rejects symbolic links, oversized content and binary data; text remains unrendered', t => {
  const f = fixture(t); const binding = f.running(); const op = approve(f.core, binding); f.core.claimOperation(binding, op.id, hash);
  const path = join(f.workspace, 'report.md'); writeFileSync(path, '<script>SYNTHETIC</script>');
  f.core.finishOperation(binding, op.id, 'succeeded', contentHash(path));
  const item = f.core.recordArtifact(binding, op.id, 'report.md');
  assert.equal(f.core.previewArtifact(item.id).text, '<script>SYNTHETIC</script>', 'Plain text contract is not HTML rendering');
  rmSync(path); renameSync(join(root!, 'product-symlink.md'), path);
  assert.deepEqual(f.core.previewArtifact(item.id), { status: 'unavailable' });
  rmSync(path); writeFileSync(path, Buffer.alloc(1024 * 1024 + 1)); assert.throws(() => f.core.recordArtifact(binding, op.id, 'report.md'), /unsupported_artifact/);
  writeFileSync(path, Buffer.from([0xff])); assert.throws(() => f.core.recordArtifact(binding, op.id, 'report.md'));
  assert.equal(readFileSync(join(root!, 'product-symlink-target.md'), 'utf8'), 'SYNTHETIC symlink target');
});

test('schema, workspace mapping and SQLite filesystem permission fail closed; close is idempotent', t => {
  const f = fixture(t); const other = join(f.dir, 'other'); mkdirSync(other);
  assert.throws(() => new ProductCore(f.path, [{ id: 'workspace', path: other }]), /workspace_mapping_changed/);
  const db = new DatabaseSync(f.path); db.exec('PRAGMA user_version=999'); db.close();
  assert.throws(() => new ProductCore(f.path, f.workspaces), /unsupported_database_version/);
  assert.throws(() => new DatabaseSync(join(dirname(process.env.PI_PROBE_DENIED_PATH!), 'synthetic.sqlite')), /unable to open database file/);
  f.core.close(); f.core.close(); assert.throws(() => f.start(), /closed/);
});
