// Real Pi PackageManager + real offline npm/Git. Only the local Git content is synthetic.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { DefaultPackageManager, DefaultResourceLoader, SettingsManager, type ProgressEvent } from '@earendil-works/pi-coding-agent';

const root = process.env.PI_PROBE_ROOT;
const npmCli = process.env.PI_PROBE_NPM_CLI;
const git = process.env.PI_PROBE_GIT;
assert.ok(root && npmCli && git, 'Use npm run test:pi-packages');
assert.equal(process.platform, 'darwin');
assert.equal(process.permission.has('child'), true);
const specs = { a: 'npm:is-number@6.0.0', b: 'npm:is-number@7.0.0', shared: 'npm:is-odd@3.0.1' };
const inputs: { packages: { name: string; version: string; integrity: string }[] } = JSON.parse(
  readFileSync(new URL('./package-fixtures.json', import.meta.url), 'utf8'));

function fixture() {
  const dir = mkdtempSync(join(root!, 'packages-'));
  const cwd = join(dir, 'workspace');
  const agentDir = join(dir, 'agent');
  for (const path of [cwd, agentDir, join(cwd, '.git')]) mkdirSync(path);
  // npm's realpath ancestor traversal is incompatible with Node's subtree permissions.
  // Only this trusted npm CLI uses OS read restrictions; Node write/addon/worker limits remain.
  const npmCommand = [process.execPath, '--allow-fs-read=*', npmCli!, '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
    '--cache', join(root!, 'npm-cache'),
    '--userconfig', join(root!, 'empty.npmrc'), '--globalconfig', join(root!, 'empty-global.npmrc')];
  const settingsManager = SettingsManager.inMemory({ npmCommand });
  settingsManager.setProjectTrusted(true);
  const manager = new DefaultPackageManager({ cwd, agentDir, settingsManager });
  const progress: ProgressEvent[] = [];
  manager.setProgressCallback(event => progress.push(event));
  return { dir, cwd, agentDir, manager, settingsManager, progress };
}
function readJson(path: string): Record<string, unknown> { return JSON.parse(readFileSync(path, 'utf8')); }
function installed(p: ReturnType<typeof fixture>, source: string) {
  const path = p.manager.getInstalledPath(source, 'project');
  assert.ok(path);
  assert.ok(relative(p.cwd, path).startsWith('.pi/'));
  return { path, manifest: readJson(join(path, 'package.json')) };
}
function assertLocked(p: ReturnType<typeof fixture>): void {
  const lock = readJson(join(p.cwd, '.pi/npm/package-lock.json'));
  assert.ok(lock.packages && typeof lock.packages === 'object');
  for (const [path, item] of Object.entries(lock.packages)) {
    if (!path) continue;
    assert.ok(item && typeof item === 'object' && 'version' in item && 'integrity' in item);
    const expected = inputs.packages.find(input => path.endsWith(`/node_modules/${input.name}`)
      || path === `node_modules/${input.name}`);
    assert.ok(expected, `Unexpected dependency: ${path}`);
    const version = inputs.packages.find(input => input.name === expected.name && input.version === item.version);
    assert.ok(version, `Unapproved version: ${path}`);
    assert.equal(item.integrity, version.integrity);
  }
}
async function onlinePolicy<T>(action: () => Promise<T>): Promise<T> {
  // Disable Pi's offline shortcut only; OS network denial, JS tripwire and npm --offline remain in force.
  const previous = process.env.PI_OFFLINE;
  process.env.PI_OFFLINE = '0';
  try { return await action(); }
  finally { if (previous === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = previous; }
}

test('package-staging: explicit pinned npm install in two roots preserves old version and validates cache SRI', async () => {
  const a = fixture(); const b = fixture();
  await a.manager.installAndPersist(specs.a, { local: true });
  const old = installed(a, specs.a);
  assert.equal(old.manifest.version, '6.0.0');
  const before = createHash('sha256').update(readFileSync(join(old.path, 'index.js'))).digest('hex');
  await b.manager.installAndPersist(specs.b, { local: true });
  assert.equal(installed(b, specs.b).manifest.version, '7.0.0');
  assert.equal(installed(a, specs.a).manifest.version, '6.0.0');
  assert.equal(createHash('sha256').update(readFileSync(join(old.path, 'index.js'))).digest('hex'), before);
  assertLocked(a); assertLocked(b);
  assert.deepEqual(a.progress.map(event => event.type), ['start', 'complete']);
  assert.equal(a.manager.listConfiguredPackages()[0].source, specs.a);
  assert.equal(b.manager.listConfiguredPackages()[0].source, specs.b);
  // Same-root versions share a native install path: they are not isolated by Pi.
  assert.equal(a.manager.getInstalledPath(specs.a, 'project'), a.manager.getInstalledPath(specs.b, 'project'));
});

test('package-pinned-upgrade: update skips exact npm pins even when Pi offline shortcut is disabled', async () => {
  const p = fixture();
  await p.manager.installAndPersist(specs.a, { local: true });
  p.progress.length = 0;
  await onlinePolicy(() => p.manager.update(specs.a));
  assert.deepEqual(p.progress, []);
  assert.equal(installed(p, specs.a).manifest.version, '6.0.0');
});

test('package-resolution-cases: real shared dependency and nested versions remain within one staged root', async () => {
  const p = fixture();
  await p.manager.installAndPersist(specs.shared, { local: true });
  await p.manager.installAndPersist(specs.b, { local: true });
  const odd = installed(p, specs.shared);
  assert.equal(odd.manifest.version, '3.0.1');
  assert.equal(readJson(join(odd.path, 'node_modules/is-number/package.json')).version, '6.0.0');
  assert.equal(installed(p, specs.b).manifest.version, '7.0.0');
  assertLocked(p);
});

test('missing configured source: resolve skip/error never installs; offline skips before consulting callback', async () => {
  const p = fixture();
  p.settingsManager.setProjectPackages([specs.b]);
  await p.settingsManager.flush();
  assert.equal(p.manager.listConfiguredPackages()[0].installedPath, undefined);
  let consulted = 0;
  const result = await onlinePolicy(() => p.manager.resolve(async source => { consulted++; assert.equal(source, specs.b); return 'skip'; }));
  assert.deepEqual(result, { extensions: [], skills: [], prompts: [], themes: [] });
  assert.equal(consulted, 1);
  await onlinePolicy(() => assert.rejects(p.manager.resolve(async () => 'error'), /Missing source/));
  await p.manager.resolve(async () => { throw new Error('offline should not ask'); });
  assert.deepEqual(p.progress, []);
  assert.equal(existsSync(join(p.cwd, '.pi/npm')), false);
});

test('public gap: DefaultResourceLoader noExtensions still installs configured missing packages without onMissing control', async () => {
  const p = fixture();
  p.settingsManager.setProjectPackages([specs.b]);
  await p.settingsManager.flush();
  const loader = new DefaultResourceLoader({ ...p, noExtensions: true, noSkills: true,
    noPromptTemplates: true, noThemes: true, noContextFiles: true,
    systemPrompt: 'SYNTHETIC', appendSystemPrompt: [] });
  await onlinePolicy(() => loader.reload());
  assert.equal(installed(p, specs.b).manifest.version, '7.0.0');
  assert.deepEqual(p.progress, [], 'Loader owns a separate manager; facade callback does not audit its install');
  assert.deepEqual(loader.getExtensions().extensions, []);
});

test('package installation failure emits error and does not persist failed source or change old staged version', async () => {
  const old = fixture(); const failed = fixture();
  await old.manager.installAndPersist(specs.a, { local: true });
  // Deliberate uncached version: npm must fail offline, not attempt a real registry request.
  await assert.rejects(failed.manager.installAndPersist('npm:is-number@0.0.0-synthetic-a3-missing', { local: true }), /failed with code/);
  assert.deepEqual(failed.progress.map(event => event.type), ['start', 'error']);
  assert.deepEqual(failed.manager.listConfiguredPackages(), []);
  assert.equal(installed(old, specs.a).manifest.version, '6.0.0');
  assert.equal(existsSync(join(old.cwd, '.pi/npm/node_modules/is-number')), true);
  await assert.rejects(failed.manager.installAndPersist('npm:synthetic-a3-uncached-package@1.0.0', { local: true }), /failed with code/);
  assert.deepEqual(failed.manager.listConfiguredPackages(), []);
  const logs = join(root!, 'npm-cache/_logs');
  assert.ok(readdirSync(logs).some(name => readFileSync(join(logs, name), 'utf8').includes('ENOTCACHED')));
});

test('local sources remain mutable references; settings projection edits are not deletion or approval', async () => {
  const p = fixture();
  const source = join(p.dir, 'synthetic-local'); mkdirSync(source);
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'synthetic-local', version: '1.0.0', pi: { skills: ['skills'] } }));
  mkdirSync(join(source, 'skills'));
  const skill = join(source, 'skills/test.md');
  writeFileSync(skill, '---\nname: test\ndescription: SYNTHETIC A\n---\nA');
  await p.manager.installAndPersist(source, { local: true });
  const paths = await p.manager.resolve(async () => 'error');
  assert.equal(paths.skills[0].path, skill);
  assert.equal(p.manager.getInstalledPath(source, 'project'), source);
  writeFileSync(skill, '---\nname: test\ndescription: SYNTHETIC B\n---\nB');
  assert.match(readFileSync((await p.manager.resolve(async () => 'error')).skills[0].path, 'utf8'), /SYNTHETIC B/);
  // This proves why the separate full-tree snapshot/admission probe is required.
  p.settingsManager.setProjectPackages([]); await p.settingsManager.flush();
  assert.deepEqual(p.manager.listConfiguredPackages(), []);
  assert.equal(existsSync(skill), true, 'Projection edits are not package deletion or activation approval');
});

function gitCommand(cwd: string, args: string[]): string {
  return execFileSync(git!, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

test('Git pinned refs: local transport, lifecycle scripts denied, new root upgrade and same-root update reconciliation', async () => {
  const source = join(root!, 'git-fixture'); mkdirSync(source);
  gitCommand(source, ['init', '--initial-branch=synthetic-main']);
  const scripts = Object.fromEntries(['preinstall', 'install', 'postinstall', 'prepare'].map(name => [name,
    `node -e "require('node:fs').writeFileSync('SYNTHETIC-${name}-ran','not allowed')"`]));
  const makeVersion = (version: string): string => {
    writeFileSync(join(source, '.npmrc'), 'ignore-scripts=false\n'); // CLI denial must take precedence.
    writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'synthetic-git-content', version,
      scripts, pi: { skills: ['skills'] }, dependencies: { 'is-number': '6.0.0' } }));
    mkdirSync(join(source, 'skills'), { recursive: true });
    writeFileSync(join(source, 'skills/git.md'), `---\nname: git\ndescription: SYNTHETIC Git ${version}\n---\nData only`);
    gitCommand(source, ['add', '.']);
    gitCommand(source, ['-c', 'user.name=Synthetic A3', '-c', 'user.email=synthetic@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '-m', `SYNTHETIC ${version}`]);
    gitCommand(source, ['tag', `v${version}`]);
    return gitCommand(source, ['rev-parse', 'HEAD']);
  };
  const sha1 = makeVersion('1.0.0'); const sha2 = makeVersion('2.0.0');
  const v1 = 'git:https://a3.invalid/fixtures/content@v1.0.0';
  const v2 = 'git:https://a3.invalid/fixtures/content@v2.0.0';
  const a = fixture(); const b = fixture();
  await a.manager.installAndPersist(v1, { local: true });
  await b.manager.installAndPersist(v2, { local: true });
  const old = installed(a, v1); const next = installed(b, v2);
  assert.equal(gitCommand(old.path, ['rev-parse', 'HEAD']), sha1);
  assert.equal(gitCommand(next.path, ['rev-parse', 'HEAD']), sha2);
  assert.equal(readJson(join(old.path, 'node_modules/is-number/package.json')).version, '6.0.0');
  const lock: { packages: Record<string, { integrity?: string }> } = JSON.parse(readFileSync(join(old.path, 'package-lock.json'), 'utf8'));
  assert.equal(lock.packages['node_modules/is-number'].integrity, inputs.packages.find(item => item.name === 'is-number' && item.version === '6.0.0')!.integrity);
  for (const path of [old.path, next.path]) for (const name of Object.keys(scripts)) assert.equal(existsSync(join(path, `SYNTHETIC-${name}-ran`)), false);
  assert.equal((await a.manager.resolve(async () => 'error')).skills.length, 1);
  // Pi Git update reconciles refs IN PLACE. Only an inactive throwaway stage may use it here.
  a.settingsManager.setProjectPackages([v2]); await a.settingsManager.flush();
  await onlinePolicy(() => a.manager.update(v2));
  assert.equal(gitCommand(old.path, ['rev-parse', 'HEAD']), sha2);
  for (const name of Object.keys(scripts)) assert.equal(existsSync(join(old.path, `SYNTHETIC-${name}-ran`)), false);
  assert.ok(a.progress.some(event => event.action === 'update' && event.type === 'complete'));
  const failed = fixture();
  await assert.rejects(failed.manager.installAndPersist('git:https://a3.invalid/fixtures/content@missing-synthetic-ref', { local: true }), /failed with code/);
  assert.equal(failed.manager.getInstalledPath(v1, 'project'), undefined);
  assert.deepEqual(failed.manager.listConfiguredPackages(), []);
  assert.equal(gitCommand(next.path, ['rev-parse', 'HEAD']), sha2);
});
