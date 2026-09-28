// Product DTOs, not Pi types. The host selects the profile and canonical cwd.
import { exact } from './worker-ipc.ts';
export interface ShellIntent { command: string; cwd: '.'; profile: 'restricted-bash-v1'; environmentPolicy: 'sterile-v1'; timeoutMs: number }
export interface ShellOutcome { exitCode: number | null; signal: string | null; timedOut: boolean; stdout: string; stderr: string; truncated: boolean; sideEffects: 'possible' | 'not-started' }
export interface ShellView { intent: ShellIntent; outcome: ShellOutcome | null }
export function parseShellIntent(value: unknown): ShellIntent {
  const r = exact(value, ['command','cwd','profile','environmentPolicy','timeoutMs']);
  if (typeof r.command !== 'string' || !r.command || r.command.length > 4096 || r.command.includes('\0') || r.cwd !== '.' || r.profile !== 'restricted-bash-v1' || r.environmentPolicy !== 'sterile-v1' || typeof r.timeoutMs !== 'number' || !Number.isSafeInteger(r.timeoutMs) || r.timeoutMs < 100 || r.timeoutMs > 30000) throw new Error('invalid_shell_intent');
  return r as unknown as ShellIntent;
}
export function parseShellOutcome(value: unknown): ShellOutcome {
  const r = exact(value, ['exitCode','signal','timedOut','stdout','stderr','truncated','sideEffects']);
  if (r.exitCode !== null && (typeof r.exitCode !== 'number' || !Number.isSafeInteger(r.exitCode) || r.exitCode < 0 || r.exitCode > 255)) throw new Error('invalid_shell_exit');
  if (r.signal !== null && (typeof r.signal !== 'string' || !/^SIG[A-Z0-9]{1,12}$/.test(r.signal))) throw new Error('invalid_shell_signal');
  for (const name of ['stdout','stderr']) if (typeof r[name] !== 'string' || new TextEncoder().encode(r[name]).byteLength > 8192) throw new Error('shell_output_limit');
  if (typeof r.timedOut !== 'boolean' || typeof r.truncated !== 'boolean' || (typeof r.sideEffects !== 'string' || !['possible','not-started'].includes(r.sideEffects))) throw new Error('invalid_shell_outcome');
  return r as unknown as ShellOutcome;
}
