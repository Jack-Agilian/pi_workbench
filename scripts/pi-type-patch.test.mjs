import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { applyTypePatch, readTypePatch, sha256 } from './pi-type-patch.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = readTypePatch(repo);
const json = (path, value) => writeFileSync(path, JSON.stringify(value));

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pi-type-patch-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'patches'));
  for (const path of [manifest.patchFile, 'patches/pi-ai-0.87.0-json-types.json']) {
    copyFileSync(join(repo, path), join(root, path));
  }
  const packages = {};
  for (const packageRoot of manifest.packageRoots) {
    const base = join(root, packageRoot);
    mkdirSync(base, { recursive: true });
    json(join(base, 'package.json'), { name: manifest.package, version: manifest.version });
    packages[packageRoot] = { version: manifest.version, integrity: manifest.integrity };
    for (const file of manifest.files) {
      const installed = readFileSync(join(repo, packageRoot, file.path), 'utf8');
      const original = installed.replace('import type values from ', 'import values from ');
      assert.equal(sha256(original), file.beforeSha256);
      const target = join(base, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, original);
    }
  }
  json(join(root, 'package-lock.json'), { packages });
  return root;
}

const declaration = (root, copy = 0, index = 0) => join(root, manifest.packageRoots[copy], manifest.files[index].path);
const firstHash = root => sha256(readFileSync(declaration(root)));

test('real Git applies both copies without .git; repeated apply/check preserves bytes', t => {
  const root = fixture(t);
  assert.throws(() => applyTypePatch(root, true), /Run npm run patch/);
  assert.equal(firstHash(root), manifest.files[0].beforeSha256);
  for (const checkOnly of [false, false, true]) {
    assert.equal(applyTypePatch(root, checkOnly).length, 2);
    for (const packageRoot of manifest.packageRoots) {
      for (const file of manifest.files) {
        assert.equal(sha256(readFileSync(join(root, packageRoot, file.path))), file.afterSha256);
      }
    }
  }
});

test('nested declaration drift rejects before either copy is written', t => {
  const root = fixture(t);
  writeFileSync(declaration(root, 1), '// SYNTHETIC corruption');
  assert.throws(() => applyTypePatch(root), /Declaration drift/);
  assert.equal(firstHash(root), manifest.files[0].beforeSha256);
});

test('partial patch rejects before writing other files', t => {
  const root = fixture(t);
  const path = declaration(root, 1);
  writeFileSync(path, readFileSync(path, 'utf8').replace('import values', 'import type values'));
  assert.throws(() => applyTypePatch(root), /Partial patch/);
  assert.equal(firstHash(root), manifest.files[0].beforeSha256);
});

test('installed version drift rejects before writing', t => {
  const root = fixture(t);
  json(join(root, manifest.packageRoots[1], 'package.json'), { name: manifest.package, version: '0.87.1' });
  assert.throws(() => applyTypePatch(root), /Installed package version drift/);
  assert.equal(firstHash(root), manifest.files[0].beforeSha256);
});

for (const field of ['version', 'integrity']) {
  test(`lock ${field} drift rejects before writing`, t => {
    const root = fixture(t);
    const path = join(root, 'package-lock.json');
    const lock = JSON.parse(readFileSync(path));
    lock.packages[manifest.packageRoots[1]][field] = 'SYNTHETIC invalid lock';
    json(path, lock);
    assert.throws(() => applyTypePatch(root), /Lock .* drift/);
    assert.equal(firstHash(root), manifest.files[0].beforeSha256);
  });
}

test('changed patch digest rejects before invoking Git', t => {
  const root = fixture(t);
  writeFileSync(join(root, manifest.patchFile), 'SYNTHETIC invalid patch');
  assert.throws(() => applyTypePatch(root), /Patch digest changed/);
  assert.equal(firstHash(root), manifest.files[0].beforeSha256);
});

test('symlinked declaration rejects without changing its target', t => {
  const root = fixture(t);
  const path = declaration(root, 1);
  const target = join(root, 'outside.d.ts');
  copyFileSync(path, target);
  rmSync(path);
  symlinkSync(target, path);
  assert.throws(() => applyTypePatch(root), /Refuse symlinked declarations/);
  assert.equal(sha256(readFileSync(target)), manifest.files[0].beforeSha256);
  assert.equal(firstHash(root), manifest.files[0].beforeSha256);
});
