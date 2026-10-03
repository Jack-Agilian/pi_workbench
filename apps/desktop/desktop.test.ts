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
import { ThreadPages } from './thread-pages.ts';
import type { HistoryPage, HistoryEntry, OperationPage, ArtifactPage } from '../../packages/app-contracts/desktop-pages.ts';
import type { ProductEvent } from '../../packages/app-contracts/index.ts';
import { HostClient } from './host-client.ts';
import { repository } from '../agent-server/worker-launcher.ts';
import { projectMessages } from '../../packages/pi-adapter/presentation.ts';
import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { digest, parametersDigest } from '../../packages/pi-adapter/controlled-tools.ts';
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
for(const permissionMode of ['auto','full'] as const)test(`desktop ${permissionMode} policy persists; automatic write uses the real Worker once and manual denial still prevents writes`, async () => {
  const f=fixture();let reopened:DesktopHost|undefined;
  try {
    const policy={type:'threads.permissions',requestId:'auto',threadId:f.thread,mode:permissionMode,expectedRevision:0};
    f.host.request({type:'command',command:policy});
    const start={...f.start,permissionRevision:1};
    const ack=f.host.request({type:'command',command:start}) as Ack;
    assert.deepEqual(f.host.request({type:'command',command:start}),ack);
    await until(()=>f.snapshot().runs[0]?.state==='completed','automatic-write');
    const snap=f.snapshot();assert.equal(snap.operations.length,1);assert.equal(snap.operations[0]!.approvalSource,permissionMode==='full'?'full-tools-v1':'workspace-tools-v1');
    assert.equal(snap.operations[0]!.state,'succeeded');assert.equal(snap.artifacts.length,1);
    const path=join(f.root,'workspace',snap.artifacts[0]!.path);const modified=statSync(path).mtimeMs;
    await f.host.close();reopened=new DesktopHost(f.root);
    assert.equal((reopened.request({type:'home'}) as DesktopHome).threads[0]!.permissionMode,permissionMode);
    assert.deepEqual(reopened.request({type:'command',command:start}),ack);assert.equal(statSync(path).mtimeMs,modified);
    reopened.request({type:'command',command:{...policy,requestId:'manual',mode:'manual',expectedRevision:1}});
    reopened.request({type:'command',command:{...f.start,requestId:'denied',permissionRevision:2}});
    const thread=()=>reopened!.request({type:'thread',threadId:f.thread}) as DesktopThread;
    await until(()=>thread().operations.some(o=>o.state==='pending'),'manual-after-auto');
    const op=thread().operations.find(o=>o.state==='pending')!;
    reopened.request({type:'command',command:{type:'approvals.resolve',requestId:'deny',operationId:op.id,parametersDigest:op.parametersDigest,decision:'deny'}});
    await until(()=>thread().runs.at(-1)?.state==='failed','denied-after-auto');
    assert.equal(existsSync(join(f.root,'workspace',op.artifactPath!)),false);
  } finally { await reopened?.close();await f.dispose(); }
});
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
    const scope = client.queryScope; assert.ok(!scope.includes(root));
    const command = { type: 'threads.create' as const, requestId: 'persisted-thread', workspaceId: 'demo-workspace', title: 'SYNTHETIC reconnect' };
    const ack = await client.request({ type: 'command', command }) as Ack;
    const run = await client.request({type:'command',command:{type:'runs.start',requestId:'q1-synthetic',threadId:ack.id,input:'SYNTHETIC Query IPC approval'}}) as Ack;
    await until(async()=> (await client.request({type:'thread',threadId:ack.id}) as DesktopThread).operations.some(op=>op.state==='pending'),'q1_pending');
    const port = {
      historyPage: async (threadId:string,p?:import('../../packages/app-contracts/desktop-pages.ts').PageOptions) => await client.request({type:'history-page',threadId,page:p}) as HistoryPage,
      historyEntry: async (threadId:string,runId:string) => await client.request({type:'history-entry',threadId,runId}) as HistoryEntry,
      artifactPage: async (threadId:string,p?:import('../../packages/app-contracts/desktop-pages.ts').PageOptions) => await client.request({type:'artifact-page',threadId,page:p}) as ArtifactPage,
      operationPage: async (runId:string,p?:import('../../packages/app-contracts/desktop-pages.ts').PageOptions,scope?:string) => await client.request({type:'operation-page',runId,page:p},scope) as OperationPage,
      events: async (threadId:string,cursor:number) => await client.request({type:'events',threadId,cursor}) as ProductEvent[],
    };
    const reader = new ThreadPages(port,ack.id,scope), initialStart = performance.now();
    const initial = await reader.refresh();const initialMs = performance.now()-initialStart;
    assert.equal(initial.operations.get(run.id)!.items[0]!.state,'pending'); reader.dispose();
    await client.reconnect(); assert.notEqual(client.processId, original); assert.throws(() => process.kill(original, 0));
    assert.notEqual(client.queryScope,scope);
    await assert.rejects(client.request({type:'operation-page',runId:run.id},scope),/disconnected/);
    const reopened = new ThreadPages(port,ack.id,client.queryScope), reopenStart = performance.now();
    const view = await reopened.refresh();const reopenMs = performance.now()-reopenStart;
    assert.equal(view.history.items.length,1);assert.equal(view.operations.get(run.id)!.items[0]!.state,'denied');
    reopened.dispose();console.log(JSON.stringify({q1RealIpc:true,initialMs,reopenMs,modelCalls:0}));
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
    const audit = new DatabaseSync(join(root, 'host/product.sqlite'), { readOnly: true });
    const cancellation = audit.prepare('SELECT cancel_requested AS requested FROM worker_launches').get()!.requested;
    audit.close();
    if (fault === 'missing-receipt') assert.equal(cancellation, 1);
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
    // SIGKILL may beat the shutdown intent's durable commit. Follow the real audit,
    // never infer an accepted cancellation from the client-side close call alone.
    assert.equal(snapshot.runs[0]!.state, cancellation === 1 ? 'cancelled' : 'failed'); assert.equal(snapshot.runs.length, 1);
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
    // Construct an abruptly stopped legacy database with no Worker launched. A graceful
    // DesktopHost.close now intentionally cancels queued work, which is not this fixture.
    f.host.core.close();
    const db = new DatabaseSync(join(f.root, 'host/product.sqlite'));
    db.exec('DROP TABLE run_native_ranges; ALTER TABLE threads DROP COLUMN title_revision; ALTER TABLE threads DROP COLUMN permission_mode; ALTER TABLE threads DROP COLUMN permission_revision; ALTER TABLE runs DROP COLUMN permission_mode; ALTER TABLE runs DROP COLUMN permission_revision; ALTER TABLE approvals DROP COLUMN source; DROP TABLE desktop_workspace; DROP TABLE model_shell_operations; DROP TABLE file_operations; DROP TABLE model_policy_revisions; DROP TABLE model_requests; DROP TABLE model_outcomes; DROP TABLE shell_display; DROP TABLE run_display; PRAGMA user_version=3;'); db.close();
    const reopened = new DesktopHost(f.root);
    try {
      const restored = reopened.request({ type: 'thread', threadId: f.thread }) as DesktopThread;
      assert.deepEqual(restored, original); assert.deepEqual(reopened.core.nativeSessionReference(f.thread), native);
    } finally { await reopened.close(); }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('desktop shutdown settles queued work and real fixed descendants without changing existing tool/guardian ownership', async () => {
  const f = fixture();
  try {
    f.host.core.handle(f.start);
    const args = { path: 'descendants.md', content: '# SYNTHETIC descendants\n' };
    const entry = join(repository, 'apps/agent-server/tests/worker-fixture.ts');
    const descendants = join(repository, 'apps/agent-server/tests/descendant-fixture.mjs');
    const completion = f.host.supervisor.startNext({ tool: 'write', target: args.path, parametersDigest: parametersDigest(args), fileVersion: null,
      expectedContentDigest: digest(args.content), deadline: Date.now() + 30000 }, { path: entry, extraRead: [entry, descendants], allowFixedChildren: true,
      args: [JSON.stringify({ mode: 'descendants', database: join(f.root, 'host/product.sqlite'), tool: 'write', args })] });
    assert.ok(completion);
    await until(() => f.snapshot().operations.length === 1, 'descendant_approval');
    const op = f.snapshot().operations[0]!;
    f.host.supervisor.command({ type: 'approvals.resolve', requestId: 'approve-descendants', operationId: op.id, parametersDigest: op.parametersDigest, decision: 'allow' });
    const workspace = join(f.root, 'workspace');
    await until(() => existsSync(join(workspace, '.worker-stage')) && readFileSync(join(workspace, '.worker-stage'), 'utf8') === 'descendants', 'fixed_descendants');
    f.host.core.handle({ ...f.start, requestId: 'queued' });
    const pids = [f.host.supervisor.workerPid!, f.host.supervisor.guardianPid!, ...['fixed-parent','fixed-child'].map(role => Number(readFileSync(join(workspace, role + '.pid'), 'utf8')))];
    const close = f.host.close(); assert.equal(f.host.close(), close); await close; await completion;
    for (const pid of pids) assert.throws(() => process.kill(pid, 0));
    assert.equal(existsSync(join(workspace, 'port-denied')), true); assert.equal(existsSync(join(workspace, 'unexpected-port')), false);
    const heartbeat = ['fixed-parent','fixed-child'].map(role => readFileSync(join(workspace, role + '.heartbeat'), 'utf8'));
    await new Promise<void>(resolve => setTimeout(resolve, 100));
    assert.deepEqual(['fixed-parent','fixed-child'].map(role => readFileSync(join(workspace, role + '.heartbeat'), 'utf8')), heartbeat);
    const reopened = new DesktopHost(f.root);
    try {
      const view = reopened.request({ type: 'thread', threadId: f.thread }) as DesktopThread;
      assert.equal(view.runs.length, 2); assert.ok(view.runs.every(run => run.state === 'cancelled'));
      assert.equal(view.operations.length, 1); assert.equal(view.operations[0]!.state, 'failed');
      assert.equal(view.artifacts.length, 0); assert.equal(existsSync(join(workspace, args.path)), false);
      assert.equal(reopened.core.workerLaunches().length, 1);
    } finally { await reopened.close(); }
  } finally { await f.dispose(); }
});
test('model config missing blocks Run; ephemeral credential is absent from DTO/SQLite and lost on reconnect',async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'m1-config-')));
 const host=new DesktopHost(root,{mode:'live'});
 try{const thread=host.request({type:'command',command:{type:'threads.create',requestId:'thread',workspaceId:'demo-workspace',title:'SYNTHETIC'}}) as Ack;
 assert.equal((host.request({type:'home'}) as DesktopHome).model?.status,'not_configured');
 assert.throws(()=>host.setModelKey('SYNTHETIC_ONLY'));
 assert.throws(()=>host.request({type:'command',command:{type:'runs.start',requestId:'unconfigured',threadId:thread.id,input:'SYNTHETIC'}}));
 assert.equal(host.core.snapshot(thread.id).runs.length,0);
 }finally{await host.close();}
 const config={version:1 as const,authorizationId:'synthetic-config',approved:true,dataScope:'synthetic_non_sensitive' as const,provider:'anthropic',model:'claude-sonnet-4-5',endpoint:'https://api.anthropic.com',maxRequests:1,maxOutputTokens:64,timeoutMs:5000,maxEstimatedCostUsd:5};
 const configuration=join(root,'test-model.json'); const {writeFileSync}=await import('node:fs');writeFileSync(configuration,JSON.stringify(config),{mode:0o600});
 const client=new HostClient(process.execPath,repository,root,'--model',configuration,true);
 const secret='SYNTHETIC_EPHEMERAL_KEY_NOT_REAL';
 try{await client.connect();assert.equal((await client.request({type:'home'}) as DesktopHome).model?.status,'key_required');await client.setModelKey(secret);
 const ready=await client.request({type:'home'}) as DesktopHome;assert.equal(ready.model?.status,'ready');assert.equal(JSON.stringify(ready).includes(secret),false);
 await client.reconnect();assert.equal((await client.request({type:'home'}) as DesktopHome).model?.status,'key_required');
 assert.equal(readFileSync(join(root,'host/product.sqlite')).includes(Buffer.from(secret)),false);
 }finally{await client.close();rmSync(root,{recursive:true,force:true});}
});
test('native credential file selection rejects repository files, public modes and symlinks',async()=>{
 const {writeFileSync,chmodSync,symlinkSync}=await import('node:fs');const {useModelCredentialFile}=await import('./model-credential.ts');
 const root=realpathSync(mkdtempSync(join(tmpdir(),'m1-key-')));const repo=join(root,'repository');mkdirSync(repo);let accepted=0;
 const path=join(root,'synthetic.key');writeFileSync(path,'SYNTHETIC_ONLY\n',{mode:0o600});
 try{await useModelCredentialFile(path,repo,async key=>{assert.equal(key,'SYNTHETIC_ONLY');accepted++;});chmodSync(path,0o644);await assert.rejects(useModelCredentialFile(path,repo,async()=>{accepted++;}));chmodSync(path,0o600);
 symlinkSync(path,join(root,'link.key'));await assert.rejects(useModelCredentialFile(join(root,'link.key'),repo,async()=>{accepted++;}));
 const inRepo=join(repo,'bad.key');writeFileSync(inRepo,'SYNTHETIC_ONLY',{mode:0o600});await assert.rejects(useModelCredentialFile(inRepo,repo,async()=>{accepted++;}));assert.equal(accepted,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});

import './model-credentials.test.ts';

test('workspace selection is trusted host-only, durable and never remaps an existing Thread',async()=>{
 const profile=realpathSync(mkdtempSync(join(tmpdir(),'workspace-profile-')));const selected=realpathSync(mkdtempSync(join(tmpdir(),'SYNTHETIC-selected-')));
 let host=new DesktopHost(profile,{mode:'offline',fileTools:{maxOperations:4,maxModelRequests:4,operationTimeoutMs:10000}});
 try{
  assert.throws(()=>parseDesktopRequest({type:'workspace',path:selected}));assert.throws(()=>parseDesktopRequest({type:'home',workspace:selected}));
  const old=host.core.handle({type:'threads.create',requestId:'old-thread',workspaceId:'demo-workspace',title:'old'}).id;
  for(const path of [profile,join(profile,'host'),tmpdir()])assert.throws(()=>host.selectWorkspace(path),/overlaps_host/);
  host.selectWorkspace(selected);const home=host.request({type:'home'}) as DesktopHome;assert.notEqual(home.workspaces.selectedId,'demo-workspace');
  host.selectWorkspace(selected);assert.equal((host.request({type:'home'}) as DesktopHome).workspaces.items.length,2);
  const thread=host.core.handle({type:'threads.create',requestId:'new-thread',workspaceId:home.workspaces.selectedId,title:'SYNTHETIC chosen'}).id;
  assert.equal(host.core.snapshot(old).thread.workspaceId,'demo-workspace');assert.equal(host.core.workspacePath(host.core.snapshot(thread).thread.workspaceId),selected);
  const run=host.core.handle({type:'runs.start',requestId:'pending-selected',threadId:thread,input:'SYNTHETIC queued'}).id;
  assert.throws(()=>host.selectWorkspace(selected),/workspace_busy/);host.core.handle({type:'runs.cancel',requestId:'cancel-pending',runId:run});
  await host.close();host=new DesktopHost(profile);assert.equal((host.request({type:'home'}) as DesktopHome).workspaces.selectedId,home.workspaces.selectedId);
  assert.equal(host.core.snapshot(thread).thread.workspaceId,home.workspaces.selectedId);
 }finally{await host.close();rmSync(profile,{recursive:true,force:true});rmSync(selected,{recursive:true,force:true});}
});

import { modelErrorText } from './model-error-view.ts';
import { parseModelOutcome } from '../../packages/app-contracts/model.ts';
test('model error display uses only closed status/code, distinguishes legacy and does not invent upstream codes',()=>{
 const legacy={reason:'provider_error',inputTokens:0,outputTokens:0,estimatedCostUsd:0,synthetic:true};
 assert.deepEqual(parseModelOutcome(legacy),legacy);assert.match(modelErrorText(undefined),/未保存错误详情/);
 assert.match(modelErrorText({httpStatus:403}),/HTTP 403.*具体原因未确认/);assert.doesNotMatch(modelErrorText({httpStatus:401}),/invalid_api_key/);
 assert.match(modelErrorText({httpStatus:429,code:'insufficient_quota'}),/HTTP 429.*上游错误码 insufficient_quota.*额度/);
 assert.match(modelErrorText({code:'server_error'}),/上游错误码 server_error/);assert.doesNotMatch(modelErrorText({code:'server_error'}),/HTTP/);
 assert.match(modelErrorText({}),/未取得可确认的上游错误信息/);assert.doesNotMatch(modelErrorText({}),/服务请求失败|HTTP \d/);
 for(const error of [{httpStatus:200},{httpStatus:'403'},{code:'secret-canary'},{message:'<script>bad</script>'},{code:['invalid_api_key']},{httpStatus:403,raw:'secret'}])assert.throws(()=>parseModelOutcome({...legacy,error}));
 assert.throws(()=>parseModelOutcome({...legacy,reason:'stop',error:{}}));
});

test('renaming queued or active desktop threads never dispatches/rebinds work or affects approvals; title survives reopen',async()=>{
  const f=fixture();let reopened:DesktopHost|undefined;
  try {
    f.host.core.handle(f.start); // Persisted intent without calling the product pump.
    f.host.request({type:'command',command:{type:'threads.rename',requestId:'queued-title',threadId:f.thread,title:'SYNTHETIC queued rename',expectedRevision:0}});
    assert.equal(f.snapshot().runs[0]!.state,'queued');assert.equal(f.host.core.workerLaunches().length,0);
    f.host.pump();await until(()=>f.snapshot().operations.some(o=>o.state==='pending'),'rename-pending');
    const before=f.snapshot(),native=f.host.core.nativeSessionReference(f.thread),launches=f.host.core.workerLaunches();
    const cmd={type:'threads.rename',requestId:'active-title',threadId:f.thread,title:'SYNTHETIC active rename',expectedRevision:1};
    f.host.request({type:'command',command:cmd});f.host.request({type:'command',command:cmd});
    assert.deepEqual(f.snapshot().operations,before.operations);assert.deepEqual(f.snapshot().runs,before.runs);assert.deepEqual(f.host.core.workerLaunches(),launches);assert.deepEqual(f.host.core.nativeSessionReference(f.thread),native);
    const op=before.operations[0]!;f.host.request({type:'command',command:{type:'approvals.resolve',requestId:'rename-deny',operationId:op.id,parametersDigest:op.parametersDigest,decision:'deny'}});
    await until(()=>f.snapshot().runs[0]!.state==='failed','rename-denied');
    await f.host.close();reopened=new DesktopHost(f.root);
    assert.equal((reopened.request({type:'thread',threadId:f.thread}) as DesktopThread).thread.titleRevision,2);
    assert.equal((reopened.request({type:'home'}) as DesktopHome).threads[0]!.title,'SYNTHETIC active rename');
    assert.equal((reopened.request({type:'thread',threadId:f.thread}) as DesktopThread).artifacts.length,0);
  }finally{await reopened?.close();await f.dispose();}
});
