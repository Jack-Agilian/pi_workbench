import './check-environment.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repository, sterileEnvironment } from '../apps/agent-server/worker-launcher.ts';
if (process.argv.length !== 2) throw new Error('no_test_arguments');
const temp = realpathSync(mkdtempSync(join(tmpdir(), 'file-acceptance-tests-')));
mkdirSync(join(temp, 'home'));
const tests = ['plan', 'stages', 'integration', 'cli'].map(name => join(repository, `scripts/file-acceptance-${name}.test.mjs`));
const result = spawnSync(process.execPath, ['--import', join(repository, 'scripts/probe-no-network.mjs'), '--test', '--test-concurrency=1', ...tests],
  { cwd: temp, env: sterileEnvironment(join(temp, 'home')), stdio: 'inherit', timeout: 120000 });
process.exitCode = result.error || result.signal ? 1 : result.status ?? 1;
if (process.exitCode === 0) rmSync(temp, { recursive: true, force: true });
else console.error('Failed synthetic validation-test directory retained:', temp);
