// Explicit desktop/CLI demonstration profiles; user input is never evaluated as a command.
import type { ShellIntent } from '../../packages/app-contracts/shell.ts';
export function shellDemo(input: string): ShellIntent | undefined {
  if (input === '/demo-shell') return { command: "printf '工作区: '; pwd; printf 'SYNTHETIC stdout 中文 😀\\n'; printf 'SYNTHETIC stderr\\n' >&2", cwd: '.', profile: 'restricted-bash-v1', environmentPolicy: 'sterile-v1', timeoutMs: 5000 };
  if (input === '/demo-shell-wait') return { command: "printf 'SYNTHETIC waiting\\n'; while :; do printf '.' >> shell-heartbeat.txt; sleep 0.1; done", cwd: '.', profile: 'restricted-bash-v1', environmentPolicy: 'sterile-v1', timeoutMs: 10000 };
  return;
}
