import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProductCore } from '../core.ts';
import { WorkerSupervisor, type ExecutionPlan } from '../worker-supervisor.ts';
import { repository, type TrustedWorkerEntry } from '../worker-launcher.ts';
import { contentId, inspectContent } from '../../../packages/pi-adapter/approved-resources.ts';
import { digest, parametersDigest } from '../../../packages/pi-adapter/controlled-tools.ts';
export async function until(predicate: () => boolean, label: string, ms = 10000) {
  const start = Date.now(); while (!predicate()) { if (Date.now() - start > ms) throw new Error(`timeout:${label}`); await new Promise<void>(r => setTimeout(r, 20)); }
}
export function createScenario(mode = 'normal', persistNative = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'b-worker-'))); const cwd = join(root, 'workspace'); const dbdir = join(root, 'host'); const state = join(root, 'state'); const resource = join(root, 'resources');
  for (const dir of [cwd, dbdir, state, resource]) mkdirSync(dir);
  writeFileSync(join(resource, 'package.json'), JSON.stringify({ name: 'synthetic-b-ipc-resources', version: '1.0.0', pi: { skills: [] } }));
  const files = inspectContent(resource); const resources = { root: resource, id: contentId(files), files, expectedSkillNames: [] };
  const database = join(dbdir, 'product.sqlite'); const workspaces = [{ id: 'workspace', path: cwd }];
  let core = new ProductCore(database, workspaces); const options = { stateDirectory: state, databaseDirectory: dbdir, resources };
  let supervisor = new WorkerSupervisor(core, options);
  const thread = supervisor.command({ type: 'threads.create', requestId: 'thread', workspaceId: 'workspace', title: 'SYNTHETIC B IPC' }).id;
  const command = { type: 'runs.start', requestId: 'start', threadId: thread, input: 'SYNTHETIC direct registered Pi tool; no model' };
  const run = supervisor.command(command).id;
  const args = { path: 'report.md', content: '# SYNTHETIC B-IPC\n' };
  const plan: ExecutionPlan = { tool: 'write', target: args.path, parametersDigest: parametersDigest(args), fileVersion: null, expectedContentDigest: digest(args.content), deadline: Date.now() + 30000 };
  const path = join(repository, 'apps/agent-server/tests/worker-fixture.ts');
  const entry: TrustedWorkerEntry = { path, extraRead: [path], args: [JSON.stringify({ mode, database, tool: 'write', args, persistNative })] };
  const dispose = async () => { await supervisor.close(); core.close(); rmSync(root, { recursive: true, force: true }); };
  return { root, cwd, database, thread, run, command, args, plan, entry, resources, dispose,
    get core() { return core; }, get supervisor() { return supervisor; },
    reopen() { core.close(); core = new ProductCore(database, workspaces); supervisor = new WorkerSupervisor(core, options); },
    start() { const result = supervisor.startNext(plan, entry); assert.ok(result); return result; },
    async approval(decision: 'allow' | 'deny' = 'allow') {
      await until(() => core.snapshot(thread).operations.length > 0, 'operation');
      const op = core.snapshot(thread).operations[0]!;
      supervisor.command({ type: 'approvals.resolve', requestId: 'approval', operationId: op.id, parametersDigest: op.parametersDigest, decision }); return op;
    },
    stage(name: string) { return existsSync(join(cwd, '.worker-stage')) && readFileSync(join(cwd, '.worker-stage'), 'utf8') === name; },
  };
}
