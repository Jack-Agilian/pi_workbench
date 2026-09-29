// Manual M2-C entry. Invalid arguments/prepare/inspect never load credentials or start a HostClient.
import './check-environment.mjs';
import assert from 'node:assert/strict';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, renameSync, unlinkSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { HostClient } from '../apps/desktop/host-client.ts';
import { repository } from '../apps/agent-server/worker-launcher.ts';
import { parseModelConfiguration } from '../packages/app-contracts/model.ts';
import { displayText } from '../packages/app-contracts/presentation.ts';
import { describeModel } from '../packages/pi-adapter/model-catalog.ts';
import { policyDigest } from '../apps/agent-server/model-policy.ts';
import { acceptancePaths, resultPath, buildPlan, auditLedger, fileState, runEvidence, ordinaryPath, seed } from './file-acceptance-plan.mjs';
import { runAcceptance } from './file-acceptance-stages.mjs';
const [action, attempt, option, ...extra] = process.argv.slice(2);
assert.ok(['prepare', 'inspect', 'execute-approved'].includes(action) && attempt && !extra.length &&
  (!option || option.startsWith('--config=')), 'Usage: validate:file-agent prepare|inspect|execute-approved attempt-id [--config=/path/model.json]');
const directory = join(homedir(), 'Library/Application Support/Pi Workbench');
const profile = join(directory, 'model-profile'), paths = acceptancePaths(profile, attempt);
const chosenConfigPath = option ? resolve(option.slice('--config='.length)) : join(directory, 'model.json');
if (action === 'inspect') {
  const savedPlan = JSON.parse(readFileSync(ordinaryPath(profile, paths.plan), 'utf8'));
  const resultFile = resultPath(profile, savedPlan);
  const report = existsSync(resultFile) ? JSON.parse(readFileSync(ordinaryPath(profile, resultFile), 'utf8')) : null;
  if (report) assert.equal(report.attempt, attempt, 'different_attempt_for_authorization');
  console.log(JSON.stringify({ attempt, report }));
} else {
  const configPath = realpathSync(chosenConfigPath);
  const config = parseModelConfiguration(JSON.parse(readFileSync(configPath, 'utf8')));
  const resultFile = resultPath(profile, config);
  const codeIdentity = () => {
    assert.equal(execFileSync('git', ['-C', repository, 'status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'worktree_must_be_clean');
    return execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  };
  const commit = codeIdentity();
  const catalog = await describeModel(config.provider, config.model, config.maxOutputTokens, config);
  assert.equal(catalog.endpoint, config.endpoint, 'model_endpoint_mismatch');
  const makePlan = () => ({ ...buildPlan({ profile, attempt, config, reserve: catalog.reserveCostUsd, commit: codeIdentity() }), configurationPath: configPath });
  const plan = makePlan();
  if (action === 'prepare') {
    writeFileSync(paths.plan, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ prepared: true, attempt, blocked: plan.blocked, maxNewRequests: 8,
      estimatedReserveUsd: catalog.reserveCostUsd * 8, priceSource: catalog.priceSource, planPath: paths.plan }));
  } else {
    assert.ok(stdin.isTTY && stdout.isTTY, 'interactive_terminal_required');
    assert.deepEqual(plan.blocked, [], 'validation_plan_blocked');
    assert.deepEqual(JSON.parse(readFileSync(ordinaryPath(profile, paths.plan), 'utf8')), plan, 'plan_config_code_or_ledger_changed');
    // Detection plus explicit developer exclusivity; the validation lock is not a universal app mutex.
    let owners = '';
    try { owners = execFileSync('/usr/sbin/lsof', ['-t', '--', paths.database], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch (error) { assert.equal(error.status, 1, 'cannot_check_profile_owners'); }
    assert.equal(owners, '', 'close_other_profile_hosts_first');
    const rl = createInterface({ input: stdin, output: stdout });
    const confirmation = await rl.question(`New M2 authorization ${config.authorizationId}; at most 8 requests, estimate cap $${config.maxEstimatedCostUsd}. Close other workbench windows. Type EXECUTE ${attempt}: `);
    if (confirmation !== `EXECUTE ${attempt}`) { rl.close(); throw new Error('explicit_confirmation_required'); }
    // Recheck after human delay, before acquiring the lock, reading credentials or creating files.
    assert.deepEqual(makePlan(), plan, 'plan_changed_during_confirmation');
    assert.equal(policyDigest(parseModelConfiguration(JSON.parse(readFileSync(configPath, 'utf8')))), plan.policyDigest);
    const nonce = randomUUID();
    const lockFd = openSync(paths.lock, 'wx', 0o600);
    writeFileSync(lockFd, JSON.stringify({ attempt, nonce, pid: process.pid })); closeSync(lockFd);
    let client, claimed = false;
    const result = { version: 1, attempt, commit, authorizationId: config.authorizationId,
      policyDigest: plan.policyDigest, startedAt: new Date().toISOString(), stages: [], completed: false, hostClosed: false };
    const save = async () => { const temp = `${resultFile}.${nonce}.tmp`; writeFileSync(temp, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 }); renameSync(temp, resultFile); };
    const file = async name => existsSync(join(paths.root, name)) ? fileState(profile, `${paths.relativeRoot}/${name}`) : null;
    try {
      assert.deepEqual(auditLedger(profile, config, catalog.reserveCostUsd), plan.audit, 'ledger_changed_before_execution');
      writeFileSync(resultFile, JSON.stringify(result) + '\n', { flag: 'wx', mode: 0o600 }); claimed = true;
      mkdirSync(paths.root, { mode: 0o700 });
      writeFileSync(join(paths.root, 'source.md'), seed, { flag: 'wx', mode: 0o600 });
      client = new HostClient(process.execPath, repository, profile, '--model', configPath);
      await client.connect();
      await runAcceptance({ client, plan, result, save, file,
        text: async name => { await file(name); return readFileSync(join(paths.root, name), 'utf8'); },
        capture: runId => runEvidence(profile, runId),
        beforeStage: async stage => {
          assert.equal(codeIdentity(), plan.commit, 'code_changed');
          assert.equal(realpathSync(chosenConfigPath), plan.configurationPath, 'configuration_path_changed');
          assert.equal(policyDigest(parseModelConfiguration(JSON.parse(readFileSync(configPath, 'utf8')))), plan.policyDigest, 'configuration_changed');
          const audit = auditLedger(profile, config, catalog.reserveCostUsd);
          assert.equal(audit.priorAuthorizationsDigest, plan.audit.priorAuthorizationsDigest, 'prior_ledger_changed');
          const planned = { normal: 4, deny: 1, cancel: 1, resume: 2 }[stage];
          assert.equal(audit.active, 0); assert.ok(audit.remainingRequests >= planned && audit.remainingReservedUsd >= catalog.reserveCostUsd * planned, 'stage_budget_insufficient');
          console.log(`Stage ${stage}; used ${audit.used}/${config.maxRequests}.`);
        },
        decide: async ({ stage, op }) => {
          const choice = stage === 'deny' ? 'deny' : stage === 'cancel' ? 'cancel' : 'allow';
          console.log(displayText(`${op.tool} ${op.artifactPath}\n${op.file?.preview ?? ''}\nDigest: ${op.parametersDigest}\nTool results may be sent to the selected model.`, 4096));
          const answer = await rl.question(`Type ${choice} ${op.id}, or stop: `, { signal: AbortSignal.timeout(Math.max(1, op.deadline - Date.now())) });
          assert.equal(answer, `${choice} ${op.id}`, 'human_declined'); return choice;
        } });
      result.completed = true;
    } catch {
      result.failure = 'validation_stopped_inspect_saved_attempt'; result.completed = false; process.exitCode = 1;
    } finally {
      rl.close();
      try { if (client) await client.close(); result.hostClosed = true; }
      catch { result.completed = false; process.exitCode = 1; }
      if (claimed) {
        try { result.finalAudit = auditLedger(profile, config, catalog.reserveCostUsd);
          assert.equal(result.finalAudit.priorAuthorizationsDigest, plan.audit.priorAuthorizationsDigest, 'prior_ledger_changed'); }
        catch { result.completed = false; process.exitCode = 1; }
        result.finishedAt = new Date().toISOString(); await save();
      }
      // Leave an interrupted/unconfirmed owner lock for diagnosis; never steal another validator's lock.
      if (result.hostClosed && JSON.parse(readFileSync(paths.lock, 'utf8')).nonce === nonce) unlinkSync(paths.lock);
    }
    console.log(JSON.stringify({ completed: result.completed, hostClosed: result.hostClosed, resultPath: resultFile }));
  }
}
