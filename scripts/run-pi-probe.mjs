import './check-environment.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'pi-a1-probe-'));
const agentDir = join(temporary, 'home', '.pi', 'agent');
for (const dir of [agentDir, join(temporary, 'workspace'), join(temporary, 'tmp')]) mkdirSync(dir, { recursive: true });
// Construct from scratch: no inherited provider credentials, NODE_OPTIONS or npm config.
const env = {
  HOME: join(temporary, 'home'), USERPROFILE: join(temporary, 'home'),
  XDG_CONFIG_HOME: join(temporary, 'home', '.config'),
  APPDATA: join(temporary, 'home', 'AppData'),
  TMPDIR: join(temporary, 'tmp'), TMP: join(temporary, 'tmp'), TEMP: join(temporary, 'tmp'),
  PATH: dirname(process.execPath), PI_CODING_AGENT_DIR: agentDir,
  PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1',
  PI_PROBE_ROOT: temporary, NO_COLOR: '1',
};
const flags = [
  '--permission',
  ...[join(root, 'node_modules'), join(root, 'packages/pi-adapter'), join(root, 'package.json'),
    join(root, 'scripts/probe-no-network.mjs'), temporary].map(path => `--allow-fs-read=${path}`),
  `--allow-fs-write=${temporary}`,
  '--import', join(root, 'scripts/probe-no-network.mjs'),
];
const run = (args) => {
  // macOS adds an OS network deny rule. No privilege changes; no fallback if it fails.
  const command = process.platform === 'darwin' ? '/usr/bin/sandbox-exec' : process.execPath;
  const prefix = process.platform === 'darwin'
    ? ['-p', '(version 1) (allow default) (deny network*)', process.execPath] : [];
  return spawnSync(command, [...prefix, ...flags, ...args], {
    cwd: join(temporary, 'workspace'), env, encoding: 'utf8', timeout: 90_000,
  });
};
try {
  // Self-check the tripwire in separate processes so expected failures cannot hide SDK traffic.
  for (const expression of [
    'fetch("https://example.invalid")',
    'require("node:http").get("http://127.0.0.1:9")',
    'require("node:net").connect(9,"127.0.0.1")',
    'require("node:dns").lookup("example.invalid",()=>{})',
    'require("node:dgram").createSocket("udp4")',
  ]) {
    const result = run(['-e', `try { ${expression} } catch {} process.exitCode = 0`]);
    assert.equal(result.status, 97, 'Network tripwire must fail even when the error is caught');
  }
  const boundary = run(['-e', `
    const assert = require('node:assert/strict');
    assert.throws(() => require('node:fs').readFileSync('/etc/passwd'), {code:'ERR_ACCESS_DENIED'});
    assert.throws(() => require('node:child_process').spawn('security', ['find-generic-password']), {code:'ERR_ACCESS_DENIED'});
    assert.equal(process.permission.has('worker'), false);
    assert.equal(process.permission.has('addons'), false);
  `]);
  assert.equal(boundary.status, 0, boundary.stderr);
  console.log('Isolation self-checks passed: 5 network tripwires + file/process/worker/addon denial.');
  // node:test also runs from an explicit entrypoint; avoid the CLI's directory
  // glob discovery (and test subprocesses) under narrow filesystem permissions.
  const result = run([join(root, 'packages/pi-adapter/probe.test.ts')]);
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
