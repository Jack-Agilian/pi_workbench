// Four bounded SYNTHETIC drivers for the real ProductCore -> IPC -> Pi tool chain, zero models.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createScenario, until } from './scenario.ts';
const scenario = process.argv[2];
if (!scenario || !['allow','deny','cancel','crash'].includes(scenario)) throw new Error('Expected allow | deny | cancel | crash');
const f = createScenario(scenario === 'cancel' ? 'cancel' : scenario === 'crash' ? 'written' : 'normal');
try {
  const pending = f.start();
  await until(() => !!f.supervisor.workerPid, 'Worker');
  const processIdentity = { hostPid: process.pid, workerPid: f.supervisor.workerPid };
  await f.approval(scenario === 'deny' ? 'deny' : 'allow');
  if (scenario === 'cancel') {
    await until(() => f.stage('claimed'), 'active tool'); f.supervisor.command({ type: 'runs.cancel', requestId: 'cancel', runId: f.run });
    assert.equal(f.core.snapshot(f.thread).runs[0]!.state, 'cancelling');
  }
  const path = join(f.cwd, 'report.md'); let before: number | undefined;
  if (scenario === 'crash') {
    await until(() => f.stage('written'), 'file written before result'); before = statSync(path).mtimeMs;
    process.kill(f.supervisor.workerPid!, 'SIGKILL');
  }
  await pending;
  const beforeReconcile = f.core.snapshot(f.thread).runs[0]!.state;
  if (scenario === 'crash') { assert.equal(beforeReconcile, 'unknown'); f.reopen(); f.supervisor.recover(); assert.equal(statSync(path).mtimeMs, before); }
  const snapshot = f.core.snapshot(f.thread);
  console.log(JSON.stringify({ syntheticDriver: true, realPiTools: true, modelCalls: 0, scenario, ...processIdentity,
    beforeReconcile, state: snapshot.runs[0]!.state, operation: snapshot.operations[0]!.state,
    artifacts: snapshot.artifacts.map(({ digest, bytes }) => ({ digest, bytes })), markdown: existsSync(path) ? readFileSync(path, 'utf8') : null }, null, 2));
} finally { await f.dispose(); }
