// Static compiler tests only. None of these generated SDK calls are executed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function compile(t, source) {
  mkdirSync(join(root, '.artifacts'), { recursive: true });
  const dir = mkdtempSync(join(root, '.artifacts/pi-types-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'entry.ts'), source);
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ extends: '../../tsconfig.json', include: ['entry.ts'] }));
  const result = spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--project', join(dir, 'tsconfig.json'), '--pretty', 'false'], {
    cwd: dir, encoding: 'utf8', timeout: 60_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return { status: result.status, output: result.stdout + result.stderr };
}

test('public SDK root compiles under unchanged strict NodeNext and full declaration checking', t => {
  const result = compile(t, `import { createAgentSession } from '@earendil-works/pi-coding-agent';
const options: Parameters<typeof createAgentSession>[0] = { tools: [], customTools: [] };
void options;
`);
  assert.equal(result.status, 0, result.output);
});

test('public SDK still rejects an invalid tool name type', t => {
  const result = compile(t, `import { createAgentSession } from '@earendil-works/pi-coding-agent';
void createAgentSession({ tools: [42] }); // SYNTHETIC invalid input, never executed
`);
  assert.notEqual(result.status, 0);
  const errors = result.output.split('\n').filter(line => line.includes('error TS'));
  assert.equal(errors.length, 1, result.output);
  assert.match(errors[0], /entry\.ts\(2,\d+\): error TS2322: Type 'number' is not assignable to type 'string'/);
});
