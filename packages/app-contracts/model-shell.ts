// Explicit opt-in product policy. Pi still owns the Bash schema and execution semantics.
import { exact } from './worker-ipc.ts';
import { parseShellIntent, type ShellIntent } from './shell.ts';
export interface ModelShellPolicy { maxCommands?: number | null; timeoutMs?: number | null; profile: 'restricted-bash-v1' }
export interface BashParameters { command: string; timeout?: number }
export interface ModelShellOperation { parameters: BashParameters; intent: ShellIntent; resourceLock: string; deadline: number; approvalDigest: string }
export function parseModelShellPolicy(value: unknown): ModelShellPolicy {
  const r = exact(value, [...(Object.hasOwn(Object(value),'maxCommands')?['maxCommands']:[]),...(Object.hasOwn(Object(value),'timeoutMs')?['timeoutMs']:[]),'profile']);
  if (r.profile !== 'restricted-bash-v1' || (r.maxCommands!=null && (!Number.isSafeInteger(r.maxCommands) || Number(r.maxCommands) < 1 || Number(r.maxCommands) > 16)) || (r.timeoutMs!=null && (!Number.isSafeInteger(r.timeoutMs) || Number(r.timeoutMs) < 100 || Number(r.timeoutMs) > 86400000))) throw new Error('model_shell_policy');
  return r as unknown as ModelShellPolicy;
}
export function parseBashParameters(value: unknown): BashParameters {
  const r = exact(value, ['command', ...(Object.hasOwn(Object(value), 'timeout') ? ['timeout'] : [])]);
  if (typeof r.command !== 'string' || !r.command || new TextEncoder().encode(r.command).byteLength > 4096 || r.command.includes('\0')) throw new Error('model_shell_command');
  if (Object.hasOwn(r,'timeout') && (typeof r.timeout !== 'number' || !Number.isFinite(r.timeout) || !Number.isSafeInteger(r.timeout * 1000) || r.timeout < 0.1 || r.timeout > 86400)) throw new Error('model_shell_timeout');
  return r as unknown as BashParameters;
}
export function modelShellIntent(parameters: BashParameters, policy: ModelShellPolicy): ShellIntent {
  const p = parseBashParameters(parameters); parseModelShellPolicy(policy);
  const timeoutMs = p.timeout === undefined ? policy.timeoutMs??null : p.timeout * 1000;
  if (timeoutMs!==null && policy.timeoutMs!=null && timeoutMs > policy.timeoutMs) throw new Error('model_shell_timeout');
  return parseShellIntent({ command: p.command, cwd: '.', profile: policy.profile, environmentPolicy: 'sterile-v1', timeoutMs });
}
