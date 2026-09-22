// Report selected tools only. Never enumerate environment variables or credentials.
import { readFileSync, existsSync } from 'node:fs';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
if (process.versions.node !== manifest.engines.node) {
  throw new Error(`Node ${manifest.engines.node} required; found ${process.versions.node}. See docs/DEVELOPMENT.md.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    && !process.argv.includes('--versions-only')) {
  const run = (file, args) => {
    const result = spawnSync(file, args, { encoding: 'utf8' });
    return { exit: result.status, output: result.stdout?.trim() || null };
  };
  const tool = (name) => {
    const executable = (process.env.PATH ?? '').split(delimiter)
      .map(path => resolve(path, name)).find(path => existsSync(path));
    return executable ? { executable, ...run(executable, ['--version']) } : null;
  };
  console.log(JSON.stringify({
    platform: process.platform,
    node: { version: process.versions.node, arch: process.arch, executable: process.execPath },
    macOS: process.platform === 'darwin' ? run('/usr/bin/sw_vers', ['-productVersion']) : null,
    machine: process.platform !== 'win32' ? run('uname', ['-m']) : null,
    rosetta: process.platform === 'darwin' ? run('/usr/sbin/sysctl', ['-n', 'sysctl.proc_translated']) : null,
    git: tool('git'),
    python3: tool('python3'),
    projectPython: existsSync(resolve(root, '.venv/bin/python'))
      ? { executable: resolve(root, '.venv/bin/python'), ...run(resolve(root, '.venv/bin/python'), ['--version']) } : null,
    npm: tool(process.platform === 'win32' ? 'npm.cmd' : 'npm'),
  }, null, 2));
}
