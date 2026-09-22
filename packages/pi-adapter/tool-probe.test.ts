import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';
import { validateToolArguments, type ToolCall } from '@earendil-works/pi-ai';
import {
  createAgentSession, SessionManager, defineTool,
  createReadToolDefinition, createEditToolDefinition, createWriteToolDefinition, createBashToolDefinition,
  type AgentSession, type AgentToolResult, type BashOperations,
} from '@earendil-works/pi-coding-agent';
import { createProbeServices } from './probe.ts';
import { createToolProbe, digest, parametersDigest, type ProbeApproval, type ToolObservation, type ToolOperation, type ToolProbeOptions } from './tool-probe.ts';

const root = process.env.PI_PROBE_ROOT;
assert.ok(root, 'Use npm run test:pi-tools for isolated execution');
assert.equal(process.permission.has('child'), false);
const unexpectedBash: BashOperations = { exec: async () => { throw new Error('SYNTHETIC: no command backend approved'); } };
const grant = (operation: ToolOperation, extra: Partial<ProbeApproval> = {}): ProbeApproval => ({
  operationId: operation.operationId, parametersDigest: operation.parametersDigest,
  expiresAt: operation.deadline, ...extra,
});
async function approve(operation: ToolOperation): Promise<ProbeApproval> {
  let fileVersion: string | null | undefined;
  if (operation.target && ['edit', 'write'].includes(operation.tool)) {
    fileVersion = existsSync(operation.target) ? digest(await readFile(operation.target)) : null;
  }
  return grant(operation, { fileVersion });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function setup(t: TestContext, overrides: Partial<Omit<ToolProbeOptions, 'binding'>> = {},
  directory = mkdtempSync(join(root!, 'a2-'))) {
  const cwd = join(directory, '中文 workspace');
  const agentDir = join(directory, 'agent');
  mkdirSync(cwd, { recursive: true }); mkdirSync(agentDir, { recursive: true });
  const observations: ToolObservation[] = [];
  const binding = { runId: 'SYNTHETIC-run-' + directory, runtimeBindingId: directory, runtimeEpoch: 1, workspaceRef: cwd };
  const host = createToolProbe({ binding, deadline: () => Date.now() + 10_000, authorize: approve,
    bash: unexpectedBash, observe: event => observations.push(event), ...overrides });
  // defineTool is Pi's public type-preserving registration helper.
  const customTools = [defineTool(host.read), defineTool(host.edit), defineTool(host.write), defineTool(host.bash)];
  const services = await createProbeServices({ cwd, agentDir });
  const { session } = await createAgentSession({ ...services, sessionManager: SessionManager.inMemory(cwd),
    customTools, tools: ['read', 'edit', 'write', 'bash'], noTools: 'builtin' });
  t.after(() => { host.revoke(); session.dispose(); });
  const rawDefinitions = [defineTool(createReadToolDefinition(cwd, { autoResizeImages: false })),
    defineTool(createEditToolDefinition(cwd)), defineTool(createWriteToolDefinition(cwd)),
    defineTool(createBashToolDefinition(cwd, { operations: overrides.bash ?? unexpectedBash, exposeSessionEnvironment: false }))];
  const { session: raw } = await createAgentSession({ ...services, sessionManager: SessionManager.inMemory(cwd),
    customTools: rawDefinitions, tools: ['read', 'edit', 'write', 'bash'], noTools: 'builtin' });
  t.after(() => raw.dispose());
  return { cwd, directory, host, session, raw, rawDefinitions, observations, binding };
}

// Model-free test driver. Invoke public preparation + validation once, then the
// registered public AgentTool; no Agent Loop replacement or synthetic model stream.
async function invoke(session: AgentSession, name: string, input: Record<string, unknown>, options: {
  id?: string; signal?: AbortSignal; update?: (result: AgentToolResult<unknown>) => void;
} = {}) {
  const tool = session.agent.state.tools.find(item => item.name === name);
  assert.ok(tool, 'Tool must be in the active SDK registry');
  const prepared: unknown = tool.prepareArguments?.(structuredClone(input)) ?? structuredClone(input);
  assert.ok(prepared && typeof prepared === 'object' && !Array.isArray(prepared));
  const call: ToolCall = { type: 'toolCall', id: options.id ?? 'SYNTHETIC-call', name,
    arguments: Object.fromEntries(Object.entries(prepared)) };
  const parameters: unknown = validateToolArguments(tool, call);
  return tool.execute(call.id, parameters, options.signal, options.update);
}
const ioPhases = new Set(['access', 'detect_image', 'read', 'mkdir', 'write_start', 'exec_start']);

test('tool-definition-parity: all public metadata and behavior fields retained', async t => {
  const p = await setup(t);
  for (const [index, definition] of p.host.definitions.entries()) {
    const raw = p.rawDefinitions[index]!;
    assert.deepEqual(Reflect.ownKeys(definition), Reflect.ownKeys(raw));
    const metadata = p.host.metadata[index]!;
    for (const key of Reflect.ownKeys(metadata)) {
      assert.equal(Reflect.get(definition, key), Reflect.get(metadata, key), String(key));
    }
    assert.notEqual(definition.execute, raw.execute);
  }
});

test('tool-denial: four same-name registrations have no active default bypass', async t => {
  const p = await setup(t, { authorize: async () => undefined });
  assert.deepEqual(p.session.getActiveToolNames().sort(), ['bash', 'edit', 'read', 'write']);
  assert.equal(p.session.getAllTools().length, 4);
  for (const info of p.session.getAllTools()) assert.equal(info.sourceInfo?.source, 'sdk');
  p.session.setActiveToolsByName(['read', 'edit', 'write', 'bash', 'grep', 'find', 'ls', 'powershell']);
  assert.equal(p.session.agent.state.tools.length, 4);
  writeFileSync(join(p.cwd, 'data.txt'), 'old');
  for (const [name, input] of [
    ['read', { path: 'data.txt' }], ['edit', { path: 'data.txt', oldText: 'old', newText: 'new' }],
    ['write', { path: 'new/sub.txt', content: 'new' }], ['bash', { command: 'SYNTHETIC unexecuted' }],
  ] as const) await assert.rejects(invoke(p.session, name, input), /approval_denied/);
  assert.equal(readFileSync(join(p.cwd, 'data.txt'), 'utf8'), 'old');
  assert.equal(existsSync(join(p.cwd, 'new')), false);
  assert.equal(p.observations.filter(event => ioPhases.has(event.phase)).length, 0);
});

test('tool-argument-normalization: normal, legacy, string and object edits match Pi', async t => {
  const p = await setup(t);
  const shapes = [
    { edits: [{ oldText: 'one', newText: 'ONE' }] },
    { oldText: 'one', newText: 'ONE' },
    { edits: JSON.stringify([{ oldText: 'one', newText: 'ONE' }]) },
    { edits: { oldText: 'one', newText: 'ONE' } },
    { edits: [{ oldText: 'one', newText: 'ONE' }], oldText: 'two', newText: 'TWO' },
  ];
  for (const shape of shapes) {
    const path = join(p.cwd, '规范.txt'); const initial = '\ufeffone\r\ntwo\r\n';
    writeFileSync(path, initial);
    const expected = await invoke(p.raw, 'edit', { path: '规范.txt', ...shape });
    const bytes = readFileSync(path);
    writeFileSync(path, initial);
    const actual = await invoke(p.session, 'edit', { path: '规范.txt', ...shape });
    assert.deepEqual(actual, expected); assert.deepEqual(readFileSync(path), bytes);
    const operation = p.observations.findLast(event => event.phase === 'approved')!.operation;
    assert.deepEqual(operation.parameters, { path: '规范.txt', edits: shape === shapes[4]
      ? [{ oldText: 'one', newText: 'ONE' }, { oldText: 'two', newText: 'TWO' }]
      : [{ oldText: 'one', newText: 'ONE' }] });
    assert.equal(operation.parametersDigest, parametersDigest(operation.parameters));
    assert.match(JSON.stringify(actual.details), /patch/);
  }
});

test('tool-output-parity: text read, offsets, byte/line truncation and write match Pi', async t => {
  const p = await setup(t);
  const path = join(p.cwd, 'data.txt');
  for (const content of ['hello 中文\nworld', Array.from({ length: 2500 }, (_, i) => `line ${i}`).join('\n'), '字'.repeat(20000)]) {
    writeFileSync(path, content);
    for (const args of [{ path: 'data.txt' }, { path: 'data.txt', offset: '1', limit: 3 }]) {
      assert.deepEqual(await invoke(p.session, 'read', args), await invoke(p.raw, 'read', args));
    }
  }
  const input = { path: 'new/文件.md', content: '# SYNTHETIC\n中文\n' };
  assert.deepEqual(await invoke(p.session, 'write', input), await invoke(p.raw, 'write', input));
  assert.equal(readFileSync(join(p.cwd, input.path), 'utf8'), input.content);
});

test('tool-errors: malformed arguments and edit matching failures retain Pi errors', async t => {
  const p = await setup(t); const path = join(p.cwd, 'data.txt');
  for (const args of [{ path: 'data.txt', edits: 'invalid JSON' }, { path: 'data.txt', edits: [] },
    { path: 'data.txt', edits: [{ oldText: 'missing', newText: 'X' }] },
    { path: 'data.txt', edits: [{ oldText: 'same', newText: 'X' }] },
    { path: 'data.txt', edits: [{ oldText: 'same same', newText: 'X' }, { oldText: 'same', newText: 'Y' }] }]) {
    writeFileSync(path, 'same same');
    let expected: unknown;
    try { await invoke(p.raw, 'edit', args); assert.fail('Must fail'); } catch (error) { expected = error; }
    assert.ok(expected instanceof Error);
    await assert.rejects(invoke(p.session, 'edit', args), { message: expected.message });
    assert.equal(readFileSync(path, 'utf8'), 'same same');
  }
});

test('read-image-parity: public MIME helper retains image output with resize disabled', async t => {
  const p = await setup(t);
  // Explicit synthetic 1x1 PNG, not a model fixture.
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVZkAAAAASUVORK5CYII=', 'base64');
  writeFileSync(join(p.cwd, 'synthetic.png'), bytes);
  const actual = await invoke(p.session, 'read', { path: 'synthetic.png' });
  assert.deepEqual(actual, await invoke(p.raw, 'read', { path: 'synthetic.png' }));
  assert.ok(actual.content.some(item => item.type === 'image'));
  assert.ok(p.observations.some(event => event.phase === 'detect_image'));
});

test('read-path-helper-boundary: Pi fallback resolves outside Operations; changed target is denied', async t => {
  const p = await setup(t);
  writeFileSync(join(p.cwd, 'Capture 1\u202fPM.txt'), 'SYNTHETIC macOS name variant');
  const raw = await invoke(p.raw, 'read', { path: 'Capture 1 PM.txt' });
  assert.deepEqual(raw.content, [{ type: 'text', text: 'SYNTHETIC macOS name variant' }]);
  await assert.rejects(invoke(p.session, 'read', { path: 'Capture 1 PM.txt' }), /unapproved_target/);
  assert.equal(p.observations.filter(event => ioPhases.has(event.phase)).length, 0);
  assert.ok(p.observations.some(event => event.phase === 'approved'));
});

test('late-side-effect: completed write remains attached to revoked originating binding', async t => {
  let revoke: () => void = () => {};
  const events: ToolObservation[] = [];
  const p = await setup(t, { observe: event => {
    events.push(event); if (event.phase === 'write_completed') revoke();
  } });
  revoke = p.host.revoke;
  await assert.rejects(invoke(p.session, 'write', { path: 'completed.txt', content: 'SYNTHETIC completed' }), /binding_revoked/);
  const next = await setup(t);
  const completed = events.find(event => event.phase === 'write_completed')!;
  assert.equal(readFileSync(join(p.cwd, 'completed.txt'), 'utf8'), 'SYNTHETIC completed');
  assert.equal(completed.operation.runtimeBindingId, p.binding.runtimeBindingId);
  assert.notEqual(completed.operation.runtimeBindingId, next.binding.runtimeBindingId);
  assert.equal(next.observations.length, 0);
});

test('operation-revocation: revoke at the final audit boundary prevents the side effect', async t => {
  for (const phase of ['write_start', 'exec_start']) {
    let revoke: () => void = () => {};
    let executions = 0;
    const p = await setup(t, {
      observe: event => { if (event.phase === phase) revoke(); },
      bash: { exec: async () => { executions++; return { exitCode: 0 }; } },
    });
    revoke = p.host.revoke;
    const name = phase === 'write_start' ? 'write' : 'bash';
    await assert.rejects(invoke(p.session, name, name === 'write'
      ? { path: 'never.txt', content: 'SYNTHETIC never' } : { command: 'SYNTHETIC never' }), /binding_revoked/);
    assert.equal(executions, 0); assert.equal(existsSync(join(p.cwd, 'never.txt')), false);
  }
});

test('tool-path-denial: traversal, outside absolute paths, aliases and symlinks do not execute', async t => {
  // Parent runner creates the synthetic symlink BEFORE applying narrow child permissions.
  const p = await setup(t, {}, join(root!, 'symlink-case'));
  writeFileSync(join(p.directory, 'outside.txt'), 'SYNTHETIC protected');
  for (const path of ['../outside.txt', join(p.directory, 'outside.txt'), '~/auth.json', '@outside.txt', 'link/outside.txt']) {
    for (const name of ['read', 'edit', 'write']) {
      await assert.rejects(invoke(p.session, name, { path, content: 'changed', edits: [{ oldText: 'SYNTHETIC', newText: 'BAD' }] }),
        /outside_workspace|unsupported_probe_path|symlink_denied/);
    }
  }
  assert.equal(p.observations.filter(event => event.phase === 'approval_requested' || ioPhases.has(event.phase)).length, 0);
  assert.equal(readFileSync(join(p.directory, 'outside.txt'), 'utf8'), 'SYNTHETIC protected');
});

test('approval-expiry: stale operation, changed digest, expiry and missing precondition reject', async t => {
  for (const extra of [{ operationId: 'SYNTHETIC-other-operation' }, { parametersDigest: 'SYNTHETIC-other-digest' },
    { expiresAt: 0 }, {}]) {
    const p = await setup(t, { authorize: async op => grant(op, extra) });
    await assert.rejects(invoke(p.session, 'write', { path: 'new/file', content: 'never' }),
      /approval_invalid_or_expired|missing_file_precondition/);
    assert.equal(existsSync(join(p.cwd, 'new')), false);
    assert.equal(p.observations.filter(event => ioPhases.has(event.phase)).length, 0);
  }
});

test('approval-normalized-input: immutable approved snapshot prevents mutation during wait', async t => {
  const requested = deferred<ToolOperation>(); const decision = deferred<ProbeApproval>();
  const p = await setup(t, { authorize: async op => { requested.resolve(op); return decision.promise; } });
  const input = { path: 'approved.txt', content: 'approved content' };
  const pending = invoke(p.session, 'write', input);
  const operation = await requested.promise;
  assert.equal(Reflect.set(operation.parameters as object, 'path', 'other.txt'), false);
  assert.equal(Object.isFrozen(operation.parameters), true);
  input.path = 'changed.txt'; input.content = 'unapproved content';
  decision.resolve(grant(operation, { fileVersion: null })); await pending;
  assert.equal(readFileSync(join(p.cwd, 'approved.txt'), 'utf8'), 'approved content');
  assert.equal(existsSync(join(p.cwd, 'changed.txt')), false);
});

test('approval-replay: same toolCallId and parameters still require a fresh operation grant', async t => {
  let previous: ProbeApproval | undefined;
  const p = await setup(t, { authorize: async operation => previous ??= grant(operation) });
  writeFileSync(join(p.cwd, 'data.txt'), 'SYNTHETIC');
  await invoke(p.session, 'read', { path: 'data.txt' });
  const reads = p.observations.filter(event => event.phase === 'read').length;
  await assert.rejects(invoke(p.session, 'read', { path: 'data.txt' }), /approval_invalid_or_expired/);
  assert.equal(p.observations.filter(event => event.phase === 'read').length, reads);
  const requests = p.observations.filter(event => event.phase === 'approval_requested');
  assert.notEqual(requests[0]!.operation.operationId, requests[1]!.operation.operationId);
});

test('write-conflict: external edit after Pi read is preserved; content digest is distinct', async t => {
  let path = ''; const events: ToolObservation[] = [];
  const p = await setup(t, { observe: event => {
    events.push(event); if (event.phase === 'read_completed') writeFileSync(path, 'external edit');
  } });
  path = join(p.cwd, 'data.txt'); writeFileSync(path, 'old');
  await assert.rejects(invoke(p.session, 'edit', { path: 'data.txt', oldText: 'old', newText: 'new' }), /write_conflict/);
  assert.equal(readFileSync(path, 'utf8'), 'external edit');
  assert.equal(events.some(event => event.phase === 'write_start'), false);
  const clean = await setup(t); writeFileSync(join(clean.cwd, 'data.txt'), 'old');
  await invoke(clean.session, 'edit', { path: 'data.txt', oldText: 'old', newText: 'new' });
  const write = clean.observations.find(event => event.phase === 'write_completed')!;
  assert.equal(write.contentDigest, digest('new'));
  assert.notEqual(write.contentDigest, write.operation.parametersDigest);
});

test('tool-context-concurrency: concurrent calls retain their own operation, target and digest', async t => {
  const held = new Map<string, ReturnType<typeof deferred<ProbeApproval>>>();
  const allRequested = deferred<void>();
  const p = await setup(t, { authorize: async op => {
    const gate = deferred<ProbeApproval>(); held.set(op.toolCallId, gate);
    if (held.size === 2) allRequested.resolve();
    return gate.promise;
  } });
  const first = invoke(p.session, 'write', { path: 'one.txt', content: 'one' }, { id: 'one' });
  const second = invoke(p.session, 'write', { path: 'two.txt', content: 'two' }, { id: 'two' });
  await allRequested.promise;
  const requested = p.observations.filter(event => event.phase === 'approval_requested');
  assert.equal(new Set(requested.map(event => event.operation.operationId)).size, 2);
  for (const event of requested.toReversed()) held.get(event.operation.toolCallId)!.resolve(grant(event.operation, { fileVersion: null }));
  await Promise.all([first, second]);
  for (const event of p.observations.filter(event => event.phase === 'write_completed')) {
    assert.equal(event.contentDigest, digest(event.operation.toolCallId));
    assert.equal(event.operation.target, join(p.cwd, event.operation.toolCallId + '.txt'));
    assert.equal(event.operation.runId, p.binding.runId);
  }
});

test('approval-cancellation: pending approval and deadline expire without backend execution', async t => {
  const requested = deferred<void>();
  const p = await setup(t, { authorize: async () => { requested.resolve(); return new Promise(() => {}); } });
  const controller = new AbortController();
  const pending = invoke(p.session, 'write', { path: 'file', content: 'never' }, { signal: controller.signal });
  const rejection = assert.rejects(pending, /SYNTHETIC cancel/);
  await requested.promise; controller.abort(new Error('SYNTHETIC cancel')); await rejection;
  assert.equal(p.observations.some(event => ioPhases.has(event.phase)), false);
  const expired = await setup(t, { deadline: () => Date.now() + 25, authorize: async () => new Promise(() => {}) });
  await assert.rejects(invoke(expired.session, 'bash', { command: 'SYNTHETIC' }), /operation_expired/);
});

test('bash-active-cancellation: synthetic running Operations abort; late output keeps old identity', async t => {
  const entered = deferred<Parameters<BashOperations['exec']>[2]>();
  const p = await setup(t, { bash: { exec: async (_command, _cwd, options) => {
    entered.resolve(options); options.onData(Buffer.from('SYNTHETIC running'));
    await new Promise<void>((_done, reject) => options.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    return { exitCode: 0 };
  } } });
  const updates: unknown[] = [];
  const pending = invoke(p.session, 'bash', { command: 'SYNTHETIC held operation' }, { update: value => updates.push(value) });
  const rejected = assert.rejects(pending, /Command aborted/);
  const execution = await entered.promise; p.host.revoke(); await rejected;
  assert.equal(execution.signal!.aborted, true);
  const before = updates.length; execution.onData(Buffer.from('SYNTHETIC late'));
  assert.equal(updates.length, before);
  const next = await setup(t);
  const late = p.observations.findLast(event => event.phase === 'late_output')!;
  assert.equal(late.operation.runtimeBindingId, p.binding.runtimeBindingId);
  assert.notEqual(late.operation.runtimeBindingId, next.binding.runtimeBindingId);
  await assert.rejects(invoke(p.session, 'read', { path: 'unused' }), /binding_revoked/);
});

test('bash-output-parity: streaming, nonzero, null and timeout errors match Pi', async t => {
  for (const exit of [0, 7, null, 'timeout'] as const) {
    const bash: BashOperations = { exec: async (_command, _cwd, options) => {
      options.onData(Buffer.from('SYNTHETIC 中文\n'));
      if (exit === 'timeout') throw new Error('timeout:2');
      return { exitCode: exit };
    } };
    const p = await setup(t, { bash });
    const updates: unknown[] = []; const baseline: unknown[] = [];
    const input = { command: 'SYNTHETIC controlled output', timeout: 2 };
    if (exit === 0) {
      assert.deepEqual(await invoke(p.session, 'bash', input, { update: x => updates.push(x) }),
        await invoke(p.raw, 'bash', input, { update: x => baseline.push(x) }));
      assert.deepEqual(updates, baseline); assert.ok(updates.length >= 2);
    } else {
      let expected: unknown;
      try { await invoke(p.raw, 'bash', input); } catch (error) { expected = error; }
      assert.ok(expected instanceof Error);
      await assert.rejects(invoke(p.session, 'bash', input), { message: expected.message });
    }
  }
});

test('tool-io-coverage: Pi owns full-output logs inside managed TMPDIR', async t => {
  const text = Array.from({ length: 3000 }, (_, i) => `SYNTHETIC 中文 ${i}`).join('\n');
  const bytes = Buffer.from(text);
  const bash: BashOperations = { exec: async (_command, _cwd, options) => {
    options.onData(bytes.subarray(0, 12)); options.onData(bytes.subarray(12)); return { exitCode: 0 };
  } };
  const p = await setup(t, { bash });
  const actual = await invoke(p.session, 'bash', { command: 'SYNTHETIC large output' });
  const expected = await invoke(p.raw, 'bash', { command: 'SYNTHETIC large output' });
  const compare = (result: AgentToolResult<unknown>) => JSON.stringify(result).replace(/pi-bash-[a-f0-9]+\.log/g, 'pi-bash-<random>.log');
  assert.equal(compare(actual), compare(expected));
  assert.ok(actual.details && typeof actual.details === 'object' && 'fullOutputPath' in actual.details);
  assert.equal(typeof actual.details.fullOutputPath, 'string');
  const path = String(actual.details.fullOutputPath);
  assert.equal(dirname(path), resolve(process.env.TMPDIR!));
  assert.deepEqual(readFileSync(path), bytes);
  assert.equal(p.observations.some(event => event.phase === 'write_start'), false, 'Pi log write is outside file Operations');
});
