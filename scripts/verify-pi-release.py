#!/usr/bin/env python3
"""Network-enabled A0 download audit, deliberately separate from the offline SDK probe."""
from __future__ import annotations
import base64
import argparse
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=ROOT / '.artifacts/a0-a1/download-audit')
    args = parser.parse_args()
    manifest = json.loads((ROOT / 'package.json').read_text())
    lock = json.loads((ROOT / 'package-lock.json').read_text())
    patch = json.loads((ROOT / 'patches/pi-ai-0.87.0-json-types.json').read_text())
    assert hashlib.sha256((ROOT / patch['patchFile']).read_bytes()).hexdigest() == patch['patchSha256']
    patched_files = {item['path']: item for item in patch['files']}
    assert len(patched_files) == 41
    output = args.output_dir.resolve()
    output.relative_to((ROOT / '.artifacts').resolve())
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for name, version in (manifest['dependencies'] | manifest['devDependencies']).items():
        metadata_url = f'https://registry.npmjs.org/{urllib.parse.quote(name, safe="")}/{version}'
        with urllib.request.urlopen(metadata_url, timeout=60) as response:
            metadata = json.load(response)
        artifact = metadata['dist']
        parsed = urllib.parse.urlparse(artifact['tarball'])
        if parsed.scheme != 'https' or parsed.hostname != 'registry.npmjs.org':
            raise RuntimeError('Unexpected registry artifact origin')
        locked = lock['packages']['node_modules/' + name]
        assert locked['version'] == version == metadata['version']
        assert locked['resolved'] == artifact['tarball']
        assert locked['integrity'] == artifact['integrity']
        with urllib.request.urlopen(artifact['tarball'], timeout=120) as response:
            data = response.read()
        integrity = 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode()
        assert integrity == artifact['integrity'], 'Registry/lock/download SRI mismatch'
        filename = name.replace('@', '').replace('/', '-') + '-' + version
        (output / (filename + '.tgz')).write_bytes(data)
        roots = patch['packageRoots'] if name == patch['package'] else ['node_modules/' + name]
        if name == patch['package']:
            assert version == patch['version'] and integrity == patch['integrity']
        copies = []
        with tarfile.open(fileobj=io.BytesIO(data)) as archive:
            for package_root in roots:
                installed_lock = lock['packages'][package_root]
                assert installed_lock['version'] == version
                assert installed_lock['resolved'] == artifact['tarball']
                assert installed_lock['integrity'] == integrity
                checked, changes = 0, []
                for member in archive.getmembers():
                    if not member.isfile():
                        continue
                    # npm strips the first component; @types/node uses "node v24.13/".
                    parts = Path(member.name).parts
                    assert len(parts) > 1 and not Path(member.name).is_absolute()
                    relative = Path(*parts[1:])
                    target = ROOT / package_root / relative
                    target.resolve().relative_to((ROOT / package_root).resolve())
                    original = archive.extractfile(member)
                    assert original is not None
                    original_bytes = original.read()
                    file_patch = patched_files.get(relative.as_posix()) if name == patch['package'] else None
                    if relative.as_posix() == 'package.json':
                        # npm normalizes metadata; verify semantic package identity.
                        expected = json.loads(original_bytes)
                        actual = json.loads(target.read_text())
                        for field in ['name', 'version', 'exports', 'engines']:
                            assert actual.get(field) == expected.get(field)
                    elif file_patch:
                        assert hashlib.sha256(original_bytes).hexdigest() == file_patch['beforeSha256']
                        installed = target.read_bytes()
                        assert hashlib.sha256(installed).hexdigest() == file_patch['afterSha256']
                        assert installed == original_bytes.replace(b'import values from ', b'import type values from ', 1)
                        changes.append(relative.as_posix())
                    else:
                        assert target.read_bytes() == original_bytes, f'Installed file differs: {package_root}/{relative}'
                    checked += 1
                if name == patch['package']:
                    assert set(changes) == set(patched_files)
                copies.append({'path': package_root, 'filesChecked': checked, 'declarationsPatched': len(changes)})
        record = {
            'package': name, 'version': version, 'metadataUrl': metadata_url,
            'tarballUrl': artifact['tarball'], 'integrity': integrity,
            'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
            'installedCopies': copies, 'exports': metadata.get('exports'),
            'engines': metadata.get('engines'),
            'scope': 'HTTPS registry/lock/download SRI and installed package files; registry signatures not independently verified',
        }
        if name == patch['package']:
            record['localDeclarationPatch'] = {
                'manifest': 'patches/pi-ai-0.87.0-json-types.json',
                'patchSha256': patch['patchSha256'],
                'scope': '41 declaration-only type imports per copy; runtime JS and model JSON match registry bytes',
            }
        records.append(record)
        print(f"Verified {name}@{version}: {len(data)} bytes, {sum(item['filesChecked'] for item in copies)} files across {len(copies)} copies")
    (output / 'summary.json').write_text(json.dumps(records, indent=2) + '\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
