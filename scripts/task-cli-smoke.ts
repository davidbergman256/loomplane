import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../src/core/store.js';
import type { StartedTask } from '../src/core/types.js';

const directory = mkdtempSync(join(tmpdir(), 'loomplane-task-cli-'));
const loader = resolve('node_modules/tsx/dist/loader.mjs');
const cli = resolve('src/cli/index.ts');
function run(args: string[]) {
  return JSON.parse(
    execFileSync(process.execPath, ['--import', loader, cli, ...args], {
      cwd: directory,
      env: { ...process.env, LOOMPLANE_DB: join(directory, '.loomplane/loomplane.sqlite') },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
}
try {
  const initialized = run(['init', '--name', 'Two CLI tasks']);
  const capsule = run(['remember', 'Shared contract', '--body', 'Use integer amounts.']);
  const other = run(['remember', 'Privacy rule', '--body', 'Never log access tokens.']);
  const selection = readFileSync(join(directory, '.loomplane/workspace.json'), 'utf8');
  const first: StartedTask = run([
    'task',
    'start',
    'UI',
    '--task',
    'Display amounts',
    '--agent',
    'first',
    '--context',
    capsule.id,
    '--context',
    other.id,
    '--branch',
    'ui-branch',
  ]);
  const second: StartedTask = run([
    'task',
    'start',
    'API',
    '--task',
    'Check amounts',
    '--agent',
    'second',
    '--context',
    capsule.id,
  ]);
  assert.notEqual(first.stream.id, second.stream.id);
  assert.notEqual(first.packet.id, second.packet.id);
  assert.notEqual(first.receipt.id, second.receipt.id);
  assert.equal(first.stream.branch, 'ui-branch');
  assert.equal(first.mounts.length, 2);
  assert.match(first.packet.text, /Never log access tokens/);
  assert.match(second.packet.text, /Use integer amounts/);
  assert.equal(first.receipt.status, 'started');
  assert.equal(run(['where']).stream.id, initialized.stream.id);
  assert.equal(readFileSync(join(directory, '.loomplane/workspace.json'), 'utf8'), selection);
  run(['revise', capsule.id, '--expected-version', '1', '--body', 'Use decimal integer strings.']);
  const store = new Store(join(directory, '.loomplane/loomplane.sqlite'));
  try {
    assert.equal(store.checkPacket(first.packet.id).ok, false);
    assert.equal(store.checkPacket(second.packet.id).ok, false);
    assert.throws(() => store.finishReceipt(first.receipt.id, { status: 'completed' }));
    assert.throws(() => store.finishReceipt(second.receipt.id, { status: 'completed' }));
  } finally {
    store.close();
  }
  console.log(
    'Task CLI: two independent handoffs, repeated context flags, unchanged directory selection, both exact packets stale after contract change.',
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
