import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import * as pi from '@earendil-works/pi-coding-agent';
import { createProbeServices } from './probe.ts';
import { contentId, contentLoader, inspectContent, materializeContent, ResourceAdmission } from './resource-probe.ts';

const root = process.env.PI_PROBE_ROOT;
assert.ok(root, 'Use npm run test:pi-resources');
assert.equal(process.permission.has('child'), false);

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
function fixture() {
  const dir = mkdtempSync(join(root!, 'resources-'));
  const cwd = join(dir, 'workspace');
  const agentDir = join(dir, 'agent');
  const source = join(dir, 'source');
  for (const path of [cwd, agentDir, source]) mkdirSync(path);
  // Synthetic repository boundary keeps Pi ancestor discovery within this fixture.
  mkdirSync(join(cwd, '.git'));
  return { dir, cwd, agentDir, source };
}
function content(source: string, version: string): void {
  write(join(source, 'package.json'), JSON.stringify({ name: 'synthetic-a3-content', version: '1.0.0',
    pi: { skills: ['skills'], extensions: ['extensions'] } }));
  write(join(source, 'skills', 'synthetic-report', 'SKILL.md'),
    `---\nname: synthetic-report\ndescription: Synthetic ${version} instructions\n---\n[SYNTHETIC] Read templates/report.md and scripts/report.js as data only.\n`);
  write(join(source, 'skills', 'synthetic-report', 'templates', 'report.md'), `SYNTHETIC template ${version}`);
  write(join(source, 'skills', 'synthetic-report', 'scripts', 'report.js'), `throw new Error('SYNTHETIC script must not execute: ${version}');`);
  write(join(source, 'extensions', 'unapproved.js'), "throw new Error('SYNTHETIC unapproved module must never import'); export default () => {};");
}
function snapshot(p: ReturnType<typeof fixture>, name: string) {
  return materializeContent({ source: p.source, destination: join(p.dir, name),
    approvedDigest: contentId(inspectContent(p.source)), externalDependencies: [], expectedSkillNames: ['synthetic-report'] });
}
async function sessionFixture() {
  const p = fixture();
  const services = await createProbeServices(p);
  const resources = contentLoader(p);
  const manager = pi.SessionManager.inMemory(p.cwd);
  // Pi advertises skills only with read/bash available. Register an explicitly denied read tool;
  // no file operation/model is invoked, and resource activation cannot change this policy.
  const read = pi.defineTool({ ...pi.createReadToolDefinition(p.cwd),
    execute: async () => { throw new Error('SYNTHETIC tool authorization denied'); } });
  const { session } = await pi.createAgentSession({ ...services, resourceLoader: resources.loader,
    sessionManager: manager, tools: ['read'], customTools: [read], noTools: 'builtin', thinkingLevel: 'off' });
  await session.bindExtensions({});
  return { ...p, resources, manager, session, admission: new ResourceAdmission(session, resources) };
}
const admitted = { hostSettled: () => true, commitLock: async (_id: string) => {} };

test('A3 release exports are runtime/type/method distinct and stable root imports', () => {
  for (const name of ['DefaultPackageManager', 'DefaultResourceLoader', 'loadSkills', 'loadSkillsFromDir', 'formatSkillsForPrompt']) {
    assert.equal(typeof Reflect.get(pi, name), 'function');
  }
  for (const name of ['Skill', 'ResourceLoader', 'PackageManager', 'ResolvedPaths', 'ProgressEvent']) assert.equal(Object.hasOwn(pi, name), false);
  for (const method of ['resolve', 'install', 'update', 'listConfiguredPackages']) {
    assert.equal(typeof Reflect.get(pi.DefaultPackageManager.prototype, method), 'function');
    assert.equal(Object.hasOwn(pi, method), false);
  }
});

test('resource-preload-allowlist: global/project modules never import; unapproved inline factory never runs', async () => {
  const p = fixture();
  const marker = join(p.dir, 'unapproved-executed');
  const trap = `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'SYNTHETIC'); export default () => {};`;
  // Synthetic user/global and workspace discovery traps; none is a real extension.
  for (const base of [p.agentDir, join(p.cwd, '.pi'), join(process.env.HOME!, '.pi', 'agent')]) {
    write(join(base, 'extensions', 'trap.mjs'), trap);
    write(join(base, 'skills', 'trap', 'SKILL.md'), '---\nname: trap\ndescription: SYNTHETIC unapproved skill\n---\ntrap');
    write(join(base, 'APPEND_SYSTEM.md'), 'SYNTHETIC UNAPPROVED APPEND');
  }
  write(join(p.cwd, 'AGENTS.md'), 'SYNTHETIC UNAPPROVED CONTEXT');
  let approved = 0;
  let rejected = 0;
  const candidates = [{ approved: false, factory: () => { rejected++; } },
    { approved: true, factory: () => { approved++; } }];
  const loader = new pi.DefaultResourceLoader({ ...p, settingsManager: pi.SettingsManager.inMemory(),
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    systemPrompt: 'SYNTHETIC explicit system prompt', appendSystemPrompt: [],
    extensionFactories: candidates.filter(item => item.approved).map(item => item.factory) });
  await loader.reload();
  assert.equal(approved, 1);
  assert.equal(rejected, 0);
  assert.equal(existsSync(marker), false);
  assert.deepEqual(loader.getSkills().skills, []);
  assert.deepEqual(loader.getAgentsFiles().agentsFiles, []);
  assert.deepEqual(loader.getAppendSystemPrompt(), []);
  assert.equal(loader.getExtensions().extensions.length, 1);
  assert.deepEqual(loader.getExtensions().errors, []);
  content(p.source, 'A');
  const resources = contentLoader(p);
  resources.select(snapshot(p, 'approved'));
  await resources.loader.reload();
  assert.deepEqual(resources.loader.getSkills().skills.map(skill => skill.name), ['synthetic-report']);
  assert.deepEqual(resources.loader.getExtensions().extensions, []);
  assert.equal(existsSync(marker), false);
});

test('resource-snapshot-closure: Pi parsing/formatting, full template/script bytes, source changes preserve A', async () => {
  const p = fixture();
  content(p.source, 'A');
  const a = snapshot(p, 'A');
  const resources = contentLoader(p);
  resources.select(a);
  await resources.loader.reload();
  const actual = resources.loader.getSkills();
  const expected = pi.loadSkillsFromDir({ dir: join(a.root, 'skills'), source: 'synthetic-a3' });
  assert.equal(actual.skills[0].name, expected.skills[0].name);
  assert.equal(actual.skills[0].description, expected.skills[0].description);
  assert.equal(actual.skills[0].filePath, expected.skills[0].filePath);
  assert.equal(pi.formatSkillsForPrompt(actual.skills), pi.formatSkillsForPrompt(expected.skills));
  assert.match(pi.formatSkillsForPrompt(actual.skills), /Synthetic A instructions/);
  assert.doesNotMatch(pi.formatSkillsForPrompt(actual.skills), /Read templates/);
  content(p.source, 'B');
  assert.equal(readFileSync(join(a.root, 'skills/synthetic-report/templates/report.md'), 'utf8'), 'SYNTHETIC template A');
  assert.match(readFileSync(join(a.root, 'skills/synthetic-report/scripts/report.js'), 'utf8'), /execute: A/);
  assert.equal(contentId(inspectContent(a.root)), a.id);
  assert.notEqual(contentId(inspectContent(p.source)), a.id);
  assert.throws(() => writeFileSync(join(a.root, 'skills/synthetic-report/templates/report.md'), 'MUTATION'), /EACCES|EPERM/);
  assert.throws(() => materializeContent({ source: p.source, destination: join(p.dir, 'denied'), approvedDigest: a.id,
    externalDependencies: [], expectedSkillNames: ['synthetic-report'] }), /approval_content_changed/);
});

test('resource snapshots reject external dependency declarations and symlink trees', () => {
  const p = fixture(); content(p.source, 'A');
  assert.throws(() => materializeContent({ source: p.source, destination: join(p.dir, 'denied'),
    approvedDigest: contentId(inspectContent(p.source)), externalDependencies: ['../mutable-template'], expectedSkillNames: [] }), /external_dependency/);
  assert.throws(() => inspectContent(join(root!, 'resource-symlink-case')), /content_symlink/);
});

test('resource-next-run: native Session reload confirms actual B, active A reference remains, disable preserves native history', async () => {
  const p = await sessionFixture();
  try {
    content(p.source, 'A'); const a = snapshot(p, 'A');
    const saved: string[] = [];
    const options = { hostSettled: () => true, commitLock: async (id: string) => { saved.push(id); } };
    await p.admission.prepare(a, options); p.admission.requireReady(a.id);
    assert.match(p.session.systemPrompt, /Synthetic A instructions/);
    const activeA = p.resources.loaded!;
    await p.session.sendCustomMessage({ customType: 'synthetic-a3', content: '[SYNTHETIC] prior skill text A',
      display: true, details: { synthetic: true } }, { triggerTurn: false });
    const history = p.manager.getEntries();
    content(p.source, 'B'); const b = snapshot(p, 'B');
    await assert.rejects(p.admission.prepare(b, { ...options, hostSettled: () => false }), /not_settled/);
    assert.equal(p.resources.loaded, activeA);
    assert.throws(() => p.admission.requireReady(b.id), /blocked/);
    await p.admission.prepare(b, options); p.admission.requireReady(b.id);
    assert.match(p.session.systemPrompt, /Synthetic B instructions/);
    assert.doesNotMatch(p.session.systemPrompt, /Synthetic A instructions/);
    assert.equal(contentId(inspectContent(activeA.root)), a.id);
    assert.throws(() => p.admission.requireReady(a.id), /blocked/);
    const empty = join(p.dir, 'empty-source'); mkdirSync(empty);
    const disabled = materializeContent({ source: empty, destination: join(p.dir, 'disabled'),
      approvedDigest: contentId(inspectContent(empty)), externalDependencies: [], expectedSkillNames: [] });
    await p.admission.prepare(disabled, options); p.admission.requireReady(disabled.id);
    assert.deepEqual(p.session.resourceLoader.getSkills().skills, []);
    assert.doesNotMatch(p.session.systemPrompt, /Synthetic [AB] instructions/);
    assert.deepEqual(p.manager.getEntries(), history);
    assert.deepEqual(p.session.getActiveToolNames(), ['read'], 'Resources do not change the explicitly denied tool policy');
    const tool = p.session.agent.state.tools.find(tool => tool.name === 'read')!;
    await assert.rejects(tool.execute('synthetic-denied', { path: 'anything' }), /authorization denied/);
    assert.deepEqual(saved, [a.id, b.id, disabled.id]);
  } finally { p.session.dispose(); }
});

test('resource-load-failure: Pi diagnostics or missing skill blocks new lock, never silently admits old resources', async () => {
  const p = await sessionFixture();
  try {
    content(p.source, 'A'); const a = snapshot(p, 'A');
    await p.admission.prepare(a, admitted);
    write(join(p.source, 'skills/synthetic-report/SKILL.md'), '---\nname: synthetic-report\ndescription: [malformed\n---\nSYNTHETIC invalid');
    const bad = snapshot(p, 'bad');
    let commits = 0;
    await assert.rejects(p.admission.prepare(bad, { ...admitted, commitLock: async () => { commits++; } }), /resource_load_failed/);
    assert.equal(commits, 0);
    assert.equal(p.resources.loaded, a);
    assert.throws(() => p.admission.requireReady(a.id), /blocked/);
    assert.throws(() => p.admission.requireReady(bad.id), /blocked/);
    rmSync(join(p.source, 'skills/synthetic-report/SKILL.md'));
    const missing = snapshot(p, 'missing');
    await assert.rejects(p.admission.prepare(missing, admitted), /resource_expected_skills_missing/);
    assert.throws(() => p.admission.requireReady(missing.id), /blocked/);
  } finally { p.session.dispose(); }
});

test('public discovery boundary: resolve in a non-repository tries ancestor paths and is denied', async () => {
  const p = fixture(); rmSync(join(p.cwd, '.git'), { recursive: true });
  const manager = new pi.DefaultPackageManager({ ...p, settingsManager: pi.SettingsManager.inMemory() });
  await assert.rejects(manager.resolve(async () => 'error'), { code: 'ERR_ACCESS_DENIED' });
});

test('resource persistence failure, reentrant preparation, and selection change block admission', async () => {
  const p = await sessionFixture();
  try {
    content(p.source, 'A'); const a = snapshot(p, 'A');
    content(p.source, 'B'); const b = snapshot(p, 'B');
    await assert.rejects(p.admission.prepare(a, { ...admitted, commitLock: async () => { throw new Error('SYNTHETIC persistence failure'); } }), /SYNTHETIC persistence/);
    assert.equal(p.resources.loaded, a);
    assert.throws(() => p.admission.requireReady(a.id), /blocked/);
    await assert.rejects(p.admission.prepare(a, { ...admitted, commitLock: async () => {
      await assert.rejects(p.admission.prepare(b, admitted), /in_progress/);
      p.resources.select(b);
    } }), /changed_before_admission/);
    assert.throws(() => p.admission.requireReady(a.id), /blocked/);
    await p.admission.prepare(b, admitted); p.admission.requireReady(b.id);
  } finally { p.session.dispose(); }
});

test('snapshot tampering after load is detected at admission', async () => {
  const p = await sessionFixture();
  try {
    content(p.source, 'A'); const a = snapshot(p, 'A');
    await p.admission.prepare(a, admitted);
    const file = join(a.root, 'skills/synthetic-report/templates/report.md');
    chmodSync(file, 0o644); writeFileSync(file, 'SYNTHETIC owner tampering');
    assert.throws(() => p.admission.requireReady(a.id), /integrity_failure/);
  } finally { p.session.dispose(); }
});
