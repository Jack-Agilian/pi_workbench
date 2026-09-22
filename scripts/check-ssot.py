#!/usr/bin/env python3
"""Offline SSOT schema/evidence checks; never verifies remote facts or runs Pi."""
from __future__ import annotations

import base64
import copy
from datetime import datetime
import importlib.util
import json
from pathlib import Path, PurePosixPath
import re
import sys
import tempfile
import unittest
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SSOT = ROOT / 'docs' / 'ssot'
MODES = {'direct', 'adapt', 'selective-port', 'evaluate', 'own'}
KINDS = {'review', 'static', 'mock', 'sdk', 'model', 'platform', 'release', 'issue'}
TEST_KINDS = KINDS - {'release', 'issue'}
PLATFORMS = {'darwin', 'win32', 'linux', 'not_applicable'}
STATES = {
    'proposed': {'not_implemented'},
    'in_progress': {'not_implemented', 'in_progress'},
    'blocked': {'not_implemented', 'in_progress'},
    'done': {'implemented'},
    'cancelled': {'not_implemented', 'in_progress', 'not_applicable'},
}
EXACT_VERSION = re.compile(r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?')


def obj(value, label: str) -> dict:
    if not isinstance(value, dict):
        raise ValueError(f'{label}: expected object')
    return value


def text(value, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f'{label}: expected nonblank string')
    return value


def strings(value, label: str, *, nonempty: bool = False) -> list[str]:
    if not isinstance(value, list) or (nonempty and not value):
        raise ValueError(f'{label}: expected {"nonempty " if nonempty else ""}list')
    for entry in value:
        text(entry, label)
    if len(set(value)) != len(value):
        raise ValueError(f'{label}: duplicate entry')
    return value


def members(value, allowed: set[str], label: str, *, nonempty: bool = False) -> list[str]:
    values = strings(value, label, nonempty=nonempty)
    if not set(values) <= allowed:
        raise ValueError(f'{label}: unknown value')
    return values


def choice(value, allowed: set[str], label: str) -> str:
    text(value, label)
    if value not in allowed:
        raise ValueError(f'{label}: unknown value {value!r}')
    return value


def commit_sha(value, label: str) -> str:
    if not re.fullmatch(r'[a-f0-9]{40}', text(value, label)):
        raise ValueError(f'{label}: expected full Git commit SHA')
    return value


def exact_version(value, label: str) -> str:
    # An exact-version shape check, NOT an npm/semver resolver.
    if not EXACT_VERSION.fullmatch(text(value, label)):
        raise ValueError(f'{label}: specify an exact version, not a range/tag')
    return value


def https_url(value, label: str) -> str:
    parsed = urlsplit(text(value, label))
    if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError(f'{label}: expected HTTPS URL without embedded credentials')
    return value


def local_file(value, root: Path, label: str) -> Path:
    path = PurePosixPath(text(value, label))
    if path.is_absolute() or '..' in path.parts or '\\' in value or ':' in value:
        raise ValueError(f'{label}: unsafe relative file')
    if any(part in {'.git', '.venv', '.artifacts', 'node_modules'} for part in path.parts):
        raise ValueError(f'{label}: use a durable tracked summary or HTTPS result, not ignored output')
    full = root.joinpath(*path.parts)
    if not full.resolve().is_relative_to(root.resolve()) or not full.is_file():
        raise ValueError(f'{label}: missing/outside file')
    current = root
    for part in path.parts:
        current /= part
        if current.is_symlink():
            raise ValueError(f'{label}: symlink not accepted')
    return full


def load_json(path: Path) -> dict:
    return obj(json.loads(path.read_text(encoding='utf-8')), path.name)


def evidence_ids() -> set[str]:
    return set(re.findall(r'^\| ((?:P|C|L|U)\d{2}) \|',
                          (SSOT / 'upstream-evidence.md').read_text(encoding='utf-8'), re.M))


def validate_records(value, root: Path) -> dict[str, dict]:
    if not isinstance(value, list):
        raise ValueError('evidenceRecords: expected list')
    records = {}
    for entry in value:
        entry = obj(entry, 'evidence record')
        ident = text(entry.get('id'), 'evidence ID')
        if not re.fullmatch(r'EV-[A-Za-z0-9-]+', ident) or ident in records:
            raise ValueError('Invalid/duplicate evidence ID')
        choice(entry.get('kind'), KINDS, 'evidence kind')
        choice(entry.get('result'), {'passed', 'failed'}, 'evidence result')
        text(entry.get('scope'), 'evidence scope')
        commit_sha(entry.get('commit'), 'evidence commit')
        try:
            date = datetime.fromisoformat(text(entry.get('recordedAt'), 'recordedAt').replace('Z', '+00:00'))
        except ValueError as exc:
            raise ValueError('Evidence timestamp must be ISO-8601 with timezone') from exc
        if date.tzinfo is None:
            raise ValueError('Evidence timestamp needs timezone')
        members(entry.get('platforms'), PLATFORMS, 'evidence platforms', nonempty=True)
        locator = text(entry.get('locator'), 'evidence locator')
        if urlsplit(locator).scheme:
            https_url(locator, 'evidence locator')
        else:
            local_file(locator, root, 'evidence locator')
        records[ident] = entry
    return records


def references(value, records: dict[str, dict], label: str, *, required: bool = False,
               passed: bool = False) -> list[dict]:
    ids = strings(value, label, nonempty=required)
    if not set(ids) <= records.keys():
        raise ValueError(f'{label}: unknown evidence reference')
    rows = [records[ident] for ident in ids]
    if passed and any(row['result'] != 'passed' for row in rows):
        raise ValueError(f'{label}: failed evidence cannot substantiate completion')
    return rows


def validate_integrity(value) -> None:
    match = re.fullmatch(r'(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})', text(value, 'integrity'))
    if not match:
        raise ValueError('Use a SHA-256/384/512 SRI integrity value')
    try:
        digest = base64.b64decode(match[2], validate=True)
    except ValueError as exc:
        raise ValueError('Invalid integrity encoding') from exc
    if len(digest) != {'sha256': 32, 'sha384': 48, 'sha512': 64}[match[1]]:
        raise ValueError('Wrong integrity digest length')


def validate_reuse_map(data: dict, known_evidence: set[str], root: Path = ROOT) -> dict[str, dict]:
    obj(data, 'reuse-map')
    if data.get('schemaVersion') != 2 or data.get('decision') != 'reuse-first':
        raise ValueError('Expected reuse-map schemaVersion 2 / reuse-first')
    summary = choice(data.get('implementationStatus'),
                     {'documentation_only', 'in_progress', 'implemented'}, 'implementationStatus')
    records = validate_records(data.get('evidenceRecords'), root)
    upstream = obj(data.get('upstream'), 'upstream')
    commit_sha(upstream.get('sourceCommit'), 'sourceCommit')
    verified = upstream.get('releaseTarballVerified')
    if type(verified) is not bool:
        raise ValueError('releaseTarballVerified must be boolean')
    pinned = upstream.get('npmVersionPinned')
    if pinned is not None:
        exact_version(pinned, 'npmVersionPinned')
    artifact = upstream.get('releaseArtifact')
    if verified or artifact is not None:
        artifact = obj(artifact, 'releaseArtifact')
        text(artifact.get('package'), 'release package')
        if artifact.get('version') != pinned or pinned is None:
            raise ValueError('Release version must match exact pinned version')
        https_url(artifact.get('tarballUrl'), 'tarballUrl')
        validate_integrity(artifact.get('integrity'))
        text(artifact.get('nodeVersion'), 'tested nodeVersion')
        local_file(artifact.get('lockfilePath'), root, 'lockfilePath')
        proof = references(artifact.get('evidenceRefs'), records, 'release evidence', required=verified, passed=verified)
        if verified and not any(e['kind'] == 'release' for e in proof):
            raise ValueError('Release verification requires release evidence')
    entries = data.get('items')
    if not isinstance(entries, list) or not entries:
        raise ValueError('Expected nonempty capability list')
    seen = set()
    for item in entries:
        item = obj(item, 'capability')
        ident = text(item.get('id'), 'capability ID')
        if not re.fullmatch(r'[a-z]+(?:-[a-z]+)*', ident) or ident in seen:
            raise ValueError('Invalid/duplicate capability ID')
        seen.add(ident)
        mode = choice(item.get('mode'), MODES, 'reuse mode')
        members(item.get('evidence'), known_evidence, 'source evidence', nonempty=True)
        for key in ('reuse', 'productDelta', 'acceptanceGate'):
            text(item.get(key), f'{ident}.{key}')
        strings(item.get('upstreamSymbolsOrPaths'), 'symbols/paths')
        state = choice(item.get('implementationState'),
                       {'not_implemented', 'in_progress', 'implemented', 'deferred'}, 'capability state')
        if summary == 'documentation_only' and state in {'in_progress', 'implemented'}:
            raise ValueError('Update aggregate implementationStatus when capability work starts')
        if summary == 'implemented' and state not in {'implemented', 'deferred'}:
            raise ValueError('Aggregate implemented still contains unfinished capabilities')
        adoption = obj(item.get('adoption'), 'adoption')
        status = choice(adoption.get('status'), {'candidate', 'selected', 'deferred', 'not_applicable'}, 'adoption status')
        if status == 'not_applicable' and mode != 'own':
            raise ValueError('Only product-owned capability may omit adoption as not_applicable')
        source = adoption.get('selectedSourceCommit')
        if source is not None:
            commit_sha(source, 'selectedSourceCommit')
        imports = adoption.get('imports')
        if not isinstance(imports, list):
            raise ValueError('adoption.imports must be a list')
        selected_versions = []
        for entry in imports:
            entry = obj(entry, 'import entry')
            package = text(entry.get('package'), 'package')
            path = text(entry.get('importFrom'), 'importFrom')
            if path != package and not path.startswith(package + '/'):
                raise ValueError('Import must belong to the named public package')
            exports = entry.get('exports')
            if not isinstance(exports, list) or not exports:
                raise ValueError('Expected exported symbols and their runtime/type distinction')
            names = set()
            for export in exports:
                export = obj(export, 'export')
                name = text(export.get('name'), 'export name')
                if name in names:
                    raise ValueError('Duplicate export name')
                names.add(name)
                choice(export.get('kind'), {'runtime', 'type'}, 'export kind')
            version = entry.get('selectedVersion')
            if version is not None:
                exact_version(version, 'selectedVersion')
            selected_versions.append(version)
        check = choice(adoption.get('verificationStatus'),
                       {'unverified', 'source_reviewed', 'release_verified', 'verified'}, 'verificationStatus')
        proof = references(adoption.get('testEvidence'), records, 'capability testEvidence',
                           required=check in {'release_verified', 'verified'}, passed=check in {'release_verified', 'verified'})
        if status == 'selected' and not (source or imports and all(selected_versions)):
            raise ValueError('Selected adoption requires pinned public packages or an exact source commit')
        if check == 'release_verified':
            if not imports or not all(selected_versions) or not any(e['kind'] == 'release' for e in proof):
                raise ValueError('Release-verified adoption needs versions and release evidence')
        if check == 'verified' and (not any(e['kind'] in TEST_KINDS for e in proof)
                                    or status not in {'selected', 'not_applicable'}):
            raise ValueError('Verified adoption needs selected inputs and scoped test/review evidence')
        if state == 'implemented' and check != 'verified':
            raise ValueError('Implemented capability needs scoped verification evidence')
    return records


def validate_dependency_graph(items: list[dict], fields=('dependencies', 'acceptanceDependencies')) -> None:
    """One graph check shared with test-tools; union prevents completion deadlocks."""
    if not isinstance(items, list) or not items:
        raise ValueError('Expected nonempty work items')
    index = {}
    for item in items:
        item = obj(item, 'work item')
        ident = text(item.get('id'), 'work ID')
        if ident in index:
            raise ValueError('Duplicate work ID')
        index[ident] = item
    graph = {}
    for ident, item in index.items():
        graph[ident] = set()
        for field in fields:
            graph[ident].update(strings(item.get(field), f'{ident}.{field}'))
        if not graph[ident] <= index.keys():
            raise ValueError('Unknown dependency')
    visited, active = set(), set()
    def visit(ident):
        if ident in active:
            raise ValueError('Cyclic backlog dependency (including acceptanceDependencies)')
        if ident in visited:
            return
        active.add(ident)
        for dep in graph[ident]:
            visit(dep)
        active.remove(ident)
        visited.add(ident)
    for ident in graph:
        visit(ident)


def validate_milestones(value, records: dict[str, dict]) -> dict[str, dict]:
    if not isinstance(value, list) or not value:
        raise ValueError('Expected milestone list')
    graph = []
    index = {}
    for item in value:
        item = obj(item, 'milestone')
        ident = text(item.get('id'), 'milestone ID')
        if ident in index:
            raise ValueError('Duplicate milestone')
        index[ident] = item
        state = choice(item.get('state'), {'pending', 'blocked', 'passed'}, 'milestone state')
        text(item.get('acceptance'), 'milestone acceptance')
        kinds = members(item.get('requiredEvidenceKinds'), KINDS, 'milestone kinds', nonempty=True)
        platforms = members(item.get('requiredPlatforms'), PLATFORMS, 'milestone platforms')
        graph.append({'id': ident, 'dependencies': strings(item.get('prerequisites'), 'milestone prerequisites')})
        proof = references(item.get('evidenceRefs'), records, 'milestone evidence', required=state == 'passed', passed=state == 'passed')
        if state == 'passed':
            if not set(kinds) <= {e['kind'] for e in proof}:
                raise ValueError('Milestone evidence kinds do not meet the gate')
            if not set(platforms) <= {p for e in proof for p in e['platforms']}:
                raise ValueError('Milestone platform evidence missing')
    validate_dependency_graph(graph, ('dependencies',))
    for item in index.values():
        if item['state'] == 'passed' and any(index[d]['state'] != 'passed' for d in item['prerequisites']):
            raise ValueError('Milestone prerequisites have not passed')
    # The documented M0 levels cannot silently be renamed or reduced to "Mock or Pi".
    required = {'M0-UI': {'mock'}, 'M0-SDK': {'release', 'sdk'}, 'M0-Pi': {'model', 'platform'}}
    for ident, kinds in required.items():
        if ident not in index or not kinds <= set(index[ident]['requiredEvidenceKinds']):
            raise ValueError(f'Missing/weakened {ident} evidence gate')
    if not {'M0-UI', 'M0-SDK'} <= set(index['M0-Pi']['prerequisites']):
        raise ValueError('M0-Pi requires both earlier gates')
    for ident in ('M0-UI', 'M0-Pi'):
        if 'darwin' not in index[ident]['requiredPlatforms']:
            raise ValueError('Mac-first M0 requires explicit darwin evidence; change SSOT before removing')
    return index


def validate_backlog(data: dict, capabilities: set[str], records: dict[str, dict] | None = None) -> None:
    obj(data, 'backlog')
    if data.get('schemaVersion') != 2:
        raise ValueError('Expected backlog schemaVersion 2')
    records = records or {}
    milestones = validate_milestones(data.get('milestones'), records)
    entries = data.get('items')
    validate_dependency_graph(entries)
    index = {i['id']: i for i in entries}
    criterion_ids = set()
    for item in entries:
        ident = item['id']
        if not re.fullmatch(r'[A-Z][A-Z0-9]*-\d+', ident):
            raise ValueError('Invalid work ID')
        members(item.get('reuseRefs'), capabilities, 'reuseRefs', nonempty=True)
        text(item.get('ownerRole'), 'ownerRole')
        choice(item.get('priority'), {'P0', 'P1', 'P2'}, 'priority')
        text(item.get('workAndAcceptance'), 'workAndAcceptance')
        state = choice(item.get('state'), set(STATES), 'work state')
        choice(item.get('implementationStatus'), STATES[state], 'implementationStatus for state')
        if state in {'blocked', 'cancelled'}:
            text(item.get('statusReason'), 'statusReason')
        issue = item.get('githubIssueNumber')
        check = choice(item.get('issueVerificationStatus'), {'not_checked', 'verified'}, 'issue verification')
        proof = references(item.get('issueEvidence'), records, 'issue evidence', required=check == 'verified', passed=check == 'verified')
        if issue is None:
            if item.get('githubIssueUrl') is not None or check != 'not_checked' or proof:
                raise ValueError('Issue metadata supplied without an issue number')
        else:
            if type(issue) is not int or issue <= 0:
                raise ValueError('Issue number must be a positive integer')
            url = f'https://github.com/Jack-Agilian/pi_workbench/issues/{issue}'
            if item.get('githubIssueUrl') != url:
                raise ValueError('Issue URL must match this repository and issue number')
            if check == 'verified' and not any(e['kind'] == 'issue' and e['locator'] == url for e in proof):
                raise ValueError('Verified issue needs matching issue evidence; offline does not fetch it')
        kinds = members(item.get('requiredEvidenceKinds'), TEST_KINDS | {'release'}, 'required evidence kinds', nonempty=True)
        criteria = item.get('acceptanceCriteria')
        if not isinstance(criteria, list) or not criteria:
            raise ValueError('Expected nonempty acceptanceCriteria')
        acceptance_proof = []
        for criterion in criteria:
            criterion = obj(criterion, 'criterion')
            cid = text(criterion.get('id'), 'criterion ID')
            if not cid.startswith(ident + '-A') or cid in criterion_ids:
                raise ValueError('Invalid/duplicate criterion ID')
            criterion_ids.add(cid)
            text(criterion.get('requirement'), 'criterion requirement')
            strings(criterion.get('plannedChecks'), 'planned checks', nonempty=True)
            acceptance_proof += references(criterion.get('evidenceRefs'), records, 'criterion evidence', required=state == 'done', passed=state == 'done')
        milestone_deps = members(item.get('milestoneDependencies', []), set(milestones), 'milestoneDependencies')
        if state == 'done':
            if not set(kinds) <= {e['kind'] for e in acceptance_proof}:
                raise ValueError('Done work lacks required evidence kinds')
            if any(index[d]['state'] != 'done' for d in set(item['dependencies']) | set(item['acceptanceDependencies'])):
                raise ValueError('Done work has unfinished integration/development dependencies')
            if any(milestones[d]['state'] != 'passed' for d in milestone_deps):
                raise ValueError('Done work has unmet milestone gates')


def fixtures(root: Path) -> tuple[dict, dict]:
    """Synthetic in-memory records for validator tests, never written to the SSOT."""
    (root / 'evidence.json').write_text('{"synthetic":true}\n', encoding='utf-8')
    (root / 'package-lock.json').write_text('{"lockfileVersion":3}\n', encoding='utf-8')
    record = {'id': 'EV-unit', 'kind': 'static', 'result': 'passed', 'scope': 'synthetic validator fixture, NOT implementation evidence',
              'commit': 'a' * 40, 'recordedAt': '2026-09-22T00:00:00Z', 'platforms': ['linux'], 'locator': 'evidence.json'}
    mapping = {'schemaVersion': 2, 'decision': 'reuse-first', 'implementationStatus': 'documentation_only',
               'upstream': {'sourceCommit': 'a' * 40, 'npmVersionPinned': None, 'releaseTarballVerified': False, 'releaseArtifact': None},
               'evidenceRecords': [record], 'items': [{'id': 'sample', 'mode': 'own', 'evidence': ['P01'], 'upstreamSymbolsOrPaths': [],
               'reuse': 'existing code', 'productDelta': 'fixture only', 'acceptanceGate': 'fixture acceptance', 'implementationState': 'not_implemented',
               'adoption': {'status': 'not_applicable', 'imports': [], 'selectedSourceCommit': None, 'verificationStatus': 'source_reviewed', 'testEvidence': []}}]}
    milestones = [
        {'id': 'M0-UI', 'state': 'pending', 'requiredEvidenceKinds': ['mock'], 'requiredPlatforms': ['darwin'], 'prerequisites': [], 'evidenceRefs': [], 'acceptance': 'mock desktop'},
        {'id': 'M0-SDK', 'state': 'pending', 'requiredEvidenceKinds': ['release', 'sdk'], 'requiredPlatforms': [], 'prerequisites': [], 'evidenceRefs': [], 'acceptance': 'real package/SDK'},
        {'id': 'M0-Pi', 'state': 'pending', 'requiredEvidenceKinds': ['model', 'platform'], 'requiredPlatforms': ['darwin'], 'prerequisites': ['M0-UI', 'M0-SDK'], 'evidenceRefs': [], 'acceptance': 'authorized real model/platform'}]
    task = {'id': 'UNIT-01', 'priority': 'P0', 'ownerRole': 'Test', 'state': 'proposed', 'implementationStatus': 'not_implemented',
            'githubIssueNumber': None, 'githubIssueUrl': None, 'issueVerificationStatus': 'not_checked', 'issueEvidence': [],
            'dependencies': [], 'acceptanceDependencies': [], 'workAndAcceptance': 'synthetic check', 'reuseRefs': ['sample'],
            'requiredEvidenceKinds': ['static'], 'acceptanceCriteria': [{'id': 'UNIT-01-A01', 'requirement': 'synthetic condition', 'plannedChecks': ['unit-fixture'], 'evidenceRefs': []}]}
    return mapping, {'schemaVersion': 2, 'items': [task], 'milestones': milestones}


class SsotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ssot-unit-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.mapping, self.backlog = fixtures(self.root)

    def validate(self):
        records = validate_reuse_map(self.mapping, {'P01'}, self.root)
        validate_backlog(self.backlog, {i['id'] for i in self.mapping['items']}, records)

    def done(self):
        task = self.backlog['items'][0]
        task.update(state='done', implementationStatus='implemented')
        task['acceptanceCriteria'][0]['evidenceRefs'] = ['EV-unit']

    def add_task(self):
        task = copy.deepcopy(self.backlog['items'][0])
        task['id'] = 'UNIT-02'
        task['acceptanceCriteria'][0]['id'] = 'UNIT-02-A01'
        self.backlog['items'].append(task)
        return task

    def record(self, kind, platform='darwin'):
        entry = copy.deepcopy(self.mapping['evidenceRecords'][0])
        entry.update(id='EV-' + kind, kind=kind, platforms=[platform])
        self.mapping['evidenceRecords'].append(entry)
        return entry['id']

    def release(self):
        ref = self.record('release')
        self.mapping['upstream'].update(npmVersionPinned='1.2.3', releaseTarballVerified=True,
            releaseArtifact={'package': '@example/fixture', 'version': '1.2.3', 'tarballUrl': 'https://example.invalid/fixture.tgz',
                'integrity': 'sha512-' + base64.b64encode(b'x' * 64).decode(), 'nodeVersion': '22.19.0',
                'lockfilePath': 'package-lock.json', 'evidenceRefs': [ref]})

    def test_current_repository(self):
        mapping = load_json(SSOT / 'reuse-map.json')
        registry = validate_reuse_map(mapping, evidence_ids())
        validate_backlog(load_json(ROOT / 'docs/planning/backlog.json'), {i['id'] for i in mapping['items']}, registry)

    def test_fixture_valid(self): self.validate()
    def test_progress_allowed(self):
        self.backlog['items'][0]['state'] = 'in_progress'; self.validate()
    def test_new_task_allowed(self): self.add_task(); self.validate()
    def test_new_capability_allowed(self):
        item = copy.deepcopy(self.mapping['items'][0]); item['id'] = 'another'; self.mapping['items'].append(item); self.validate()
    def test_issue_can_be_recorded_unverified(self):
        self.backlog['items'][0].update(githubIssueNumber=3, githubIssueUrl='https://github.com/Jack-Agilian/pi_workbench/issues/3'); self.validate()
    def test_issue_claim_without_evidence_rejected(self):
        self.backlog['items'][0].update(githubIssueNumber=3, githubIssueUrl='https://github.com/Jack-Agilian/pi_workbench/issues/3', issueVerificationStatus='verified')
        with self.assertRaises(ValueError): self.validate()
    def test_verified_issue_with_record_allowed(self):
        ref = self.record('issue'); url = 'https://github.com/Jack-Agilian/pi_workbench/issues/3'
        self.mapping['evidenceRecords'][-1]['locator'] = url
        self.backlog['items'][0].update(githubIssueNumber=3, githubIssueUrl=url, issueVerificationStatus='verified', issueEvidence=[ref]); self.validate()
    def test_boolean_issue_number_rejected(self):
        self.backlog['items'][0]['githubIssueNumber'] = True
        with self.assertRaises(ValueError): self.validate()
    def test_issue_url_mismatch_rejected(self):
        self.backlog['items'][0].update(githubIssueNumber=3, githubIssueUrl='https://github.com/Jack-Agilian/pi_workbench/issues/4')
        with self.assertRaises(ValueError): self.validate()
    def test_done_with_each_criterion_evidence_allowed(self): self.done(); self.validate()
    def test_done_without_evidence_rejected(self):
        self.backlog['items'][0].update(state='done', implementationStatus='implemented')
        with self.assertRaises(ValueError): self.validate()
    def test_done_missing_one_criterion_rejected(self):
        self.done(); self.backlog['items'][0]['acceptanceCriteria'].append({'id':'UNIT-01-A02','requirement':'second','plannedChecks':['second'],'evidenceRefs':[]})
        with self.assertRaises(ValueError): self.validate()
    def test_done_failed_evidence_rejected(self):
        self.done(); self.mapping['evidenceRecords'][0]['result'] = 'failed'
        with self.assertRaises(ValueError): self.validate()
    def test_done_wrong_evidence_kind_rejected(self):
        self.done(); self.backlog['items'][0]['requiredEvidenceKinds'] = ['sdk']
        with self.assertRaises(ValueError): self.validate()
    def test_done_unfinished_dependency_rejected(self):
        second = self.add_task(); second['acceptanceDependencies'] = ['UNIT-01']; second.update(state='done',implementationStatus='implemented'); second['acceptanceCriteria'][0]['evidenceRefs']=['EV-unit']
        with self.assertRaises(ValueError): self.validate()
    def test_empty_work_acceptance_rejected(self):
        self.backlog['items'][0]['workAndAcceptance'] = '  '
        with self.assertRaises(ValueError): self.validate()
    def test_empty_criterion_rejected(self):
        self.backlog['items'][0]['acceptanceCriteria'][0]['requirement'] = ''
        with self.assertRaises(ValueError): self.validate()
    def test_empty_planned_checks_rejected(self):
        self.backlog['items'][0]['acceptanceCriteria'][0]['plannedChecks'] = []
        with self.assertRaises(ValueError): self.validate()
    def test_duplicate_task_rejected(self):
        self.backlog['items'].append(copy.deepcopy(self.backlog['items'][0]))
        with self.assertRaises(ValueError): self.validate()
    def test_duplicate_capability_rejected(self):
        self.mapping['items'].append(copy.deepcopy(self.mapping['items'][0]))
        with self.assertRaises(ValueError): self.validate()
    def test_unknown_reuse_reference_rejected(self):
        self.backlog['items'][0]['reuseRefs'] = ['missing']
        with self.assertRaises(ValueError): self.validate()
    def test_unknown_reuse_mode_rejected(self):
        self.mapping['items'][0]['mode'] = 'copy-everything'
        with self.assertRaises(ValueError): self.validate()
    def test_blank_capability_acceptance_rejected(self):
        self.mapping['items'][0]['acceptanceGate'] = ' '
        with self.assertRaises(ValueError): self.validate()
    def test_duplicate_criterion_rejected(self):
        item = self.backlog['items'][0]
        item['acceptanceCriteria'].append(copy.deepcopy(item['acceptanceCriteria'][0]))
        with self.assertRaises(ValueError): self.validate()
    def test_done_dependencies_with_evidence_allowed(self):
        self.done(); second = self.add_task(); second['acceptanceDependencies'] = ['UNIT-01']; self.validate()
    def test_malformed_evidence_list_rejected(self):
        self.mapping['evidenceRecords'] = {'not': 'a list'}
        with self.assertRaises(ValueError): self.validate()
    def test_unknown_source_evidence_rejected(self):
        self.mapping['items'][0]['evidence'] = ['P99']
        with self.assertRaises(ValueError): self.validate()
    def test_unknown_test_evidence_rejected(self):
        self.backlog['items'][0]['acceptanceCriteria'][0]['evidenceRefs'] = ['EV-missing']
        with self.assertRaises(ValueError): self.validate()
    def test_unknown_dependency_rejected(self):
        self.backlog['items'][0]['acceptanceDependencies'] = ['MISSING-01']
        with self.assertRaises(ValueError): self.validate()
    def test_self_dependency_rejected(self):
        self.backlog['items'][0]['dependencies'] = ['UNIT-01']
        with self.assertRaises(ValueError): self.validate()
    def test_cycle_across_dependency_types_rejected(self):
        second = self.add_task(); second['dependencies'] = ['UNIT-01']; self.backlog['items'][0]['acceptanceDependencies'] = ['UNIT-02']
        with self.assertRaises(ValueError): self.validate()
    def test_unknown_state_rejected(self):
        self.backlog['items'][0]['state'] = 'probably_done'
        with self.assertRaises(ValueError): self.validate()
    def test_blocked_requires_reason(self):
        self.backlog['items'][0]['state'] = 'blocked'
        with self.assertRaises(ValueError): self.validate()
        self.backlog['items'][0]['statusReason'] = 'waiting for authorized runner'; self.validate()
    def test_release_pin_without_verification_allowed(self):
        self.mapping['upstream']['npmVersionPinned'] = '1.2.3'; self.validate()
    def test_release_verified_with_evidence_allowed(self): self.release(); self.validate()
    def test_release_verified_without_evidence_rejected(self):
        self.mapping['upstream']['releaseTarballVerified'] = True
        with self.assertRaises(ValueError): self.validate()
    def test_release_version_mismatch_rejected(self):
        self.release(); self.mapping['upstream']['releaseArtifact']['version'] = '1.2.4'
        with self.assertRaises(ValueError): self.validate()
    def test_release_range_rejected(self):
        self.mapping['upstream']['npmVersionPinned'] = '^1.2.3'
        with self.assertRaises(ValueError): self.validate()
    def test_release_bad_integrity_rejected(self):
        self.release(); self.mapping['upstream']['releaseArtifact']['integrity'] = 'sha512-eA=='
        with self.assertRaises(ValueError): self.validate()
    def test_release_missing_lock_rejected(self):
        self.release(); self.mapping['upstream']['releaseArtifact']['lockfilePath'] = 'missing-lock.json'
        with self.assertRaises(ValueError): self.validate()
    def test_evidence_missing_file_rejected(self):
        self.mapping['evidenceRecords'][0]['locator'] = 'missing.json'
        with self.assertRaises(ValueError): self.validate()
    def test_evidence_path_escape_rejected(self):
        self.mapping['evidenceRecords'][0]['locator'] = '../outside.json'
        with self.assertRaises(ValueError): self.validate()
    def test_evidence_ignored_output_rejected(self):
        self.mapping['evidenceRecords'][0]['locator'] = '.artifacts/report.json'
        with self.assertRaises(ValueError): self.validate()
    def test_evidence_duplicate_rejected(self):
        self.mapping['evidenceRecords'].append(copy.deepcopy(self.mapping['evidenceRecords'][0]))
        with self.assertRaises(ValueError): self.validate()
    def test_evidence_timestamp_requires_zone(self):
        self.mapping['evidenceRecords'][0]['recordedAt'] = '2026-09-22T00:00:00'
        with self.assertRaises(ValueError): self.validate()
    def test_evidence_url_credentials_rejected(self):
        self.mapping['evidenceRecords'][0]['locator'] = 'https://user:secret@example.invalid/result'
        with self.assertRaises(ValueError): self.validate()
    def test_capability_implementation_requires_evidence(self):
        self.mapping['implementationStatus'] = 'in_progress'; self.mapping['items'][0]['implementationState'] = 'implemented'
        with self.assertRaises(ValueError): self.validate()
    def test_capability_implementation_with_evidence_allowed(self):
        self.mapping['implementationStatus'] = 'in_progress'; self.mapping['items'][0]['implementationState'] = 'implemented'
        self.mapping['items'][0]['adoption'].update(verificationStatus='verified',testEvidence=['EV-unit']); self.validate()
    def test_export_type_distinction_required(self):
        self.mapping['items'][0]['adoption']['imports'] = [{'package':'example','importFrom':'example','exports':[{'name':'Thing','kind':'unknown'}],'selectedVersion':None}]
        with self.assertRaises(ValueError): self.validate()
    def test_selected_import_requires_version(self):
        self.mapping['items'][0]['adoption'].update(status='selected',imports=[{'package':'example','importFrom':'example','exports':[{'name':'Thing','kind':'type'}],'selectedVersion':None}])
        with self.assertRaises(ValueError): self.validate()
    def test_m0_cannot_be_promoted_with_mock_only(self):
        ref = self.record('mock'); self.backlog['milestones'][2].update(state='passed',evidenceRefs=[ref])
        with self.assertRaises(ValueError): self.validate()
    def test_m0_gates_cannot_be_weakened(self):
        self.backlog['milestones'][2]['requiredEvidenceKinds'] = ['mock']
        with self.assertRaises(ValueError): self.validate()
    def test_m0_platform_required(self):
        ref = self.record('mock','linux'); self.backlog['milestones'][0].update(state='passed',evidenceRefs=[ref])
        with self.assertRaises(ValueError): self.validate()
    def test_m0_prerequisite_unmet_rejected(self):
        refs = [self.record('model'),self.record('platform')]; self.backlog['milestones'][2].update(state='passed',evidenceRefs=refs)
        with self.assertRaises(ValueError): self.validate()
    def test_all_m0_evidence_levels_allowed(self):
        for milestone in self.backlog['milestones']:
            milestone.update(state='passed', evidenceRefs=[self.record(kind) for kind in milestone['requiredEvidenceKinds']])
        self.validate()
    def test_done_milestone_dependency_rejected(self):
        self.done(); self.backlog['items'][0]['milestoneDependencies'] = ['M0-Pi']
        with self.assertRaises(ValueError): self.validate()
    def test_document_evidence_markers_defined(self):
        known = evidence_ids()
        for path in SSOT.glob('*.md'):
            refs = set(re.findall(r'\[((?:P|C|L|U)\d{2})\]', path.read_text(encoding='utf-8')))
            self.assertTrue(refs <= known, (path.name, refs-known))
    def test_navigation_and_scope_have_current_entry(self):
        for name in ('README.md','AGENTS.md','docs/README.md','docs/planning/NEXT_STEPS.md'):
            self.assertIn('ssot/', (ROOT/name).read_text(encoding='utf-8'))
        entry = (SSOT/'README.md').read_text(encoding='utf-8')
        self.assertIn('docs/startup/', entry); self.assertIn('不代表实现', entry)
    def test_original_snapshot_intact(self):
        spec = importlib.util.spec_from_file_location('doc_checks', ROOT/'scripts/check-docs.py')
        if spec is None or spec.loader is None: raise RuntimeError('Cannot load document checks')
        checks = importlib.util.module_from_spec(spec); spec.loader.exec_module(checks)
        self.assertEqual(checks.verify_manifest(ROOT/'docs/startup'),27)


def main() -> int:
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(SsotTests))
    def count(path):
        try:
            value = load_json(path).get('items')
            return len(value) if isinstance(value, list) else None
        except (ValueError, OSError):
            return None
    report = {'scope': 'Offline SSOT schema, state, evidence-reference and repository tests only; no remote evidence, Pi, model or app validated',
              'testsRun': result.testsRun, 'passed': result.testsRun-len(result.errors)-len(result.failures)-len(result.skipped),
              'failures': len(result.failures), 'errors': len(result.errors), 'skipped': len(result.skipped),
              'reuseCapabilities': count(SSOT/'reuse-map.json'), 'backlogItems': count(ROOT/'docs/planning/backlog.json'),
              'evidenceFixtures': 'synthetic/in-memory only; never written to formal evidenceRecords'}
    target = ROOT/'.artifacts/ssot-checks.json'; target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n',encoding='utf-8')
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    sys.exit(main())
