#!/usr/bin/env python3
"""Explicit A0/A1 dependency initialization. No global runtime changes."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install-node', action='store_true', help='Download the pinned official Node archive into .artifacts/toolchains (macOS/Linux).')
    parser.add_argument('--offline', action='store_true', help='Use existing Node and npm cache only.')
    args = parser.parse_args()
    manifest = json.loads((ROOT / 'package.json').read_text())
    version = manifest['engines']['node']
    system = {'Darwin': 'darwin', 'Linux': 'linux', 'Windows': 'win'}.get(platform.system())
    arch = {'arm64': 'arm64', 'aarch64': 'arm64', 'x86_64': 'x64', 'AMD64': 'x64'}.get(platform.machine())
    toolchains = ROOT / '.artifacts/toolchains'
    folder = f'node-v{version}-{system}-{arch}'
    local_node = toolchains / folder / 'bin/node'
    if args.install_node and not local_node.is_file():
        if args.offline:
            parser.error('Pinned local Node is missing; --offline forbids downloading it.')
        if system not in {'darwin', 'linux'} or arch not in {'arm64', 'x64'}:
            parser.error('Automatic Node setup is limited to macOS/Linux arm64/x64. Supply the pinned Node on PATH.')
        if sys.version_info < (3, 12):
            parser.error('Automatic Node archive extraction requires Python 3.12+; alternatively supply pinned Node on PATH.')
        toolchains.mkdir(parents=True, exist_ok=True)
        archive_name = folder + '.tar.gz'
        base_url = f'https://nodejs.org/dist/v{version}/'
        with urllib.request.urlopen(base_url + 'SHASUMS256.txt', timeout=60) as response:
            sums = response.read().decode()
        expected = next(line.split()[0] for line in sums.splitlines() if line.split()[-1] == archive_name)
        with urllib.request.urlopen(base_url + archive_name, timeout=120) as response:
            data = response.read()
        digest = hashlib.sha256(data).hexdigest()
        if digest != expected:
            raise RuntimeError('Official Node archive SHA-256 mismatch.')
        archive = toolchains / archive_name
        archive.write_bytes(data)
        # Official archive has internal symlinks; verify them before extraction.
        with tarfile.open(archive) as source:
            for member in source.getmembers():
                target = (toolchains / member.name).resolve()
                target.relative_to(toolchains.resolve())
                if member.issym():
                    (target.parent / member.linkname).resolve().relative_to(toolchains.resolve())
                elif not (member.isfile() or member.isdir()):
                    raise RuntimeError('Unexpected archive member type.')
            source.extractall(toolchains, filter='tar')
        (toolchains / (folder + '.verification.json')).write_text(json.dumps({
            'url': base_url + archive_name, 'sha256': digest, 'bytes': len(data),
            'checksumSource': base_url + 'SHASUMS256.txt',
            'scope': 'HTTPS archive bytes against official SHA-256; signature not independently verified',
        }, indent=2) + '\n')
    node = str(local_node) if local_node.is_file() else shutil.which('node')
    if not node:
        parser.error('Node missing. Use --install-node or supply pinned Node on PATH.')
    version_found = subprocess.check_output([node, '-p', 'process.versions.node'], text=True).strip()
    if version_found != version:
        parser.error(f'Expected Node {version}; found {version_found}. Use --install-node for project-local setup.')
    # npm shipped with the selected Node; no global installs or npm configuration writes.
    env = os.environ.copy()
    env['PATH'] = str(Path(node).parent) + os.pathsep + env.get('PATH', '')
    npm = shutil.which('npm', path=env['PATH'])
    if not npm:
        parser.error('npm is missing.')
    npm_version = subprocess.check_output([npm, '--version'], env=env, text=True).strip()
    if npm_version != manifest['engines']['npm']:
        parser.error(f"Expected npm {manifest['engines']['npm']}; found {npm_version}.")
    command = [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund']
    if args.offline:
        command.append('--offline')
    subprocess.run(command, cwd=ROOT, env=env, check=True, timeout=600)
    # Explicit, reviewed declaration-only patch; third-party lifecycle scripts remain disabled.
    subprocess.run([node, str(ROOT / 'scripts/pi-type-patch.mjs')], cwd=ROOT, env=env, check=True, timeout=60)
    subprocess.run([node, str(ROOT / 'scripts/check-environment.mjs')], cwd=ROOT, env=env, check=True)
    print('Application probe dependencies ready; reviewed type patch applied, lifecycle scripts disabled. No SDK/model test was run.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
