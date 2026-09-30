import assert from 'node:assert/strict';
import test from 'node:test';
import { focusManager, onlineManager, QueryObserver } from '@tanstack/react-query';
import { OperationQueries } from './operation-queries.ts';
import type { OperationPage } from '../../packages/app-contracts/desktop-pages.ts';

const page = (id: string, more = false): OperationPage => ({items: [{id, runId: 'run', toolCallId: 'SYNTHETIC',
  tool: 'write', artifactPath: null, parametersDigest: '0'.repeat(64), deadline: 1, state: 'denied'}],
  snapshotSeq: 1, hasMore: more, nextCursor: more ? 'opaque-position' : null});
const tick = () => new Promise<void>(r => setImmediate(r));
const check = () => {};

test('Query: concurrent same-range reads deduplicate, expose loading, reuse cache and unsubscribe', async () => {
  let calls = 0, changes = 0; let release!: (p: OperationPage) => void;
  const queries = new OperationQueries({async operationPage() { calls++; return new Promise(r => { release = r; }); }}, 'host', 'thread');
  const key = queries.key('run', 1); const unsubscribe = queries.subscribe(() => changes++);
  try {
    const a = queries.read(key, undefined, false, check), b = queries.read([...key], undefined, false, check);
    assert.equal(calls, 1); assert.equal(queries.busy(), true);
    release(page('first')); await Promise.all([a, b]);
    await queries.read(key, undefined, false, check); assert.equal(calls, 1);
    assert.equal(queries.busy(), false); assert.ok(changes > 0);
    queries.retain([[...key]]); assert.equal(queries.page(key).items[0]!.id, 'first');
    unsubscribe(); const previous = changes; queries.dispose(); assert.equal(changes, previous);
  } finally { unsubscribe(); queries.dispose(); }
});

test('Query: local reads work offline; focus, reconnect and remount never silently refetch or retry errors', async () => {
  let calls = 0, fail = false;
  const queries = new OperationQueries({async operationPage() { calls++; if (fail) throw Error('page_item_too_large'); return page('offline'); }}, 'host', 'thread');
  queries.client.mount(); onlineManager.setOnline(false);
  const key = queries.key('run', 1); let stop = () => {};
  try {
    await queries.read(key, undefined, false, check); assert.equal(calls, 1);
    const observer = new QueryObserver(queries.client, {queryKey: key}); stop = observer.subscribe(() => {});
    await queries.client.invalidateQueries({queryKey: key, refetchType: 'none'});
    focusManager.setFocused(false); focusManager.setFocused(true); onlineManager.setOnline(true); await tick();
    assert.equal(calls, 1); stop(); stop = observer.subscribe(() => {}); await tick(); assert.equal(calls, 1);
    fail = true; const bad = queries.key('run', 2);
    await assert.rejects(queries.read(bad, key, false, check), /page_item_too_large/);
    assert.equal(calls, 2); assert.equal(queries.error(), 'page_item_too_large');
    await tick(); assert.equal(calls, 2); assert.equal(queries.page(key).items[0]!.id, 'offline');
    fail = false; await queries.read(bad, key, false, check); assert.equal(calls, 3);
    queries.retain([bad]); assert.equal(queries.error(), '');
  } finally { stop(); queries.client.unmount(); queries.dispose(); onlineManager.setOnline(true); focusManager.setFocused(undefined); }
});

test('Query: host/environment replacement with identical Thread/Run IDs isolates late data and forbids next page after cancellation', async () => {
  let calls = 0; let release!: (p: OperationPage) => void;
  const old = new OperationQueries({async operationPage(_id, _p, scope) {
    assert.equal(scope, 'old'); calls++; return new Promise(r => { release = r; });
  }}, 'old', 'thread');
  const next = new OperationQueries({async operationPage(_id, _p, scope) { assert.equal(scope, 'new'); return page('new'); }}, 'new', 'thread');
  const initial = old.key('run', 1); old.client.setQueryData(initial, page('oldest'));
  const pending = old.read(old.key('run', 2), initial, false, check);
  const rejected = assert.rejects(pending);
  old.dispose(); await next.read(next.key('run', 1), undefined, false, check);
  release(page('late', true)); await rejected; await tick();
  assert.equal(calls, 1); assert.equal(old.client.getQueryCache().getAll().length, 0);
  assert.equal(next.page(next.key('run', 1)).items[0]!.id, 'new'); next.dispose();
});
