// Real macOS processes, synthetic fixed commands, no Provider/model invocation.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import { validateToolArguments } from '@earendil-works/pi-ai';
import { createAgentSession, createLocalBashOperations, defineTool, SessionManager,
  type AgentToolResult } from '@earendil-works/pi-coding-agent';
import { createProbeServices } from './probe.ts';
import { createToolProbe, type ToolObservation } from './tool-probe.ts';

assert.equal(process.platform, 'darwin');
assert.equal(process.permission.has('child'), true);
assert.ok(process.env.PI_PROBE_ROOT && process.env.PI_PROBE_DENIED_PATH);

async function setup(t: TestContext) {
  const dir = mkdtempSync(join(process.env.PI_PROBE_ROOT!, 'shell-'));
  const cwd = join(dir, '中文 shell workspace'); const agentDir = join(dir, 'agent');
  mkdirSync(cwd); mkdirSync(agentDir);
  const events: ToolObservation[] = [];
  const host = createToolProbe({
    binding: { runId: 'SYNTHETIC-shell', runtimeBindingId: dir, runtimeEpoch: 1, workspaceRef: cwd },
    deadline: () => Date.now() + 5_000,
    authorize: async op => ({ operationId: op.operationId, parametersDigest: op.parametersDigest, expiresAt: op.deadline }),
    bash: createLocalBashOperations({ shellPath: '/bin/bash' }), observe: event => events.push(event),
  });
  const services = await createProbeServices({ cwd, agentDir });
  const { session } = await createAgentSession({ ...services, sessionManager: SessionManager.inMemory(cwd),
    tools: ['bash'], noTools: 'builtin', customTools: [defineTool(host.bash)] });
  t.after(() => { host.revoke(); session.dispose(); });
  const tool = session.agent.state.tools[0]!;
  return { cwd, events, async execute(command: string, options: {
    timeout?: number; signal?: AbortSignal; update?: (value: AgentToolResult<unknown>) => void;
  } = {}) {
    const args: unknown = validateToolArguments(tool, { type: 'toolCall', id: 'SYNTHETIC-shell-call', name: 'bash',
      arguments: { command, ...(options.timeout ? { timeout: options.timeout } : {}) } });
    return tool.execute('SYNTHETIC-shell-call', args, options.signal, options.update);
  } };
}
const text = (result: AgentToolResult<unknown>) => result.content.filter(item => item.type === 'text').map(item => item.text).join('');
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
const running = '/bin/sleep 30 & child=$!; printf "SYNTHETIC PIDS %s %s\\n" "$$" "$child"; wait "$child"';

async function assertGone(pid: number) {
  const end = Date.now() + 1500;
  while (Date.now() < end) {
    try { process.kill(pid, 0); }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return; throw error; }
    await delay(20);
  }
  assert.fail(`Managed test process ${pid} still exists after settlement`);
}

test('real-bash: official backend streams in Chinese cwd with empty provider credentials', async t => {
  const p = await setup(t); const updates: string[] = [];
  const result = await p.execute('test -z "${OPENAI_API_KEY+x}${ANTHROPIC_API_KEY+x}${GOOGLE_API_KEY+x}${BASH_ENV+x}" && printf "SYNTHETIC 中文\\n" && pwd', {
    update: value => updates.push(text(value)),
  });
  assert.equal(text(result), 'SYNTHETIC 中文\n' + p.cwd + '\n');
  assert.ok(updates.some(value => value.includes('SYNTHETIC 中文')));
  assert.equal(p.events.filter(event => event.phase === 'exec_start').length, 1);
});

test('real-bash-cancel: abort a running shell and child, then independently verify both gone', async t => {
  const p = await setup(t); const controller = new AbortController();
  let ready!: (pids: number[]) => void;
  const started = new Promise<number[]>(done => { ready = done; });
  const pending = p.execute(running, { signal: controller.signal, update: value => {
    const match = /SYNTHETIC PIDS (\d+) (\d+)/.exec(text(value));
    if (match) ready([Number(match[1]), Number(match[2])]);
  } });
  const rejected = assert.rejects(pending, /Command aborted/);
  const pids = await started;
  const remaining = new Set(pids);
  try {
    assert.equal(pids.length, 2); assert.ok(pids.every(pid => pid > 1 && pid !== process.pid));
    controller.abort(); await rejected;
    for (const pid of pids) { await assertGone(pid); remaining.delete(pid); }
  } finally {
    for (const pid of remaining) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  }
  assert.equal(p.events.filter(event => event.phase === 'exec_settled').length, 1);
});

test('real-bash-timeout: Pi timeout stops the running process group', async t => {
  const p = await setup(t); const remaining = new Set<number>();
  try {
    await assert.rejects(p.execute(running, { timeout: 0.15, update: value => {
      const match = /SYNTHETIC PIDS (\d+) (\d+)/.exec(text(value));
      if (match) { remaining.add(Number(match[1])); remaining.add(Number(match[2])); }
    } }), /Command timed out after 0.15 seconds/);
    assert.equal(remaining.size, 2);
    for (const pid of remaining) { await assertGone(pid); remaining.delete(pid); }
  } finally { for (const pid of remaining) { try { process.kill(pid, 'SIGKILL'); } catch {} } }
});

test('real-shell-boundary: child inherits OS network and filesystem denial', async t => {
  const p = await setup(t);
  // Child Node has no JS tripwire. Kernel EPERM/EACCES must reject socket creation.
  const source = `const s=require('node:net').createServer(); s.on('error',e=>{console.log(e.code);}); s.listen(0,'127.0.0.1',()=>{console.log('UNEXPECTED_LISTEN');s.close();});`;
  const network = await p.execute(quote(process.execPath) + ' -e ' + quote(source));
  // Pi merges stderr into output; Node may emit its explicit child-permission warning.
  assert.match(text(network), /(?:^|\n)(EPERM|EACCES)\n$/);
  assert.doesNotMatch(text(network), /UNEXPECTED_LISTEN|A1_NETWORK_FORBIDDEN|ERR_ACCESS_DENIED/);
  await assert.rejects(p.execute('/bin/cat ' + quote(process.env.PI_PROBE_DENIED_PATH!)), /Operation not permitted|Permission denied/);
  await assert.rejects(p.execute('printf SYNTHETIC > ' + quote(process.env.PI_PROBE_DENIED_PATH!)), /Operation not permitted|Permission denied/);
});
