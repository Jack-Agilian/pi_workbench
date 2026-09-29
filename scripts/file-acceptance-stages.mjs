// Explicit acceptance orchestration through existing product commands, never a tool/Agent implementation.
import assert from 'node:assert/strict';
export const stages = ['normal', 'deny', 'cancel', 'resume'];
export function stagePrompt(stage, root) {
  if (stage === 'normal') return `This is a synthetic, non-sensitive file acceptance task. Use only ${root}/source.md and ${root}/summary.md. Read source.md. Write a short summary.md with the item count, numerical sum, and marker from the source, with status DRAFT. Then use edit to change DRAFT to FINAL. Do not modify source.md. Each tool needs human approval. Finally state the result briefly. Do not use any other file or tool.`;
  if (stage === 'deny') return `Synthetic refusal check. Request write of ${root}/refused.md containing a short SYNTHETIC note. Wait for approval; never retry a refusal or access any other file.`;
  if (stage === 'cancel') return `Synthetic cancellation check. Request write of ${root}/cancelled.md containing a short SYNTHETIC note. Wait for approval; do not access any other file.`;
  return 'Without calling any tool or reading any file, recall the synthetic marker and numerical sum from the preceding successful file task. Reply briefly using the same conversation context.';
}
export function inScope(stage, op, root) {
  if (!op.file) return false;
  if (stage === 'normal') return op.artifactPath === `${root}/source.md` && op.tool === 'read' ||
    op.artifactPath === `${root}/summary.md` && ['read', 'write', 'edit'].includes(op.tool);
  return stage !== 'resume' && op.tool === 'write' && op.artifactPath === `${root}/${stage === 'deny' ? 'refused' : 'cancelled'}.md`;
}
const terminal = new Set(['completed', 'failed', 'cancelled', 'unknown']);
export async function runAcceptance({ client, plan, result, save, decide, beforeStage, capture,
  file, text, pause = () => new Promise(r => setTimeout(r, 100)) }) {
  assert.equal(result.stages.length, 0, 'attempt_already_started');
  const root = plan.relativeRoot;
  let normalThread, normalNative, summaryState;
  for (const stage of stages) {
    await beforeStage(stage);
    if (stage === 'resume') { await client.reconnect(); result.reconnected = true; await save(); }
    const home = await client.request({ type: 'home' });
    assert.equal(home.recovery, 'ready'); assert.equal(home.model?.status, 'ready');
    assert.equal(home.activeRuns.length, 0);
    const record = { stage, requestId: `file-${plan.attempt}-${stage}`, state: 'preparing', decisions: [] };
    result.stages.push(record); await save();
    if (stage === 'resume') record.threadId = normalThread;
    else {
      record.createRequestId = `file-${plan.attempt}-thread-${stage}`; await save();
      const ack = await client.request({ type: 'command', command: { type: 'threads.create',
        requestId: record.createRequestId, workspaceId: 'demo-workspace', title: `SYNTHETIC M2 ${stage} ${plan.attempt}` } });
      record.threadId = ack.id;
    }
    if (stage === 'normal') normalThread = record.threadId;
    record.state = 'dispatching'; await save();
    const ack = await client.request({ type: 'command', command: { type: 'runs.start',
      requestId: record.requestId, threadId: record.threadId, input: stagePrompt(stage, root) } });
    record.runId = ack.id; record.state = 'waiting'; await save();
    const deadline = Date.now() + 25000 + plan.perRunRequestLimit * (plan.timeoutMs + 1000) +
      plan.fileTools.maxOperations * (plan.fileTools.operationTimeoutMs + 1000);
    const decided = new Set(); let snapshot, run;
    while (Date.now() < deadline) {
      snapshot = await client.request({ type: 'thread', threadId: record.threadId });
      run = snapshot.runs.find(r => r.id === record.runId);
      if (run && terminal.has(run.state)) break;
      for (const op of snapshot.operations.filter(o => o.runId === record.runId && o.state === 'pending')) {
        if (decided.has(op.id)) continue;
        const allowed = inScope(stage, op, root);
        const choice = allowed ? await decide({ stage, op }) : 'deny';
        assert.ok(['allow', 'deny', 'cancel'].includes(choice), 'invalid_human_decision');
        if (stage === 'deny') assert.equal(choice, 'deny', 'refusal_stage_requires_deny');
        if (stage === 'cancel') assert.equal(choice, 'cancel', 'cancellation_stage_requires_cancel');
        const decision = { operationId: op.id, parametersDigest: op.parametersDigest, tool: op.tool,
          path: op.artifactPath, choice, requestId: `file-${plan.attempt}-${stage}-decision-${decided.size}` };
        record.decisions.push(decision); decided.add(op.id); await save();
        await client.request({ type: 'command', command: choice === 'cancel' ? {
          type: 'runs.cancel', requestId: decision.requestId, runId: record.runId,
        } : { type: 'approvals.resolve', requestId: decision.requestId, operationId: op.id,
          parametersDigest: op.parametersDigest, decision: choice } });
        if (!allowed) throw new Error('unexpected_file_scope');
      }
      await pause();
    }
    assert.ok(run && terminal.has(run.state), 'validation_deadline');
    record.state = run.state;
    record.assistant = snapshot.presentations.find(p => p.runId === record.runId)?.value.messages.filter(m => m.role === 'assistant').at(-1)?.text ?? '';
    record.evidence = await capture(record.runId); await save();
    assert.equal(run.state, stage === 'deny' ? 'failed' : stage === 'cancel' ? 'cancelled' : 'completed');
    const ops = record.evidence.operations;
    assert.equal((await file('source.md'))?.digest, plan.inputDigest, 'source_changed');
    assert.equal(await file('refused.md'), null, 'refused_file_exists');
    assert.equal(await file('cancelled.md'), null, 'cancelled_file_exists');
    if (stage === 'normal') {
      for (const tool of ['read', 'write', 'edit']) assert.ok(ops.some(o => o.tool === tool && o.state === 'succeeded' && (o.artifact_path ?? o.artifactPath) === `${root}/${tool === 'read' ? 'source' : 'summary'}.md`), 'missing_model_selected_tool');
      assert.ok(ops.every(o => o.state === 'succeeded'), 'operation_not_successful');
      const body = await text('summary.md');
      assert.match(body, /\bFINAL\b/); assert.doesNotMatch(body, /\bDRAFT\b/);
      assert.match(body, /\b3\b/); assert.match(body, /\b10\b/); assert.match(body, /amber-m2-29/);
      normalNative = record.evidence.nativeRef; assert.ok(record.evidence.nativePersisted && normalNative);
      summaryState = await file('summary.md'); record.summary = summaryState;
    } else if (stage === 'resume') {
      assert.equal(ops.length, 0, 'resume_replayed_file_operation');
      assert.equal(record.evidence.nativeRef, normalNative, 'native_session_changed');
      assert.match(record.assistant, /amber-m2-29/); assert.match(record.assistant, /\b10\b/);
      assert.deepEqual(await file('summary.md'), summaryState, 'resume_modified_summary');
    } else {
      assert.ok(ops.length === 1 && ops[0].state === 'denied', 'negative_stage_not_proven');
      assert.equal(record.evidence.requests.length, 1, 'negative_stage_extra_model_request');
      assert.ok(record.decisions.some(d => d.choice === (stage === 'deny' ? 'deny' : 'cancel')));
      assert.deepEqual(await file('summary.md'), summaryState, 'negative_stage_modified_summary');
    }
    record.passed = true; await save();
  }
}
