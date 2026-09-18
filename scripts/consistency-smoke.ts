import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { Store, LoomplaneError } from '../src/core/store.js';
import { validatePortableProject } from '../src/core/portable.js';

test('export keeps one snapshot while a second connection commits', () => {
  const directory = mkdtempSync(join(tmpdir(), 'loomplane-consistency-'));
  const path = join(directory, 'context.sqlite');
  const reader = new Store(path);
  const writer = new Store(path);
  try {
    const project = writer.createProject({ name: 'Consistent reads' });
    const stream = writer.createStream({ projectId: project.id, name: 'Consumer' });
    const capsule = writer.publishCapsule({
      projectId: project.id,
      streamId: stream.id,
      kind: 'decision',
      title: 'Contract',
      body: 'First revision',
    });
    const listCapsules = reader.listCapsules.bind(reader);
    let interleaved = false;
    reader.listCapsules = (projectId) => {
      const result = listCapsules(projectId);
      if (!interleaved) {
        interleaved = true;
        // A real committed write between export's capsule and revision queries.
        // It must succeed while the read snapshot is open: readers take no writer lock.
        writer.reviseCapsule(capsule.id, { expectedVersion: 1, body: 'Second revision' });
      }
      return result;
    };
    const exported = validatePortableProject(reader.exportProject(project.id));
    assert.equal(interleaved, true);
    assert.equal(exported.capsules[0].version, 1);
    assert.deepEqual(
      exported.revisions.map((r) => r.version),
      [1],
    );
    assert.ok(!exported.events.some((event) => event.type === 'capsule.revised'));
    assert.equal(reader.getCapsule(capsule.id).version, 2, 'next call sees the committed write');
    validatePortableProject(reader.exportProject(project.id));

    // An exception must release the snapshot; receipt checks must reuse write transactions.
    assert.throws(() => reader.getStreamState('missing'), /Stream not found/);
    const packet = reader.compile({ streamId: stream.id });
    const receipt = reader.startReceipt(packet.id, 'consistency smoke');
    assert.equal(reader.finishReceipt(receipt.id, { status: 'completed' }).status, 'completed');
    assert.equal(reader.listPackets(stream.id).items[0].id, packet.id);
    assert.throws(
      () => reader.reviseCapsule(capsule.id, { expectedVersion: 1, body: 'Stale write' }),
      (error: unknown) => error instanceof LoomplaneError && error.code === 'VERSION_CONFLICT',
    );
    assert.equal(reader.getCapsule(capsule.id).version, 2);
  } finally {
    reader.close();
    writer.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('unsupported schema is rejected without changing the database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'loomplane-schema-'));
  const path = join(directory, 'future.sqlite');
  try {
    const future = new DatabaseSync(path);
    future.exec(`
      CREATE TABLE schema_version(version INTEGER NOT NULL);
      INSERT INTO schema_version VALUES(999);
      CREATE TABLE future_only(value TEXT);
      INSERT INTO future_only VALUES('preserve');
    `);
    future.close();
    const before = readFileSync(path);
    assert.throws(
      () => new Store(path),
      (error: unknown) => error instanceof LoomplaneError && error.code === 'SCHEMA_VERSION',
    );
    assert.deepEqual(readFileSync(path), before, 'no journal-mode or schema mutation on rejection');
    const unchanged = new DatabaseSync(path, { readOnly: true });
    try {
      assert.equal(unchanged.prepare('PRAGMA journal_mode').get()!.journal_mode, 'delete');
      assert.equal(
        unchanged.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE name='projects'").get()!.n,
        0,
      );
    } finally {
      unchanged.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
