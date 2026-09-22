import './check-environment.mjs';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, lstatSync, readdirSync, mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && ['--tools', '--shell', '--resources', '--packages'].includes(process.argv[2])), 'Unknown probe mode');
const shellMode = process.argv[2] === '--shell';
const packageMode = process.argv[2] === '--packages';
const childMode = shellMode || packageMode;
if (childMode) assert.equal(process.platform, 'darwin', 'Child-process probes currently require the verified macOS sandbox profile');
const gitPath = packageMode ? (process.env.PATH ?? '').split(delimiter).map(path => join(path, 'git')).find(existsSync) : undefined;
if (packageMode) assert.ok(gitPath, 'An existing Git executable is required');
if (packageMode) assert.ok(existsSync(join(root, '.artifacts/a3/package-inputs/cache')), 'Run npm run prepare:pi-packages separately before the offline SDK test');
const suite = shellMode ? 'shell-probe.test.ts' : process.argv[2] === '--tools' ? 'tool-probe.test.ts'
  : process.argv[2] === '--resources' ? 'resource-probe.test.ts' : packageMode ? 'package-probe.test.ts' : 'probe.test.ts';
const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'pi-sdk-probe-')));
const denied = childMode ? realpathSync(mkdtempSync(join(tmpdir(), 'pi-child-denied-'))) : undefined;
if (denied) writeFileSync(join(denied, 'synthetic-canary.txt'), 'SYNTHETIC filesystem boundary canary');
const agentDir = join(temporary, 'home', '.pi', 'agent');
for (const dir of [agentDir, join(temporary, 'workspace'), join(temporary, 'tmp')]) mkdirSync(dir, { recursive: true });
if (process.argv[2] === '--tools') {
  const fixture = join(temporary, 'symlink-case');
  mkdirSync(join(fixture, '中文 workspace'), { recursive: true });
  symlinkSync(fixture, join(fixture, '中文 workspace', 'link'));
}
if (process.argv[2] === '--resources') {
  const fixture = join(temporary, 'resource-symlink-case');
  mkdirSync(fixture);
  symlinkSync(join(temporary, 'workspace'), join(fixture, 'link'));
}
if (packageMode) {
  const cache = join(root, '.artifacts/a3/package-inputs/cache');
  cpSync(cache, join(temporary, 'npm-cache'), { recursive: true });
  writeFileSync(join(temporary, 'empty.npmrc'), '');
  writeFileSync(join(temporary, 'empty-global.npmrc'), '');
  // Test-only Git URL mapping to a local synthetic repository. No real credentials or remote transport.
  writeFileSync(join(temporary, 'gitconfig'), `[url "file://${temporary}/git-fixture"]\n\tinsteadOf = https://a3.invalid/fixtures/content\n[protocol]\n\tallow = never\n[protocol "file"]\n\tallow = always\n`);
}
// Construct from scratch: no inherited provider credentials, NODE_OPTIONS or npm config.
const env = {
  HOME: join(temporary, 'home'), USERPROFILE: join(temporary, 'home'),
  XDG_CONFIG_HOME: join(temporary, 'home', '.config'),
  APPDATA: join(temporary, 'home', 'AppData'),
  TMPDIR: join(temporary, 'tmp'), TMP: join(temporary, 'tmp'), TEMP: join(temporary, 'tmp'),
  PATH: packageMode ? [dirname(process.execPath), dirname(gitPath), '/usr/bin', '/bin'].join(delimiter) : dirname(process.execPath),
  PI_CODING_AGENT_DIR: agentDir,
  PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1',
  PI_PROBE_ROOT: temporary, NO_COLOR: '1',
  ...(denied ? { PI_PROBE_DENIED_PATH: join(denied, 'synthetic-canary.txt') } : {}),
  ...(packageMode ? { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(temporary, 'gitconfig'),
    GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'file', PI_PROBE_GIT: realpathSync(gitPath),
    PI_PROBE_NPM_CLI: resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js') } : {}),
};
const flags = [
  '--permission',
  ...[join(root, 'node_modules'), join(root, 'packages/pi-adapter'), join(root, 'package.json'),
    join(root, 'scripts/probe-no-network.mjs'), temporary].map(path => `--allow-fs-read=${path}`),
  `--allow-fs-write=${temporary}`,
  '--import', join(root, 'scripts/probe-no-network.mjs'),
  ...(childMode ? ['--allow-child-process', '--allow-fs-read=/bin/bash'] : []),
  ...(packageMode ? [`--allow-fs-read=${resolve(dirname(process.execPath), '..')}`] : []),
];
const profile = ['(version 1)', '(allow default)', '(deny network*)'];
if (childMode) {
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
  if (packageMode) {
    // npm's ancestor lstat needs --allow-fs-read=*: enforce its reads in the inherited OS profile.
    // Metadata is needed to canonicalize ancestors; data access remains limited to approved roots.
    profile.push('(deny file-read*)', '(allow file-read-metadata)',
      `(allow file-read* (subpath ${JSON.stringify(realpathSync(root))}) (subpath ${JSON.stringify(temporary)}) (subpath ${JSON.stringify(resolve(dirname(process.execPath), '..'))}))`,
      '(allow file-read* (subpath "/System") (subpath "/usr/lib") (subpath "/usr/bin") (subpath "/bin") (subpath "/opt/homebrew/Cellar") (subpath "/opt/homebrew/opt") (subpath "/opt/homebrew/lib"))',
      '(allow file-read* (literal "/") (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random") (subpath "/dev/fd"))',
      '(allow file-write* (literal "/dev/null"))');
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
    assert.equal(result.status, 97, `Network tripwire must fail even when the error is caught: ${result.stderr}; ${result.signal}; ${result.error?.message ?? ''}`);
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
  if (packageMode) {
    const npmBoundary = run(['--allow-fs-read=*', '-e', `
      const assert = require('node:assert/strict');
      // Match npm's broader Node read flag; prove that the inherited OS profile still denies data.
      for (const path of ['/etc/passwd', process.env.PI_PROBE_DENIED_PATH]) {
        assert.throws(() => require('node:fs').readFileSync(path), error => ['EPERM','EACCES'].includes(error.code));
      }
      assert.throws(() => require('node:fs').writeFileSync(process.env.PI_PROBE_DENIED_PATH, 'SYNTHETIC'), {code:'ERR_ACCESS_DENIED'});
      assert.equal(process.permission.has('addons'), false);
      assert.equal(process.permission.has('worker'), false);
      const child = require('node:child_process').spawnSync(process.execPath, ['-e',
        'require("node:net").createServer().on("error", e => process.exit(["EPERM","EACCES"].includes(e.code) ? 0 : 2)).listen(0,"127.0.0.1",()=>process.exit(3))'], {encoding:'utf8'});
      assert.equal(child.status, 0, child.stderr);
    `]);
    assert.equal(npmBoundary.status, 0, npmBoundary.stderr);
    console.log('npm child boundary: OS read/network denial, Node write/addon/worker denial passed.');
  }
  console.log(childMode
    ? 'Child-process isolation self-checks passed: 5 network tripwires + OS child file denial + worker/addon denial.'
    : 'Isolation self-checks passed: 5 network tripwires + file/process/worker/addon denial.');
  // node:test also runs from an explicit entrypoint; avoid the CLI's directory
  // glob discovery (and test subprocesses) under narrow filesystem permissions.
  const result = run([join(root, 'packages/pi-adapter', suite)]);
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if (packageMode && result.status !== 0 && existsSync(join(temporary, 'npm-cache/_logs'))) {
    cpSync(join(temporary, 'npm-cache/_logs'), join(root, '.artifacts/a3/package-debug'), { recursive: true });
  }
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  // Content snapshots are read-only during tests. Unseal only our managed temp tree.
  const unseal = (dir) => {
    chmodSync(dir, 0o700);
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (lstatSync(path).isDirectory()) unseal(path);
    }
  };
  unseal(temporary);
  rmSync(temporary, { recursive: true, force: true });
  if (denied) rmSync(denied, { recursive: true, force: true });
}
