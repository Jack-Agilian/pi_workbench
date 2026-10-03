import './check-environment.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repository, sterileEnvironment } from '../apps/agent-server/worker-launcher.ts';
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('execution_access_platform_not_verified');
const root = realpathSync(mkdtempSync(join(tmpdir(), 'execution-access-launch-')));
try {
  // Like test-model-network, a sterile host owns a fixed loopback server. The processes
  // under test apply their actual profiles: macOS does not permit nesting sandbox-exec.
  // This suite calls no Provider and supplies no public endpoint or real credential.
  const result = spawnSync(process.execPath, ['--test', join(repository, 'apps/agent-server/tests/execution-access.test.ts')],
    { cwd: root, env: sterileEnvironment(root), stdio: 'inherit', timeout: 90000 });
  if (result.error || result.signal) throw new Error('execution_access_suite_terminated');
  process.exitCode = result.status ?? 1;
} finally { if (!process.exitCode) rmSync(root, { recursive: true, force: true }); }
