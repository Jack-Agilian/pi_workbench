import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createScenario } from '../apps/agent-server/tests/scenario.ts';
import { syntheticReply } from '../apps/agent-server/tests/file-agent-fixture.ts';
import { repository } from '../apps/agent-server/worker-launcher.ts';
import { parseModelConfiguration } from '../packages/app-contracts/model.ts';
import { runAcceptance } from './file-acceptance-stages.mjs';
import { fileState, runEvidence, seed, hash } from './file-acceptance-plan.mjs';
test('M2 validation stages through actual Pi/Worker/SQLite with SYNTHETIC HTTP and human-decision port', async () => {
  const f = createScenario(); let stage, calls = 0, stageCalls = 0, completion;
  const root = 'm2-c-synthetic-integration';
  mkdirSync(join(f.cwd, root)); writeFileSync(join(f.cwd, root, 'source.md'), seed);
  f.supervisor.command({ type: 'runs.cancel', requestId: 'cancel-fixture', runId: f.run });
  const model = { mode: 'live', provider: 'openai', model: 'SYNTHETIC-validation', endpoint: 'https://example.invalid/v1',
    maxOutputTokens: 512, timeoutMs: 5000, openai: { api: 'chat-completions', contextWindow: 8192, inputUsdPerMillion: 1, outputUsdPerMillion: 1 },
    fileTools: { maxOperations: 6, maxModelRequests: 4, operationTimeoutMs: 10000 } };
  const { mode: _mode, ...fields } = model;
  const config = parseModelConfiguration({ version: 1, authorizationId: 'SYNTHETIC-validation-new', approved: true,
    dataScope: 'synthetic_non_sensitive', ...fields, maxRequests: 8, maxEstimatedCostUsd: 1 });
  const draft = 'Status: DRAFT\n3 items; total 10; marker amber-m2-29\n';
  const fetch = async () => {
    calls++; stageCalls++; let tools = [];
    if (stage === 'normal') {
      if (stageCalls === 1) tools = [{ tool: 'read', parameters: { path: `${root}/source.md` } }];
      if (stageCalls === 2) tools = [
        { tool: 'write', parameters: { path: `${root}/summary.md`, content: draft } },
        { tool: 'edit', parameters: { path: `${root}/summary.md`, edits: [{ oldText: 'DRAFT', newText: 'FINAL' }] } },
      ];
    } else if (stage === 'deny' || stage === 'cancel') tools = [{ tool: 'write', parameters: {
      path: `${root}/${stage === 'deny' ? 'refused' : 'cancelled'}.md`, content: 'SYNTHETIC forbidden result' } }];
    return new Response(syntheticReply('chat-completions', calls, tools, 'SYNTHETIC amber-m2-29 total 10'),
      { headers: { 'content-type': 'text/event-stream' } });
  };
  // Test-only product port. Real Pi SDK and restricted Worker; not an Electron/HostClient claim.
  const client = {
    async reconnect() { await completion; await f.supervisor.close(); f.reopen(); f.supervisor.recover(); },
    async request(r) {
      if (r.type === 'home') return { recovery: 'ready', model: { status: 'ready' }, activeRuns: [] };
      if (r.type === 'command') {
        const command = { ...r.command };
        if (command.type === 'threads.create') command.workspaceId = 'workspace';
        const ack = f.supervisor.command(command);
        if (command.type === 'runs.start') {
          completion = f.supervisor.startNext({ tool: 'none', model, deadline: Date.now() + 60000 },
            { path: join(repository, 'packages/pi-adapter/model-worker.ts') },
            { key: 'SYNTHETIC_VALIDATOR_KEY', configuration: config, requestUrl: model.endpoint + '/chat/completions', reserveCostUsd: 0.01, fetch });
          void completion.catch(() => {});
        }
        return ack;
      }
      const snap = f.core.snapshot(r.threadId);
      return { ...snap, presentations: snap.runs.map(run => ({ runId: run.id, value: f.core.presentation(run.id) })) };
    },
  };
  const plan = { attempt: 'synthetic-integration', relativeRoot: root, inputDigest: hash(seed),
    perRunRequestLimit: 4, timeoutMs: 5000, fileTools: model.fileTools };
  const result = { stages: [] }, saved = [];
  try {
    await runAcceptance({ client, plan, result, save: async () => saved.push(structuredClone(result)),
      beforeStage: async s => { await completion; stage = s; stageCalls = 0; },
      decide: async ({ stage }) => stage === 'normal' ? 'allow' : stage === 'deny' ? 'deny' : 'cancel',
      capture: async runId => { await completion; return runEvidence(f.root, runId); },
      file: async name => existsSync(join(f.cwd, root, name)) ? fileState(f.root, `${root}/${name}`) : null,
      text: async name => readFileSync(join(f.cwd, root, name), 'utf8') });
    assert.ok(result.stages.every(s => s.passed)); assert.equal(calls, 6);
    assert.equal(f.core.modelAdmission(config, 0.01).used, 6);
    assert.deepEqual(result.stages.map(s => s.evidence.requests.length), [3, 1, 1, 1]);
    assert.equal(JSON.stringify(saved).includes('SYNTHETIC_VALIDATOR_KEY'), false);
  } finally { await completion; await f.dispose(); }
});
