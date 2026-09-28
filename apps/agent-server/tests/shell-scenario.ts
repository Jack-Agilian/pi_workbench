import { join } from 'node:path';
import { createScenario } from './scenario.ts';
import { parametersDigest } from '../../../packages/pi-adapter/controlled-tools.ts';
import { repository } from '../worker-launcher.ts';
import type { ShellExecutionPlan } from '../worker-supervisor.ts';
export function shellScenario(command: string, timeoutMs = 5000) {
  const f = createScenario('normal', false, '工作区 命令-');
  const args = { command, timeout: timeoutMs / 1000 };
  const plan: ShellExecutionPlan = { tool: 'bash', target: '.', parametersDigest: parametersDigest(args), deadline: Date.now() + 20000,
    shell: { command, cwd: '.', profile: 'restricted-bash-v1', environmentPolicy: 'sterile-v1', timeoutMs } };
  return { ...f, get core() { return f.core; }, get supervisor() { return f.supervisor; },
    plan, launch: () => f.supervisor.startNext(plan, { path: join(repository, 'packages/pi-adapter/shell-demo-worker.ts'), args: [JSON.stringify(args)] })! };
}
