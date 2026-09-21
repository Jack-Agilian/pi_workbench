#!/usr/bin/env python3
"""Idempotent document-tool environment. Does not install app runtimes or alter global settings."""
from __future__ import annotations
import argparse
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install-test-deps', action='store_true', help='Opt in to installing pinned document-test dependencies into .venv.')
    parser.add_argument('--offline', action='store_true', help='Forbid dependency downloads; use a local wheelhouse when installing.')
    parser.add_argument('--wheelhouse', type=Path, help='Local wheel directory for offline dependency installation.')
    args = parser.parse_args()
    if sys.version_info < (3, 10):
        parser.error('Python 3.10+ is required.')
    if args.offline and args.install_test_deps and not args.wheelhouse:
        parser.error('--offline --install-test-deps requires --wheelhouse.')
    if args.wheelhouse and not args.wheelhouse.is_dir():
        parser.error('--wheelhouse must be an existing directory.')
    target = ROOT / '.venv'
    python = target / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    if target.is_symlink():
        parser.error('Refusing to reuse a symlinked .venv.')
    if target.exists():
        if not (target/'pyvenv.cfg').is_file() or not python.is_file():
            parser.error('An incomplete or non-venv .venv already exists. Inspect it before removing it manually.')
    else:
        venv.EnvBuilder(with_pip=True).create(target)
    if args.install_test_deps:
        cmd = [str(python), '-m', 'pip', '--disable-pip-version-check', 'install', '-r', str(ROOT/'scripts/requirements-dev.txt')]
        if args.offline:
            cmd.extend(['--no-index', '--find-links', str(args.wheelhouse.resolve())])
        elif args.wheelhouse:
            cmd.extend(['--find-links', str(args.wheelhouse.resolve())])
        subprocess.run(cmd, check=True, timeout=300)
    subprocess.run([str(python), '-X', 'utf8', str(ROOT/'scripts/check-docs.py'), '--structural-only', '--report', str(ROOT/'.artifacts/bootstrap-validation.json')], check=True, timeout=90)
    deps = subprocess.run([str(python), '-c', 'import jsonschema'], capture_output=True)
    print(json.dumps({'environment': str(target), 'dependency_install_requested': args.install_test_deps, 'design_test_dependencies_available': deps.returncode == 0, 'network_dependency_install_forbidden': args.offline, 'global_settings_modified': False}, indent=2))
    if deps.returncode:
        print('Structural checks completed. The full example suite is NOT validated in this venv yet. Re-run with --install-test-deps, or use an existing environment with jsonschema.')
    return 0

if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, subprocess.SubprocessError) as exc:
        print(f'Bootstrap failed: {exc}', file=sys.stderr)
        raise SystemExit(1)
