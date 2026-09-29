import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProductCore } from '../apps/agent-server/core.ts';
import { repository, sterileEnvironment } from '../apps/agent-server/worker-launcher.ts';
const cli = join(repository, 'scripts/validate-file-agent.mjs');
function fixture() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'm2-validation-cli-')));
  const directory = join(home, 'Library/Application Support/Pi Workbench'), profile = join(directory, 'model-profile');
  mkdirSync(join(profile, 'host'), { recursive: true }); mkdirSync(join(profile, 'workspace'));
  new ProductCore(join(profile, 'host/product.sqlite'), [{ id: 'demo-workspace', path: join(profile, 'workspace') }]).close();
  const config = { version: 1, authorizationId: 'SYNTHETIC-cli', approved: true, dataScope: 'synthetic_non_sensitive',
    provider: 'openai', model: 'SYNTHETIC-cli', endpoint: 'https://example.invalid/v1', maxRequests: 8, maxOutputTokens: 512,
    timeoutMs: 1800000, httpIdleTimeoutMs: 300000, maxEstimatedCostUsd: 1,
    fileTools: { maxOperations: 6, maxModelRequests: 4, operationTimeoutMs: 300000 },
    openai: { api: 'chat-completions', contextWindow: 8192, inputUsdPerMillion: 1, outputUsdPerMillion: 1 } };
  writeFileSync(join(directory, 'model.json'), JSON.stringify(config));
  mkdirSync(join(directory, 'auth.json')); // Deliberately unreadable as a credential file; preparation does not need it.
  const run = args => spawnSync(process.execPath, ['--import', join(repository, 'scripts/probe-no-network.mjs'), cli, ...args],
    { env: { ...sterileEnvironment(home), PATH: process.env.PATH + ':/usr/bin:/bin' }, encoding: 'utf8', timeout: 15000 });
  return { home, profile, run, dispose: () => rmSync(home, { recursive: true, force: true }) };
}
for (const args of [[], ['execute'], ['prepare', '../escape'], ['prepare', 'ok', '--profile=/tmp/other']]) {
  test(`M2 CLI rejects unsupported invocation ${JSON.stringify(args)}`, () => {
    const f = fixture(); try { const r = f.run(args); assert.notEqual(r.status, 0); assert.equal(existsSync(join(f.profile, 'state')), false); }
    finally { f.dispose(); }
  });
}
test('M2 CLI prepare/inspect need no credentials; duplicate prepare and noninteractive execute refuse', t => {
  const f = fixture();
  try {
    const db = join(f.profile, 'host/product.sqlite'), before = readFileSync(db);
    const prepared = f.run(['prepare', 'synthetic-cli']);
    if (prepared.status !== 0 && prepared.stderr.includes('worktree_must_be_clean')) {
      assert.deepEqual(readFileSync(db), before);
      assert.equal(existsSync(join(f.profile, 'state')), false);
      t.diagnostic('Dirty checkout: verified clean-code gate. Full CLI prepare is checked on committed code.');
      return;
    }
    assert.equal(prepared.status, 0, prepared.stderr);
    const planFile = join(f.profile, 'file-validation-synthetic-cli.plan.json');
    const plan = JSON.parse(readFileSync(planFile, 'utf8')); assert.deepEqual(plan.blocked, []);
    const duplicate = f.run(['prepare', 'synthetic-cli']); assert.notEqual(duplicate.status, 0);
    assert.equal(f.run(['inspect', 'synthetic-cli']).status, 0);
    const execution = f.run(['execute-approved', 'synthetic-cli']);
    assert.notEqual(execution.status, 0); assert.match(execution.stderr, /interactive_terminal_required/);
    assert.deepEqual(readFileSync(db), before);
    assert.equal(existsSync(join(f.profile, 'workspace/m2-c-synthetic-cli')), false);
    assert.equal(existsSync(join(f.profile, 'live-validation.lock')), false);
    assert.equal(existsSync(join(f.profile, 'state')), false);
  } finally { f.dispose(); }
});
