// Read-only planning/audit for one explicit M2 validation, not a second product store.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, sep, isAbsolute } from 'node:path';
import { policyDigest } from '../apps/agent-server/model-policy.ts';
import { parseModelConfiguration } from '../packages/app-contracts/model.ts';
export const seed = '# SYNTHETIC acceptance data\nalpha=2\nbeta=3\ngamma=5\nmarker=amber-m2-29\n';
export const hash = value => createHash('sha256').update(value).digest('hex');
export function acceptancePaths(profile, attempt) {
  assert.match(attempt, /^[a-z0-9][a-z0-9-]{0,39}$/, 'invalid_attempt');
  return { profile, database: join(profile, 'host/product.sqlite'),
    plan: join(profile, `file-validation-${attempt}.plan.json`),
    lock: join(profile, 'live-validation.lock'), relativeRoot: `m2-c-${attempt}`,
    workspace: join(profile, 'workspace'), root: join(profile, 'workspace', `m2-c-${attempt}`) };
}
export const resultPath = (profile, config) => join(profile, `file-validation-${hash(config.authorizationId).slice(0, 24)}.result.json`);
export function ordinaryPath(root, path) {
  const rel = relative(root, path);
  assert.ok(!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep), 'path_outside_profile');
  let current = root;
  for (const part of ['', ...rel.split(sep).filter(Boolean)]) {
    current = join(current, part);
    assert.equal(lstatSync(current).isSymbolicLink(), false, 'symlink_not_admitted');
  }
  return path;
}
export function auditLedger(profile, config, reserve) {
  const database = ordinaryPath(profile, join(profile, 'host/product.sqlite'));
  const db = new DatabaseSync(database, { readOnly: true, allowExtension: false });
  try {
    db.exec('BEGIN');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    assert.ok([7, 8, 9].includes(version), 'unsupported_validation_database');
    const all = db.prepare('SELECT * FROM model_requests ORDER BY rowid').all();
    const revisions = db.prepare('SELECT * FROM model_policy_revisions ORDER BY seq').all();
    const rows = all.filter(r => r.authorization_id === config.authorizationId);
    const used = rows.length, reserved = rows.reduce((n, r) => n + r.reserved_cost, 0);
    const active = db.prepare("SELECT count(*) n FROM runs WHERE state IN ('queued','starting','running','cancelling','unknown')").get().n;
    db.exec('COMMIT');
    return { version, totalRequests: all.length, used, reserved, active,
      ledgerDigest: hash(JSON.stringify({ all, revisions })),
      priorAuthorizationsDigest: hash(JSON.stringify(all.filter(r => r.authorization_id !== config.authorizationId).map(r => [r.run_id, r.authorization_id, r.policy_digest, r.reserved_cost]))),
      remainingRequests: config.maxRequests == null ? null : Math.max(0, config.maxRequests - used),
      remainingReservedUsd: Math.max(0, config.maxEstimatedCostUsd - reserved),
      fitsFullPlan: reserved + reserve * 8 <= config.maxEstimatedCostUsd };
  } finally { db.close(); }
}
export function buildPlan({ profile, attempt, config: raw, reserve, commit }) {
  const config = parseModelConfiguration(raw), paths = acceptancePaths(profile, attempt);
  assert.match(commit, /^[a-f0-9]{40}$/, 'invalid_code_commit');
  assert.equal(realpathSync(profile), profile, 'noncanonical_profile');
  ordinaryPath(profile, paths.workspace);
  assert.equal(existsSync(paths.root), false, 'validation_workspace_already_exists');
  assert.ok(Number.isFinite(reserve) && reserve > 0, 'invalid_cost_reservation');
  const audit = auditLedger(profile, config, reserve), blocked = [];
  if (!config.approved) blocked.push('authorization_not_approved');
  if (config.maxRequests !== 8 || config.maxOutputTokens > 512 || config.timeoutMs > 1800000 ||
      (config.httpIdleTimeoutMs ?? config.timeoutMs) > 300000) blocked.push('limits_outside_reviewed_plan');
  if (config.shellTools) blocked.push('shell_outside_file_acceptance');
  const tools = config.fileTools;
  if (!tools || tools.maxOperations > 6 || (tools.maxModelRequests == null || tools.maxModelRequests > 4) || tools.operationTimeoutMs > 300000)
    blocked.push('file_scope_not_approved');
  if (audit.used !== 0) blocked.push('authorization_already_used');
  if (audit.active !== 0) blocked.push('active_or_queued_work');
  if (!audit.fitsFullPlan) blocked.push('insufficient_reservation');
  if (existsSync(paths.lock)) blocked.push('validator_locked');
  if (existsSync(resultPath(profile, config))) blocked.push('authorization_already_attempted');
  return { version: 1, attempt, commit, policyDigest: policyDigest(config),
    authorizationId: config.authorizationId, provider: config.provider, model: config.model,
    endpoint: config.endpoint, requestLimit: 8, perRunRequestLimit: tools?.maxModelRequests ?? 0,
    reservePerRequestUsd: reserve, maxEstimatedCostUsd: config.maxEstimatedCostUsd,
    timeoutMs: config.timeoutMs, httpIdleTimeoutMs: config.httpIdleTimeoutMs ?? config.timeoutMs,
    fileTools: tools ?? null, audit, relativeRoot: paths.relativeRoot, inputDigest: hash(seed),
    stages: ['normal', 'deny', 'cancel', 'resume'], blocked };
}
export function fileState(profile, relativeFile) {
  const workspace = join(profile, 'workspace'), path = join(workspace, relativeFile);
  ordinaryPath(workspace, path);
  const stat = statSync(path, { bigint: true });
  assert.ok(stat.isFile() && stat.size <= 16000n, 'invalid_validation_file');
  const bytes = readFileSync(path);
  assert.ok(bytes.length <= 16000, 'validation_file_grew');
  return { digest: hash(bytes), bytes: bytes.length, mtimeNs: stat.mtimeNs.toString() };
}
export function runEvidence(profile, runId) {
  const db = new DatabaseSync(ordinaryPath(profile, join(profile, 'host/product.sqlite')), { readOnly: true, allowExtension: false });
  try {
    db.exec('BEGIN');
    const run = db.prepare('SELECT id,thread_id,state FROM runs WHERE id=?').get(runId);
    assert.ok(run, 'run_not_found');
    const native = db.prepare('SELECT native_ref,native_persisted FROM threads WHERE id=?').get(run.thread_id);
    const requests = db.prepare('SELECT request_id,request_seq,authorization_id,reserved_cost FROM model_requests WHERE run_id=? ORDER BY request_seq').all(runId);
    const operations = db.prepare('SELECT id,tool_call_id,tool,state,artifact_path,digest,content_digest FROM operations WHERE run_id=? ORDER BY rowid').all(runId);
    const launch = db.prepare('SELECT record FROM worker_launches WHERE run_id=?').get(runId);
    db.exec('COMMIT');
    assert.ok(launch, 'launch_not_found');
    const journal = JSON.parse(launch.record);
    const receipt = JSON.parse(readFileSync(ordinaryPath(profile, journal.spec.receipt), 'utf8'));
    assert.equal(receipt.instanceId, journal.spec.instanceId, 'receipt_identity');
    assert.equal(receipt.runtimeBindingId, journal.binding.runtimeBindingId, 'receipt_binding');
    assert.equal(receipt.nonce, journal.spec.nonce, 'receipt_nonce');
    assert.ok(receipt.exited === true && receipt.groupGone === true, 'cleanup_not_confirmed');
    if (receipt.workerPid !== null) {
      for (const pid of [receipt.workerPid, -receipt.workerPid]) {
        let gone = false; try { process.kill(pid, 0); } catch (e) { gone = e.code === 'ESRCH'; }
        assert.ok(gone, 'owned_process_not_gone');
      }
    }
    const reference = native?.native_ref;
    if (native?.native_persisted) ordinaryPath(join(profile, 'state/sessions', run.thread_id), reference);
    return { run, requests, operations, nativeRef: reference ?? null, nativePersisted: native?.native_persisted === 1,
      cleanup: { exited: true, groupGone: true }, receiptDigest: hash(JSON.stringify(receipt)) };
  } finally { db.close(); }
}
