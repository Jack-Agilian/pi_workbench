// Explicit binary acquisition only. npm lifecycle scripts remain disabled.
import './check-environment.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('desktop_binary_platform_not_verified');
if (process.argv.slice(2).some(arg => arg !== '--offline')) throw new Error('invalid_arguments');
const pkg = join(root, 'node_modules/electron');
const version = JSON.parse(readFileSync(join(root, 'package.json'))).devDependencies.electron;
if (JSON.parse(readFileSync(join(pkg, 'package.json'))).version !== version) throw new Error('electron_version_mismatch');
const name = `electron-v${version}-darwin-arm64.zip`;
const expected = JSON.parse(readFileSync(join(pkg, 'checksums.json')))[name];
if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error('missing_official_checksum');
const cache = join(root, '.artifacts/electron'); mkdirSync(cache, { recursive: true });
const archive = join(cache, name); const url = `https://github.com/electron/electron/releases/download/v${version}/${name}`;
if (!existsSync(archive)) {
  if (process.argv.includes('--offline')) throw new Error('electron_archive_missing_offline');
  const response = await fetch(url); if (!response.ok) throw new Error('electron_download_failed');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('electron_checksum_mismatch');
  writeFileSync(archive, bytes, { flag: 'wx', mode: 0o600 });
}
const bytes = readFileSync(archive);
if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('electron_cache_checksum_mismatch');
const executable = 'Electron.app/Contents/MacOS/Electron';
if (!existsSync(join(pkg, 'dist', executable))) {
  const staging = join(cache, 'extract'); mkdirSync(staging, { recursive: true });
  try {
    // Only the archive matching the pinned official SHA is extracted, never a user supplied archive.
    execFileSync('/usr/bin/ditto', ['-x', '-k', archive, staging], { env: { PATH: '/usr/bin:/bin' } });
    renameSync(staging, join(pkg, 'dist'));
  } finally { rmSync(staging, { recursive: true, force: true }); }
}
if (readFileSync(join(pkg, 'dist/version'), 'utf8').trim().replace(/^v/, '') !== version) throw new Error('installed_electron_version_mismatch');
writeFileSync(join(pkg, 'path.txt'), executable);
writeFileSync(join(cache, 'verification.json'), JSON.stringify({ version, url, sha256: expected, bytes: bytes.length,
  checksumSource: 'Pinned electron npm package checksums.json', platform: process.platform, arch: process.arch,
  extraction: '/usr/bin/ditto; no lifecycle scripts; no Gatekeeper changes', signatureIndependentlyVerified: false }, null, 2) + '\n');
console.log(`Electron ${version} binary prepared and archive SHA-256 verified.`);
