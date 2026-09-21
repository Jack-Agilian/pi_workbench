#!/usr/bin/env python3
"""Offline unit tests for repository helpers, not the desktop application."""
from __future__ import annotations
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('repo_checks', ROOT/'scripts/check-docs.py')
assert spec and spec.loader
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)

class RepositoryToolsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='pi-workbench-unit-')
        self.root = Path(self.tmp.name)
    def tearDown(self):
        self.tmp.cleanup()
    def source(self):
        path = self.root/'example.md'; path.write_bytes(b'unchanged\n')
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        (self.root/'MANIFEST.sha256').write_text(digest+'  example.md\n', encoding='utf-8')
    def test_safe_relative_member(self):
        self.assertEqual(checks.safe_member(self.root,'a/b.md'),self.root/'a/b.md')
    def test_unsafe_relative_members(self):
        for path in ['../escape','/etc/passwd','C:\\escape','C:/escape','a/../../b']:
            with self.subTest(path=path), self.assertRaises(ValueError):
                checks.safe_member(self.root,path)
    def test_symlink_rejected(self):
        target=self.root/'target'; target.write_text('hello')
        try: (self.root/'link').symlink_to(target)
        except (OSError, NotImplementedError): self.skipTest('Symlink unavailable in this environment')
        with self.assertRaises(ValueError): checks.safe_member(self.root,'link')
    def test_manifest_accepts_unchanged_file(self):
        self.source(); self.assertEqual(checks.verify_manifest(self.root),1)
    def test_manifest_rejects_changed_file(self):
        self.source(); (self.root/'example.md').write_text('changed')
        with self.assertRaises(ValueError): checks.verify_manifest(self.root)
    def test_manifest_rejects_missing_file(self):
        self.source(); (self.root/'example.md').unlink()
        with self.assertRaises(ValueError): checks.verify_manifest(self.root)
    def test_manifest_rejects_extra_file(self):
        self.source(); (self.root/'extra').write_text('unexpected')
        with self.assertRaises(ValueError): checks.verify_manifest(self.root)
    def test_manifest_rejects_duplicate_entry(self):
        self.source(); manifest=self.root/'MANIFEST.sha256'
        manifest.write_text(manifest.read_text()*2)
        with self.assertRaises(ValueError): checks.verify_manifest(self.root)
    def test_links_accept_local_and_skip_external(self):
        (self.root/'target.md').write_text('target',encoding='utf-8')
        (self.root/'README.md').write_text('[yes](target.md) [ext](https://example.invalid) [anchor](#x)',encoding='utf-8')
        self.assertEqual(checks.check_local_links(self.root),1)
    def test_links_reject_missing_target(self):
        (self.root/'README.md').write_text('[bad](missing.md)',encoding='utf-8')
        with self.assertRaises(ValueError): checks.check_local_links(self.root)
    def test_links_reject_root_escape(self):
        (self.root/'README.md').write_text('[bad](../outside.md)',encoding='utf-8')
        with self.assertRaises(ValueError): checks.check_local_links(self.root)
    def test_private_key_marker_rejected(self):
        marker = '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----\nnot-a-real-key\n'
        (self.root/'innocent.txt').write_text(marker)
        with self.assertRaises(ValueError): checks.check_secrets(self.root)
    def test_sensitive_filename_rejected(self):
        (self.root/'id_ed25519').write_text('not-a-real-key')
        with self.assertRaises(ValueError): checks.check_secrets(self.root)
    def test_backlog_dependencies_are_valid_acyclic(self):
        data=json.loads((ROOT/'docs/planning/backlog.json').read_text(encoding='utf-8'))
        items={i['id']:i for i in data['items']}
        self.assertEqual(len(items),28)
        visited, active=set(),set()
        def visit(id):
            self.assertIn(id,items)
            self.assertNotIn(id,active,'Cyclic backlog dependency')
            if id in visited:return
            active.add(id)
            for dep in items[id]['dependencies']: visit(dep)
            active.remove(id);visited.add(id)
        for id in items:visit(id)
    def test_original_import_has_27_matching_digests(self):
        self.assertEqual(checks.verify_manifest(ROOT/'docs/startup'),27)

if __name__ == '__main__':
    unittest.main(verbosity=2)
