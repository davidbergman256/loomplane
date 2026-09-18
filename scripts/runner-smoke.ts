import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fingerprintSource } from '../src/core/sources.js';
import { Store } from '../src/core/store.js';
import { runWithContext } from '../src/runner/run.js';

const directory = mkdtempSync(join(tmpdir(), 'loomplane-runner-smoke-'));
const databasePath = join(directory, 'loomplane.sqlite');
const sourcePath = join(directory, 'contract.txt');
const store = new Store(databasePath);

try {
  await writeFile(sourcePath, 'stable contract\n');
  const project = store.createProject({ name: 'Runner smoke' });
  const stream = store.createStream({ projectId: project.id, name: 'Command agent' });
  store.publishCapsule({
    projectId: project.id,
    streamId: stream.id,
    kind: 'constraint',
    title: 'Synthetic contract',
    body: 'Read the provided context file.',
    evidence: [await fingerprintSource(directory, sourcePath)],
  });

  const inspectScript = `
    const fs = require('node:fs');
    const context = fs.readFileSync(process.env.LOOMPLANE_CONTEXT_FILE, 'utf8');
    const packet = JSON.parse(fs.readFileSync(process.env.LOOMPLANE_PACKET_FILE, 'utf8'));
    if (!context.includes('Synthetic contract')) process.exit(20);
    if (packet.id !== process.env.LOOMPLANE_PACKET_ID) process.exit(21);
    if (!require('node:path').isAbsolute(process.env.LOOMPLANE_DB)) process.exit(22);
  `;
  const completed = await runWithContext(store, {
    databasePath,
    streamId: stream.id,
    agent: 'smoke-reader',
    command: [process.execPath, '-e', inspectScript],
    sourceRoot: directory,
    keepFiles: true,
  });
  assert.equal(completed.status, 'completed-fresh');
  assert.equal(completed.exitCode, 0);
  assert.equal(completed.sourcePreflight?.ok, true);
  assert.equal(completed.sourcePostflight?.ok, true);
  assert.ok((await readFile(completed.contextFile!, 'utf8')).includes('Synthetic contract'));
  assert.equal(JSON.parse(await readFile(completed.packetFile!, 'utf8')).id, completed.packetId);
  assert.equal((await stat(dirname(completed.contextFile!))).mode & 0o777, 0o700);
  assert.equal((await stat(completed.contextFile!)).mode & 0o777, 0o600);
  assert.equal((await stat(completed.packetFile!)).mode & 0o777, 0o600);
  assert.equal(store.getReceipt(completed.receiptId!).status, 'completed');
  rmSync(dirname(completed.contextFile!), { recursive: true, force: true });

  const failed = await runWithContext(store, {
    databasePath,
    streamId: stream.id,
    command: [process.execPath, '-e', 'process.exit(7)'],
    sourceRoot: directory,
  });
  assert.equal(failed.status, 'command-failed');
  assert.equal(failed.exitCode, 7);
  assert.equal(store.getReceipt(failed.receiptId!).status, 'abandoned');
  assert.equal(store.getReceipt(failed.receiptId!).agent, 'node');

  const signaled = await runWithContext(store, {
    databasePath,
    streamId: stream.id,
    command: [process.execPath, '-e', "process.kill(process.pid, 'SIGTERM')"],
    sourceRoot: directory,
  });
  assert.equal(signaled.status, 'command-signaled');
  assert.equal(signaled.signal, 'SIGTERM');
  assert.equal(signaled.exitCode, 143);
  assert.equal(store.getReceipt(signaled.receiptId!).status, 'abandoned');

  const spawnFailed = await runWithContext(store, {
    databasePath,
    streamId: stream.id,
    command: [join(directory, 'missing-executable')],
    sourceRoot: directory,
  });
  assert.equal(spawnFailed.status, 'spawn-failed');
  assert.equal(spawnFailed.exitCode, 1);
  assert.equal(store.getReceipt(spawnFailed.receiptId!).status, 'abandoned');

  const changeSourceScript = `
    const fs = require('node:fs');
    fs.readFileSync(process.env.LOOMPLANE_CONTEXT_FILE, 'utf8');
    fs.writeFileSync(${JSON.stringify(sourcePath)}, 'changed contract\\n');
  `;
  const changed = await runWithContext(store, {
    databasePath,
    streamId: stream.id,
    command: [process.execPath, '-e', changeSourceScript],
    sourceRoot: directory,
  });
  assert.equal(changed.commandExitCode, 0);
  assert.equal(changed.status, 'context-changed');
  assert.equal(changed.exitCode, 2);
  assert.equal(changed.sourcePostflight?.ok, false);
  assert.equal(store.getReceipt(changed.receiptId!).status, 'abandoned');

  console.log(
    'runner smoke passed: private context files, exact packet env, preserved exit, and source postflight',
  );
} finally {
  store.close();
  rmSync(directory, { recursive: true, force: true });
}
