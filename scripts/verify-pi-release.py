#!/usr/bin/env python3
"""Network-enabled A0 download audit, deliberately separate from the offline SDK probe."""
from __future__ import annotations
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    manifest = json.loads((ROOT / 'package.json').read_text())
    lock = json.loads((ROOT / 'package-lock.json').read_text())
    output = ROOT / '.artifacts/a0-a1/download-audit'
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
        checked = 0
        with tarfile.open(fileobj=io.BytesIO(data)) as archive:
            for member in archive.getmembers():
                if not member.isfile():
                    continue
                # npm strips the first component; @types/node uses "node v24.13/"
                # rather than "package/". Do not assume a package-specific prefix.
                parts = Path(member.name).parts
                assert len(parts) > 1 and not Path(member.name).is_absolute()
                relative = Path(*parts[1:])
                target = ROOT / 'node_modules' / name / relative
                target.resolve().relative_to((ROOT / 'node_modules' / name).resolve())
                original = archive.extractfile(member)
                assert original is not None
                # npm normalizes package.json metadata during installation; verify
                # its semantic identity separately, every other shipped file byte-for-byte.
                if relative.as_posix() == 'package.json':
                    expected = json.load(original)
                    actual = json.loads(target.read_text())
                    for field in ['name', 'version', 'exports', 'engines']:
                        assert actual.get(field) == expected.get(field)
                else:
                    assert target.read_bytes() == original.read(), f'Installed file differs: {name}/{relative}'
                checked += 1
        record = {
            'package': name, 'version': version, 'metadataUrl': metadata_url,
            'tarballUrl': artifact['tarball'], 'integrity': integrity,
            'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
            'installedFilesChecked': checked, 'exports': metadata.get('exports'),
            'engines': metadata.get('engines'),
            'scope': 'HTTPS registry/lock/download SRI and installed package files; registry signatures not independently verified',
        }
        records.append(record)
        print(f"Verified {name}@{version}: {len(data)} bytes, {checked} installed files")
    (output / 'summary.json').write_text(json.dumps(records, indent=2) + '\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
