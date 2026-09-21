#!/usr/bin/env python3
"""Explicit, no-force Git publication using an external key and already verified known_hosts."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import shlex
import shutil
import stat
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
TARGET = 'git@github.com:Jack-Agilian/pi_workbench.git'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--key', type=Path, required=True, help='Absolute path to a deploy key OUTSIDE the repository.')
    parser.add_argument('--known-hosts', type=Path, required=True, help='Existing externally verified known_hosts; no trust-on-first-use.')
    parser.add_argument('--branch', default='main')
    parser.add_argument('--check-only', action='store_true', help='Validate local configuration and read remote refs, without pushing.')
    args = parser.parse_args()
    report = {'status': 'not_pushed', 'target': TARGET, 'branch': args.branch, 'remote_verified': False}
    def git(*parts, env=None):
        proc = subprocess.run(['git', *parts], cwd=ROOT, env=env, text=True, encoding='utf-8', errors='replace', capture_output=True, timeout=90)
        if proc.returncode:
            raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or f'git {parts[0]} failed')
        return proc.stdout.strip()
    try:
        if not shutil.which('git') or not shutil.which('ssh'):
            raise RuntimeError('Git and an OpenSSH client are required; this script does not install system packages.')
        if not (ROOT/'.git').is_dir():
            raise RuntimeError('Restore or clone a real Git repository first; a source ZIP alone has no history.')
        if git('remote', 'get-url', 'origin') != TARGET:
            raise RuntimeError('origin does not match the explicitly authorized repository.')
        git('check-ref-format', '--branch', args.branch)
        if git('status', '--porcelain'):
            raise RuntimeError('Working tree is not clean; review and commit changes before publishing.')
        key = args.key.expanduser()
        if not key.is_absolute() or not key.is_file() or key.is_symlink() or key.resolve().is_relative_to(ROOT.resolve()):
            raise RuntimeError('Key must be a regular file at an absolute path outside the repository.')
        if os.name != 'nt' and stat.S_IMODE(key.stat().st_mode) & 0o077:
            raise RuntimeError('Key permissions are too broad; set mode 600 before retrying.')
        known = args.known_hosts.expanduser().resolve()
        if not known.is_file():
            raise RuntimeError('An existing, independently verified known_hosts file is required.')
        branch_sha = git('rev-parse', f'refs/heads/{args.branch}')
        if branch_sha != git('rev-parse', 'HEAD'):
            raise RuntimeError('Check out the target branch before publication.')
        report['local_commit'] = branch_sha
        with tempfile.TemporaryDirectory(prefix='pi-workbench-ssh-') as tmp:
            config = Path(tmp)/'config'; config.write_text('', encoding='utf-8')
            empty_hosts = Path(tmp)/'global_known_hosts'; empty_hosts.write_text('', encoding='utf-8')
            command = ['ssh', '-F', str(config), '-i', str(key), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'IdentityAgent=none', '-o', 'PasswordAuthentication=no', '-o', 'KbdInteractiveAuthentication=no', '-o', 'StrictHostKeyChecking=yes', '-o', f'UserKnownHostsFile={known}', '-o', f'GlobalKnownHostsFile={empty_hosts}', '-o', 'ConnectTimeout=15']
            env = os.environ.copy()
            env.update(GIT_SSH_COMMAND=shlex.join(command), GIT_SSH_VARIANT='ssh', GIT_TERMINAL_PROMPT='0')
            refs = git('ls-remote', '--heads', 'origin', env=env)
            remote = dict(line.split('\t', 1)[::-1] for line in refs.splitlines() if line)
            target_ref = f'refs/heads/{args.branch}'
            if remote and target_ref not in remote:
                raise RuntimeError('Remote already has other branches; manual reconciliation required before creating this branch.')
            if target_ref in remote:
                git('fetch', 'origin', args.branch, env=env)
                git('merge-base', '--is-ancestor', 'FETCH_HEAD', branch_sha)
            if args.check_only:
                report['status'] = 'read_preflight_passed_no_push'
                report['read_access_verified'] = True
            else:
                git('push', 'origin', f'{branch_sha}:{target_ref}', env=env)
                current = git('ls-remote', '--heads', 'origin', target_ref, env=env)
                confirmed = current.split('\t', 1)[0] if current else ''
                report['remote_commit'] = confirmed
                if confirmed != branch_sha:
                    raise RuntimeError('Push returned, but remote commit confirmation failed. Inspect remote before retrying.')
                report.update(status='pushed_and_verified', remote_verified=True)
        return_code = 0
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
        report['error'] = str(exc)
        return_code = 1
    dest = ROOT/'.artifacts/publish.json'; dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return return_code

if __name__ == '__main__':
    raise SystemExit(main())
