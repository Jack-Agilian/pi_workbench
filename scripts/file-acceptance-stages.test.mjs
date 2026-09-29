import test from 'node:test';
import assert from 'node:assert/strict';
import { runAcceptance, inScope } from './file-acceptance-stages.mjs';
// SYNTHETIC product port: tests driver decisions/idempotency, not a model or OS process.
function fixture(fault) {
  const plan = { attempt: 'synthetic', relativeRoot: 'm2-c-synthetic', inputDigest: 'seed',
    perRunRequestLimit: 4, timeoutMs: 100, fileTools: { maxOperations: 6, operationTimeoutMs: 100 } };
  const result = { stages: [] }, commands = [], saved = []; let stage, decisions = [], polls = 0;
  const tools = () => stage === 'normal' ? ['read', 'write', 'edit'] : stage === 'resume' ? [] : ['write'];
  const target = tool => `${plan.relativeRoot}/${stage === 'normal' ? (tool === 'read' ? 'source' : 'summary') : (stage === 'deny' ? 'refused' : 'cancelled')}.md`;
  const ops = () => tools().map((tool, i) => ({ id: `op-${i}`, runId: stage, tool, parametersDigest: 'digest',
    artifactPath: fault === 'outside' ? 'unapproved.md' : target(tool), file: { preview: 'SYNTHETIC' },
    state: decisions[i] ? stage === 'normal' ? 'succeeded' : 'denied' : 'pending' }));
  const client = { async reconnect() { commands.push({ type: 'reconnect' }); }, async request(r) {
    if (r.type === 'home') return { recovery: 'ready', model: { status: 'ready' }, activeRuns: [] };
    if (r.type === 'command') {
      commands.push(r.command);
      if (r.command.type === 'threads.create') return { id: `thread-${stage}` };
      if (r.command.type === 'runs.start') { if (fault === 'lost-ack') throw new Error('disconnected'); return { id: stage }; }
      decisions.push(r.command.type === 'runs.cancel' ? 'cancel' : r.command.decision); return { id: 'ack' };
    }
    polls++; const finished = decisions.length === tools().length;
    const state = fault === 'unknown' ? 'unknown' : fault === 'fast-cancel' && stage === 'cancel' ? 'completed' : !finished ? 'running' : stage === 'deny' ? 'failed' : stage === 'cancel' ? 'cancelled' : 'completed';
    return { runs: [{ id: stage, state }], operations: ops(),
      presentations: [{ runId: stage, value: { messages: [{ role: 'assistant', text: 'amber-m2-29 10' }] } }] };
  } };
  const options = { client, plan, result,
    save: async () => saved.push(structuredClone(result)),
    beforeStage: async s => { stage = s; decisions = []; },
    decide: async () => stage === 'normal' ? 'allow' : stage === 'deny' ? 'deny' : 'cancel',
    capture: async () => ({ operations: ops(), requests: [{ request_seq: 1 }],
      nativeRef: fault === 'wrong-session' && stage === 'resume' ? 'wrong' : 'native', nativePersisted: true }),
    file: async name => name === 'source.md' ? { digest: 'seed' } : name === 'summary.md' ? {
      digest: 'summary', mtimeNs: fault === 'changed-summary' && stage === 'resume' ? '2' : '1' } : null,
    text: async () => 'Status: FINAL\n3 items; total 10; marker amber-m2-29', pause: async () => {} };
  return { options, commands, saved, result, polls: () => polls };
}
test('M2 driver four stages use independent negative Threads and preserve original resume identity', async () => {
  const f = fixture(); await runAcceptance(f.options);
  assert.equal(f.result.stages.length, 4); assert.ok(f.result.stages.every(s => s.passed));
  assert.deepEqual(f.commands.filter(c => c.type === 'runs.start').map(c => c.threadId),
    ['thread-normal', 'thread-deny', 'thread-cancel', 'thread-normal']);
  assert.equal(f.commands.filter(c => c.type === 'approvals.resolve' && c.decision === 'allow').length, 3);
  assert.equal(f.commands.filter(c => c.type === 'runs.cancel').length, 1);
  const early = f.saved.find(s => s.stages[0]?.state === 'dispatching');
  assert.equal(early.stages[0].requestId, 'file-synthetic-normal'); assert.equal(early.stages[0].runId, undefined);
  const count = f.commands.length; await assert.rejects(runAcceptance(f.options), /attempt_already_started/);
  assert.equal(f.commands.length, count, 'No re-dispatch after ambiguous or finished attempts');
});
for (const fault of ['outside', 'unknown', 'lost-ack', 'fast-cancel', 'wrong-session', 'changed-summary']) {
  test(`M2 driver ${fault} stops, preserves records and does not silently retry`, async () => {
    const f = fixture(fault); await assert.rejects(runAcceptance(f.options));
    assert.equal(f.result.stages.at(-1).passed, undefined);
    const ids = f.commands.filter(c => c.type === 'runs.start').map(c => c.requestId);
    assert.equal(new Set(ids).size, ids.length); assert.ok(f.saved.length);
  });
}
