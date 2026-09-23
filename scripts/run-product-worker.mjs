import './check-environment.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sterileEnvironment } from '../apps/agent-server/worker-launcher.ts';
if (process.platform !== 'darwin') throw new Error('Restricted Worker tests currently support verified macOS only');
const args = process.argv.slice(2);
if (args.length && !(args.length === 2 && args[0] === '--demo' && ['allow','deny','cancel','crash'].includes(args[1]))) throw new Error('Invalid worker driver arguments');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'b-worker-launch-')));
try {
  const result = spawnSync(process.execPath, [
    '--import', join(root, 'scripts/probe-no-network.mjs'), join(root, args.length ? 'apps/agent-server/tests/demo.ts' : 'apps/agent-server/tests/worker.test.ts'), ...(args.length ? [args[1]] : [])],
  { cwd: temporary, env: sterileEnvironment(temporary), stdio: 'inherit', timeout: 180000 });
  if (result.error || result.signal) throw new Error('worker_suite_terminated'); process.exitCode = result.status ?? 1;
} finally { rmSync(temporary, { recursive: true, force: true }); }
