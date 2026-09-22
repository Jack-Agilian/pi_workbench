// ADR-A0: exact declaration-only fix. Git owns diff application; no lifecycle hook.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = data => createHash('sha256').update(data).digest('hex');

export function readTypePatch(root = defaultRoot) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'patches/pi-ai-0.87.0-json-types.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.package, '@earendil-works/pi-ai');
  assert.equal(manifest.version, '0.87.0', 'Review a new ADR before changing the patch version');
  assert.equal(manifest.patchFile, 'patches/pi-ai-0.87.0-json-types.patch');
  assert.equal(sha256(readFileSync(resolve(root, manifest.patchFile))), manifest.patchSha256, 'Patch digest changed');
  assert.equal(manifest.files.length, 41);
  assert.equal(new Set(manifest.files.map(file => file.path)).size, manifest.files.length);
  for (const file of manifest.files) {
    assert.match(file.path, /^dist\/providers\/[a-z0-9-]+\.models\.d\.ts$/);
    assert.match(file.beforeSha256, /^[a-f0-9]{64}$/);
    assert.match(file.afterSha256, /^[a-f0-9]{64}$/);
  }
  assert.deepEqual(manifest.packageRoots, [
    'node_modules/@earendil-works/pi-ai',
    'node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai',
  ]);
  return manifest;
}

export function applyTypePatch(root = defaultRoot, checkOnly = false) {
  root = realpathSync(root);
  const manifest = readTypePatch(root);
  const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
  const states = manifest.packageRoots.map(packageRoot => {
    const base = resolve(root, packageRoot);
    assert.equal(realpathSync(base), base, 'Refuse symlinked package directories');
    const pkg = JSON.parse(readFileSync(resolve(base, 'package.json'), 'utf8'));
    assert.equal(pkg.name, manifest.package);
    assert.equal(pkg.version, manifest.version, 'Installed package version drift');
    assert.equal(lock.packages[packageRoot]?.version, manifest.version, 'Lock version drift');
    assert.equal(lock.packages[packageRoot]?.integrity, manifest.integrity, 'Lock integrity drift');
    const states = new Set(manifest.files.map(file => {
      const target = resolve(base, file.path);
      assert.equal(realpathSync(target), target, 'Refuse symlinked declarations');
      assert.ok(target.startsWith(base + sep));
      const hash = sha256(readFileSync(target));
      if (hash === file.beforeSha256) return 'original';
      if (hash === file.afterSha256) return 'patched';
      throw new Error(`Declaration drift: ${packageRoot}/${file.path}`);
    }));
    assert.equal(states.size, 1, `Partial patch: ${packageRoot}; reinstall with npm ci`);
    return { packageRoot, state: [...states][0] };
  });
  if (checkOnly) {
    assert.ok(states.every(item => item.state === 'patched'), 'Run npm run patch:pi-types or the app bootstrap first');
    return states;
  }
  const original = states.filter(item => item.state === 'original');
  const git = (item, check) => {
    const args = ['apply', ...(check ? ['--check'] : []), `--directory=${item.packageRoot}`, manifest.patchFile];
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `Git type patch failed: ${result.stderr}`);
  };
  // Preflight every copy before the first mutation. No partial/unknown state is accepted.
  for (const item of original) git(item, true);
  for (const item of original) git(item, false);
  return applyTypePatch(root, true);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const states = applyTypePatch(defaultRoot, process.argv.includes('--check'));
  console.log(`Verified declaration-only patch in ${states.length} Pi 0.87.0 copies (41 files each).`);
}
