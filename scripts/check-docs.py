#!/usr/bin/env python3
"""Validate the imported source without changing its files. No network access."""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SKIP = {'.git', '.venv', '.artifacts', '__pycache__', 'node_modules'}
PRIVATE_KEY = re.compile(rb'-----BEGIN (?:OPENSSH |RSA |EC |DSA |ENCRYPTED )?PRIVATE KEY-----')


def safe_member(root: Path, name: str) -> Path:
    part = PurePosixPath(name)
    if not part.parts or part.is_absolute() or '..' in part.parts or '\\' in name or ':' in name:
        raise ValueError(f'Unsafe relative path: {name}')
    path = root.joinpath(*part.parts)
    if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f'Path escapes root or is a symlink: {name}')
    return path


def verify_manifest(root: Path) -> int:
    seen: set[str] = set()
    for line in (root / 'MANIFEST.sha256').read_text(encoding='utf-8').splitlines():
        digest, name = line.split('  ', 1)
        if not re.fullmatch(r'[0-9a-f]{64}', digest) or name in seen:
            raise ValueError('Invalid or duplicate manifest entry')
        path = safe_member(root, name)
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError(f'Missing or changed source file: {name}')
        seen.add(name)
    actual = {p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()}
    if actual != seen | {'MANIFEST.sha256'}:
        raise ValueError('Source tree has files not covered by the original manifest')
    return len(seen)


def project_files(root: Path):
    for base, dirs, names in os.walk(root, followlinks=False):
        dirs[:] = [d for d in dirs if d not in SKIP]
        for name in names:
            path = Path(base) / name
            if path.is_symlink():
                raise ValueError(f'Unexpected symlink: {path.relative_to(root)}')
            yield path


def check_local_links(root: Path) -> int:
    count = 0
    for path in project_files(root):
        if path.suffix.lower() != '.md':
            continue
        text = re.sub(r'```.*?```', '', path.read_text(encoding='utf-8'), flags=re.S)
        for match in re.finditer(r'(?<!!)\[[^\]\n]*\]\(([^)]+)\)', text):
            target = match.group(1).strip().strip('<>')
            parsed = urlsplit(target)
            if parsed.scheme or parsed.netloc or target.startswith('#'):
                continue
            rel = unquote(parsed.path)
            if not rel:
                continue
            resolved = (path.parent / rel).resolve()
            if not resolved.is_relative_to(root.resolve()) or not resolved.exists():
                raise ValueError(f'Broken/outside local link: {path.relative_to(root)} -> {target}')
            count += 1
    return count


def check_secrets(root: Path) -> int:
    count = 0
    for path in project_files(root):
        if path.name in {'github_deploy_key', 'id_rsa', 'id_ed25519', '.env'} or path.suffix in {'.pem', '.key', '.p12', '.pfx'}:
            raise ValueError(f'Forbidden credential filename: {path.relative_to(root)}')
        if PRIVATE_KEY.search(path.read_bytes()):
            raise ValueError(f'Private-key material detected: {path.relative_to(root)}')
        count += 1
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--structural-only', action='store_true', help='Skip the jsonschema design-example suite explicitly.')
    parser.add_argument('--typecheck', action='store_true', help='Require an already installed tsc; never download it.')
    parser.add_argument('--report', type=Path, default=ROOT / '.artifacts/validation.json')
    args = parser.parse_args()
    checks: list[dict] = []
    def run_check(name, fn):
        try:
            detail = fn()
            checks.append({'name': name, 'status': 'passed', 'detail': detail})
        except Exception as exc:
            checks.append({'name': name, 'status': 'failed', 'error': str(exc)})
    source = ROOT / 'docs/startup'
    run_check('original-source-sha256', lambda: {'files_verified': verify_manifest(source)})
    run_check('local-markdown-links', lambda: {'links_checked': check_local_links(ROOT)})
    run_check('credential-hygiene', lambda: {'files_checked': check_secrets(ROOT), 'scope': 'Known filenames and private-key PEM markers only; not a complete secret scanner.'})
    run_check('python-syntax', lambda: [compile(p.read_text(encoding='utf-8'), str(p), 'exec') and p.name for p in sorted((ROOT/'scripts').glob('*.py'))])
    if args.structural_only:
        checks.append({'name': 'original-design-example-suite', 'status': 'skipped', 'reason': '--structural-only'})
    else:
        def example_suite():
            if importlib.util.find_spec('jsonschema') is None:
                raise RuntimeError('jsonschema is missing. Run bootstrap.py --install-test-deps, or explicitly choose --structural-only.')
            with tempfile.TemporaryDirectory(prefix='pi-workbench-tests-') as tmp:
                copy = Path(tmp) / 'source'
                shutil.copytree(source, copy)
                proc = subprocess.run([sys.executable, '-X', 'utf8', str(copy/'tests/validate.py')], cwd=copy, text=True, encoding='utf-8', errors='replace', capture_output=True, timeout=60)
                if proc.returncode:
                    raise RuntimeError((proc.stdout + proc.stderr)[-6000:])
                report = json.loads((copy/'tests/validation-report.json').read_text(encoding='utf-8'))
                if report['failed']:
                    raise RuntimeError('Original example suite contains failures')
                return report
        run_check('original-design-example-suite', example_suite)
    if args.typecheck:
        def typecheck():
            compiler = shutil.which('tsc')
            if not compiler:
                raise RuntimeError('tsc is not installed; typecheck was explicitly requested.')
            version = subprocess.check_output([compiler, '--version'], text=True, encoding='utf-8').strip()
            # Check the historical example independently of the new app tsconfig.
            # TypeScript 7 rejects explicit input files when cwd has a tsconfig.
            # Copying also prevents app @types packages from changing this baseline.
            with tempfile.TemporaryDirectory(prefix='pi-protocol-typecheck-') as tmp:
                contract = Path(tmp) / 'app-protocol.ts'
                shutil.copyfile(source/'contracts/app-protocol.ts', contract)
                proc = subprocess.run([compiler, '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', str(contract)], cwd=tmp, text=True, encoding='utf-8', errors='replace', capture_output=True, timeout=60)
            if proc.returncode:
                raise RuntimeError((proc.stdout+proc.stderr)[-6000:])
            return {'compiler': version, 'runtime_tested': False}
        run_check('typescript-proposal', typecheck)
    else:
        checks.append({'name': 'typescript-proposal', 'status': 'skipped', 'reason': 'Use --typecheck to require tsc.'})
    run_check('source-unchanged-after-tests', lambda: {'files_verified': verify_manifest(source)})
    report = {'scope': 'Documentation, sample contracts, and repository tooling only; no Pi/Electron/OS sandbox or deployment tested.', 'checks': checks,
              'passed': sum(c['status']=='passed' for c in checks), 'failed': sum(c['status']=='failed' for c in checks), 'skipped': sum(c['status']=='skipped' for c in checks)}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if report['failed'] else 0

if __name__ == '__main__':
    raise SystemExit(main())
