#!/usr/bin/env python3
"""Offline SSOT consistency checks, NOT Pi/API/runtime compatibility tests."""
from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path
import re
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
SSOT = ROOT / 'docs' / 'ssot'
MODES = {'direct', 'adapt', 'selective-port', 'evaluate', 'own'}


def load_json(path: Path) -> dict:
    result = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(result, dict):
        raise ValueError(f'Expected JSON object: {path.name}')
    return result


def evidence_ids() -> set[str]:
    return set(re.findall(r'^\| ((?:P|C|L)\d{2}) \|',
                          (SSOT/'upstream-evidence.md').read_text(encoding='utf-8'), re.M))


def validate_reuse_map(data: dict, known_evidence: set[str]) -> None:
    if data.get('schemaVersion') != 1 or data.get('decision') != 'reuse-first':
        raise ValueError('Unsupported reuse-map schema or decision')
    if data.get('implementationStatus') != 'documentation_only':
        raise ValueError('This document-only baseline must not assert an implementation')
    upstream = data.get('upstream', {})
    if not re.fullmatch(r'[a-f0-9]{40}', upstream.get('sourceCommit', '')):
        raise ValueError('Missing exact upstream source commit')
    if upstream.get('releaseTarballVerified') is not False or upstream.get('npmVersionPinned') is not None:
        raise ValueError('Update evidence and checks before claiming release verification')
    items = data.get('items')
    if not isinstance(items, list) or not items:
        raise ValueError('Expected non-empty reuse-map items')
    seen = set()
    for item in items:
        ident = item.get('id')
        if not isinstance(ident, str) or not re.fullmatch(r'[a-z]+(?:-[a-z]+)*', ident) or ident in seen:
            raise ValueError('Invalid or duplicate capability ID')
        seen.add(ident)
        if item.get('mode') not in MODES:
            raise ValueError('Unknown reuse mode')
        evidence = item.get('evidence')
        if not isinstance(evidence, list) or not evidence or any(x not in known_evidence for x in evidence):
            raise ValueError('Unknown or empty evidence references')
        for key in ('reuse', 'productDelta', 'acceptanceGate'):
            if not isinstance(item.get(key), str) or not item[key].strip():
                raise ValueError(f'Capability {ident} lacks {key}')
        if item.get('implementationState') != 'not_implemented':
            raise ValueError('Document-only revision cannot mark capabilities implemented')
        if not isinstance(item.get('upstreamSymbolsOrPaths'), list):
            raise ValueError('Missing upstream symbol/path list')


def validate_backlog(data: dict, capabilities: set[str]) -> None:
    items = data.get('items', [])
    ids = {i['id'] for i in items}
    if len(items) != 28 or len(ids) != 28:
        raise ValueError('Keep the original 28 unique work items')
    for item in items:
        refs = item.get('reuseRefs')
        if not isinstance(refs, list) or not refs or not set(refs) <= capabilities:
            raise ValueError('Work item refers to unknown capability')
        if not set(item['dependencies']) <= ids:
            raise ValueError('Unknown dependency')
        if item.get('githubIssueNumber') is not None or item.get('state') != 'proposed':
            raise ValueError('This revision has not created issues or implemented backlog work')
        if item.get('implementationStatus') != 'not_implemented':
            raise ValueError('Unexpected completed-work claim')


class SsotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mapping = load_json(SSOT/'reuse-map.json')
        cls.backlog = load_json(ROOT/'docs/planning/backlog.json')
        cls.evidence = evidence_ids()
        cls.ids = {i['id'] for i in cls.mapping['items']}

    def test_current_map_is_consistent(self):
        validate_reuse_map(self.mapping, self.evidence)
        self.assertEqual(len(self.ids), 22)

    def test_backlog_refs_and_pending_status(self):
        validate_backlog(self.backlog, self.ids)

    def test_duplicate_capability_rejected(self):
        data = copy.deepcopy(self.mapping)
        data['items'].append(copy.deepcopy(data['items'][0]))
        with self.assertRaises(ValueError):
            validate_reuse_map(data, self.evidence)

    def test_unknown_mode_rejected(self):
        data = copy.deepcopy(self.mapping)
        data['items'][0]['mode'] = 'copy-everything'
        with self.assertRaises(ValueError):
            validate_reuse_map(data, self.evidence)

    def test_unknown_evidence_rejected(self):
        data = copy.deepcopy(self.mapping)
        data['items'][0]['evidence'] = ['P99']
        with self.assertRaises(ValueError):
            validate_reuse_map(data, self.evidence)

    def test_unverified_release_cannot_be_reported_verified(self):
        data = copy.deepcopy(self.mapping)
        data['upstream']['releaseTarballVerified'] = True
        with self.assertRaises(ValueError):
            validate_reuse_map(data, self.evidence)

    def test_blank_acceptance_rejected(self):
        data = copy.deepcopy(self.mapping)
        data['items'][0]['acceptanceGate'] = ''
        with self.assertRaises(ValueError):
            validate_reuse_map(data, self.evidence)

    def test_unknown_backlog_capability_rejected(self):
        data = copy.deepcopy(self.backlog)
        data['items'][0]['reuseRefs'] = ['not-a-capability']
        with self.assertRaises(ValueError):
            validate_backlog(data, self.ids)

    def test_nonexistent_issue_claim_rejected(self):
        data = copy.deepcopy(self.backlog)
        data['items'][0]['githubIssueNumber'] = 1
        with self.assertRaises(ValueError):
            validate_backlog(data, self.ids)

    def test_all_document_evidence_markers_defined(self):
        for path in SSOT.glob('*.md'):
            refs = set(re.findall(r'\[((?:P|C|L)\d{2})\]', path.read_text(encoding='utf-8')))
            self.assertTrue(refs <= self.evidence, (path.name, refs-self.evidence))

    def test_navigation_and_scope_have_current_entry(self):
        for name in ('README.md', 'AGENTS.md', 'docs/README.md', 'docs/planning/NEXT_STEPS.md'):
            self.assertIn('ssot/', (ROOT/name).read_text(encoding='utf-8'))
        entry = (SSOT/'README.md').read_text(encoding='utf-8')
        self.assertIn('docs/startup/', entry)
        self.assertIn('不代表实现', entry)

    def test_original_snapshot_intact(self):
        spec = importlib.util.spec_from_file_location('doc_checks', ROOT/'scripts/check-docs.py')
        if spec is None or spec.loader is None:
            raise RuntimeError('Cannot load existing document checks')
        checks = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(checks)
        self.assertEqual(checks.verify_manifest(ROOT/'docs/startup'), 27)


def main() -> int:
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(SsotTests))
    report = {
        'scope': 'SSOT document/JSON consistency only; no Pi install, real model, app or OS compatibility test',
        'testsRun': result.testsRun,
        'passed': result.testsRun-len(result.errors)-len(result.failures)-len(result.skipped),
        'failures': len(result.failures), 'errors': len(result.errors), 'skipped': len(result.skipped),
        'reuseCapabilities': 22, 'backlogItems': 28,
    }
    target = ROOT/'.artifacts/ssot-checks.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    sys.exit(main())
