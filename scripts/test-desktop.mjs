import './check-environment.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repository, sterileEnvironment } from '../apps/agent-server/worker-launcher.ts';
const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'c-test-launch-')));
try {
  const result = spawnSync(process.execPath, ['--import', join(repository, 'scripts/probe-no-network.mjs'), '--test', join(repository, 'apps/desktop/desktop.test.ts')],
    { cwd: temporary, env: sterileEnvironment(temporary), stdio: 'inherit', timeout: 180000 });
  if (result.error || result.signal) throw new Error('desktop_suite_terminated'); process.exitCode = result.status ?? 1;
} finally { rmSync(temporary, { recursive: true, force: true }); }
