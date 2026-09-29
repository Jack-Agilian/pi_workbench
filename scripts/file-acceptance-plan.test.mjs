import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProductCore } from '../apps/agent-server/core.ts';
import { acceptancePaths, buildPlan, auditLedger, resultPath, seed, hash } from './file-acceptance-plan.mjs';
const config = { version: 1, authorizationId: 'SYNTHETIC-new-grant', approved: true, dataScope: 'synthetic_non_sensitive',
  provider: 'openai', model: 'SYNTHETIC', endpoint: 'https://example.invalid/v1', maxRequests: 8, maxOutputTokens: 512,
  timeoutMs: 1800000, httpIdleTimeoutMs: 300000, maxEstimatedCostUsd: 1,
  fileTools: { maxOperations: 6, maxModelRequests: 4, operationTimeoutMs: 300000 } };
function setup() {
  const profile = realpathSync(mkdtempSync(join(tmpdir(), 'm2-validator-plan-')));
  mkdirSync(join(profile, 'host')); mkdirSync(join(profile, 'workspace'));
  const core = new ProductCore(join(profile, 'host/product.sqlite'), [{ id: 'demo-workspace', path: join(profile, 'workspace') }]);
  // Real temporary SQL ledger, explicitly synthetic host completion; no model/provider or process proof.
  const threadId = core.handle({ type: 'threads.create', requestId: 'old-thread', workspaceId: 'demo-workspace', title: 'SYNTHETIC old' }).id;
  const old = { ...config, authorizationId: 'SYNTHETIC-old-grant', maxRequests: 4, fileTools: undefined }; delete old.fileTools;
  for (let i = 0; i < 4; i++) {
    core.handle({ type: 'runs.start', requestId: `old-${i}`, threadId, input: 'SYNTHETIC history' });
    const b = core.dispatchNext(); core.markRunning(b); core.reserveConfiguredModelRequest(b, old, 0.01);
    core.settle(b, 'completed', { piIdle: true, hostClean: true });
  }
  core.close();
  const options = { profile, attempt: 'synthetic-attempt', config, reserve: 0.1, commit: 'a'.repeat(40) };
  return { profile, options, dispose: () => rmSync(profile, { recursive: true, force: true }) };
}
test('M2 validator planning is read-only and keeps the old 4/4 ledger', () => {
  const f = setup();
  try {
    const db = join(f.profile, 'host/product.sqlite'), before = hash(readFileSync(db));
    const plan = buildPlan(f.options);
    assert.deepEqual(plan.blocked, []); assert.equal(plan.audit.used, 0); assert.equal(plan.audit.totalRequests, 4);
    assert.equal(plan.inputDigest, hash(seed)); assert.equal(hash(readFileSync(db)), before);
    const reordered = { ...config, fileTools: Object.fromEntries(Object.entries(config.fileTools).reverse()) };
    assert.deepEqual(buildPlan({ ...f.options, config: reordered }), plan);
  } finally { f.dispose(); }
});
for (const kind of ['unapproved', 'old-grant', 'too-many', 'missing-tools', 'budget', 'lock', 'result', 'existing-root']) {
  test(`M2 validator prepare blocks ${kind} without resetting data`, () => {
    const f = setup(), c = structuredClone(config), paths = acceptancePaths(f.profile, f.options.attempt);
    try {
      if (kind === 'unapproved') c.approved = false;
      if (kind === 'old-grant') c.authorizationId = 'SYNTHETIC-old-grant';
      if (kind === 'too-many') c.maxRequests = 9;
      if (kind === 'missing-tools') delete c.fileTools;
      if (kind === 'budget') c.maxEstimatedCostUsd = 0.5;
      if (kind === 'lock') writeFileSync(paths.lock, 'SYNTHETIC owner');
      if (kind === 'result') writeFileSync(resultPath(f.profile, c), '{}');
      if (kind === 'existing-root') { mkdirSync(paths.root); assert.throws(() => buildPlan(f.options)); }
      else assert.ok(buildPlan({ ...f.options, config: c }).blocked.length);
      assert.equal(auditLedger(f.profile, config, 0.1).totalRequests, 4);
    } finally { f.dispose(); }
  });
}
