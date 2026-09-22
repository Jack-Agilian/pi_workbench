import './check-environment.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && ['--tools', '--shell'].includes(process.argv[2])), 'Unknown probe mode');
const shellMode = process.argv[2] === '--shell';
if (shellMode) assert.equal(process.platform, 'darwin', 'Real shell probe currently requires the verified macOS sandbox profile');
const suite = shellMode ? 'shell-probe.test.ts' : process.argv[2] === '--tools' ? 'tool-probe.test.ts' : 'probe.test.ts';
const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'pi-sdk-probe-')));
const denied = shellMode ? realpathSync(mkdtempSync(join(tmpdir(), 'pi-shell-denied-'))) : undefined;
if (denied) writeFileSync(join(denied, 'synthetic-canary.txt'), 'SYNTHETIC filesystem boundary canary');
const agentDir = join(temporary, 'home', '.pi', 'agent');
for (const dir of [agentDir, join(temporary, 'workspace'), join(temporary, 'tmp')]) mkdirSync(dir, { recursive: true });
if (process.argv[2] === '--tools') {
  const fixture = join(temporary, 'symlink-case');
  mkdirSync(join(fixture, '中文 workspace'), { recursive: true });
  symlinkSync(fixture, join(fixture, '中文 workspace', 'link'));
}
// Construct from scratch: no inherited provider credentials, NODE_OPTIONS or npm config.
const env = {
  HOME: join(temporary, 'home'), USERPROFILE: join(temporary, 'home'),
  XDG_CONFIG_HOME: join(temporary, 'home', '.config'),
  APPDATA: join(temporary, 'home', 'AppData'),
  TMPDIR: join(temporary, 'tmp'), TMP: join(temporary, 'tmp'), TEMP: join(temporary, 'tmp'),
  PATH: dirname(process.execPath), PI_CODING_AGENT_DIR: agentDir,
  PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1',
  PI_PROBE_ROOT: temporary, NO_COLOR: '1',
  ...(denied ? { PI_PROBE_DENIED_PATH: join(denied, 'synthetic-canary.txt') } : {}),
};
const flags = [
  '--permission',
  ...[join(root, 'node_modules'), join(root, 'packages/pi-adapter'), join(root, 'package.json'),
    join(root, 'scripts/probe-no-network.mjs'), temporary].map(path => `--allow-fs-read=${path}`),
  `--allow-fs-write=${temporary}`,
  '--import', join(root, 'scripts/probe-no-network.mjs'),
  ...(shellMode ? ['--allow-child-process', '--allow-fs-read=/bin/bash'] : []),
];
const profile = ['(version 1)', '(allow default)', '(deny network*)'];
if (shellMode) {
  // Shell binaries cannot enforce Node permissions (Node children inherit flags
  // via NODE_OPTIONS). OS file rules cover this fixed-command test only.
  profile.push('(deny file-write*)', `(allow file-write* (subpath ${JSON.stringify(realpathSync(temporary))}))`,
    `(deny file-read* (subpath ${JSON.stringify(homedir())}))`,
    `(allow file-read* (subpath ${JSON.stringify(realpathSync(root))}) (subpath ${JSON.stringify(realpathSync(temporary))}))`,
    `(deny file-read* (subpath ${JSON.stringify(realpathSync(denied))}))`);
  // Node realpath needs metadata on the known ancestors of the permitted repo.
  for (let ancestor = dirname(realpathSync(root)); ancestor !== dirname(ancestor); ancestor = dirname(ancestor)) {
    profile.push(`(allow file-read-metadata (literal ${JSON.stringify(ancestor)}))`);
  }
}
const run = (args) => {
  // macOS adds an OS network deny rule. No privilege changes; no fallback if it fails.
  const command = process.platform === 'darwin' ? '/usr/bin/sandbox-exec' : process.execPath;
  const prefix = process.platform === 'darwin'
    ? ['-p', profile.join(' '), process.execPath] : [];
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
    assert.equal(result.status, 97, `Network tripwire must fail even when the error is caught: ${result.stderr}`);
  }
  const boundary = run(['-e', `
    const assert = require('node:assert/strict');
    assert.throws(() => require('node:fs').readFileSync('/etc/passwd'), {code:'ERR_ACCESS_DENIED'});
    if (process.permission.has('child')) {
      const result = require('node:child_process').spawnSync('/bin/cat', [process.env.PI_PROBE_DENIED_PATH], {encoding:'utf8'});
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /Operation not permitted|Permission denied/);
    } else {
      assert.throws(() => require('node:child_process').spawn('security', ['find-generic-password']), {code:'ERR_ACCESS_DENIED'});
    }
    assert.equal(process.permission.has('worker'), false);
    assert.equal(process.permission.has('addons'), false);
  `]);
  assert.equal(boundary.status, 0, boundary.stderr);
  console.log(shellMode
    ? 'Shell isolation self-checks passed: 5 network tripwires + OS child file denial + worker/addon denial.'
    : 'Isolation self-checks passed: 5 network tripwires + file/process/worker/addon denial.');
  // node:test also runs from an explicit entrypoint; avoid the CLI's directory
  // glob discovery (and test subprocesses) under narrow filesystem permissions.
  const result = run([join(root, 'packages/pi-adapter', suite)]);
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
  if (denied) rmSync(denied, { recursive: true, force: true });
}
