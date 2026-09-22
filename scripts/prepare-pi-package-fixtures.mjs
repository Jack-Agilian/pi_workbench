// Network-enabled input preparation, deliberately separate from the offline SDK launcher.
import './check-environment.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(root, '.artifacts/a3/package-inputs');
const fixtures = JSON.parse(readFileSync(join(root, 'packages/pi-adapter/package-fixtures.json'), 'utf8'));
const cache = join(destination, 'cache');
const home = join(destination, 'home');
for (const path of [destination, cache, home, join(destination, 'tmp')]) mkdirSync(path, { recursive: true });
const config = join(destination, 'empty.npmrc');
const globalConfig = join(destination, 'empty-global.npmrc');
writeFileSync(config, ''); writeFileSync(globalConfig, '');
const npmCli = resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
const env = { HOME: home, USERPROFILE: home, PATH: dirname(process.execPath), TMPDIR: join(destination, 'tmp'),
  NO_COLOR: '1' };
const npmVersion = spawnSync(process.execPath, [npmCli, '--version'], { cwd: destination, env, encoding: 'utf8' });
assert.equal(npmVersion.status, 0, npmVersion.stderr);
assert.equal(npmVersion.stdout.trim(), JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).engines.npm);
const audit = [];
for (const item of fixtures.packages) {
  assert.equal(new URL(item.metadataUrl).origin, 'https://registry.npmjs.org');
  assert.equal(new URL(item.tarballUrl).origin, 'https://registry.npmjs.org');
  const metadataResponse = await fetch(item.metadataUrl);
  assert.equal(metadataResponse.status, 200);
  const metadata = await metadataResponse.json();
  assert.equal(metadata.version, item.version);
  assert.equal(metadata.name, item.name);
  assert.equal(metadata.dist.integrity, item.integrity);
  assert.equal(metadata.dist.tarball, item.tarballUrl);
  const response = await fetch(item.tarballUrl);
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, item.bytes);
  assert.equal(`sha512-${createHash('sha512').update(bytes).digest('base64')}`, item.integrity);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
  writeFileSync(join(destination, `${item.name}-${item.version}.tgz`), bytes);
  // npm owns its cache format and metadata. No hand-written cache/registry or installer.
  const result = spawnSync(process.execPath, [npmCli, 'cache', 'add', `${item.name}@${item.version}`,
    '--cache', cache, '--userconfig', config, '--globalconfig', globalConfig,
    '--registry=https://registry.npmjs.org/', '--ignore-scripts', '--no-audit', '--no-fund'],
  { cwd: destination, env, encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.status, 0, result.stderr);
  audit.push({ ...item, verified: true });
}
writeFileSync(join(destination, 'audit.json'), JSON.stringify({ node: process.version, npm: npmVersion.stdout.trim(),
  scope: 'Registry metadata, tarball bytes and npm cache preparation only; no SDK import or model call.',
  packages: audit }, null, 2) + '\n');
console.log(`Prepared and byte-verified ${audit.length} installation-only packages. SDK tests remain a separate offline command.`);
