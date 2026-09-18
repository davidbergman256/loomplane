import assert from 'node:assert/strict';
import { Store, LoomplaneError } from '../src/core/store.js';
import type { PortableProject } from '../src/core/portable.js';

const source = new Store(':memory:');
const target = new Store(':memory:');
const empty = new Store(':memory:');
try {
  const p = source.createProject({ name: 'Portable' });
  const publisher = source.createStream({ projectId: p.id, name: 'Publisher' });
  const consumer = source.createStream({ projectId: p.id, name: 'Consumer' });
  const c = source.publishCapsule({
    projectId: p.id,
    streamId: publisher.id,
    kind: 'decision',
    title: 'Amount contract',
    body: 'Use cents',
    evidence: [
      {
        label: 'Source',
        uri: 'repo://types.ts',
        fingerprint: { path: 'types.ts', sha256: '0'.repeat(64), bytes: 10 },
      },
    ],
  });
  const derived = source.publishCapsule({
    projectId: p.id,
    streamId: consumer.id,
    kind: 'fact',
    title: 'Formatting contract',
    body: 'Divide by 100',
    dependencies: [{ capsuleId: c.id, version: 1 }],
  });
  const historical = source.compile({ streamId: consumer.id });
  const run = source.startReceipt(historical.id, 'test agent');
  source.finishReceipt(run.id, { status: 'completed', outcome: 'Checked v1' });
  source.reviseCapsule(c.id, { expectedVersion: 1, body: 'Use minor units and exponent' });
  source.reviseCapsule(derived.id, {
    expectedVersion: 1,
    dependencies: [],
    body: 'Use independent formatting policy',
  });
  source.mount({ streamId: consumer.id, capsuleId: c.id, mode: 'pinned', pinnedVersion: 1 });
  const current = source.compile({ streamId: consumer.id });
  source.startReceipt(current.id, 'second agent');
  const withdrawn = source.publishCapsule({
    projectId: p.id,
    kind: 'constraint',
    title: 'Withdrawn',
    body: 'Do not use this',
  });
  source.setCapsuleStatus(withdrawn.id, 'retracted', 1);
  const removedMount = source.mount({ streamId: consumer.id, capsuleId: withdrawn.id });
  source.unmount(removedMount.id);
  const bundle = source.exportProject(p.id) as PortableProject;

  assert.deepEqual(target.restoreProject(bundle), p);
  const roundtrip = target.exportProject(p.id) as PortableProject;
  for (const field of [
    'project',
    'streams',
    'capsules',
    'revisions',
    'mounts',
    'packets',
    'receipts',
  ] as const)
    assert.deepEqual(roundtrip[field], bundle[field], field);
  assert.deepEqual(target.getPacket(historical.id), source.getPacket(historical.id));
  assert.equal(target.checkPacket(historical.id).ok, false);
  assert.equal(target.checkPacket(current.id).ok, true);
  assert.equal(target.getCapsule(withdrawn.id).status, 'retracted');
  assert.equal(target.search(p.id, 'exponent')[0].capsule.id, c.id);
  const restoredEvents = target.events(p.id, 10000);
  assert.equal(restoredEvents[0].type, 'project.restored');
  assert.equal(restoredEvents.length, bundle.events.length + 1);
  assert.ok(
    restoredEvents
      .slice(1)
      .every(
        (e) =>
          typeof (e.data._loomplaneRestore as { sourceEventId: number }).sourceEventId === 'number',
      ),
  );
  // Restore can itself be exported and restored, including historical event provenance.
  empty.restoreProject(roundtrip);
  assert.deepEqual(empty.getPacket(current.id), source.getPacket(current.id));

  const before = target.getChangeVersion();
  assert.throws(
    () => target.restoreProject(bundle),
    (e: unknown) => e instanceof LoomplaneError && e.code === 'RESTORE_COLLISION',
  );
  assert.equal(target.getChangeVersion(), before);
  assert.equal(target.listProjects().length, 1);
  const colliding = structuredClone(bundle);
  colliding.project.id = 'prj_collision';
  for (const records of [
    colliding.streams,
    colliding.capsules,
    colliding.packets,
    colliding.receipts,
    colliding.events,
  ])
    for (const record of records) record.projectId = colliding.project.id;
  for (const event of colliding.events)
    if (event.entityId === p.id) event.entityId = colliding.project.id;
  assert.throws(
    () => target.restoreProject(colliding),
    (e: unknown) => e instanceof LoomplaneError && e.code === 'RESTORE_COLLISION',
  );
  assert.equal(target.listProjects().length, 1);
  assert.equal(target.getChangeVersion(), before);

  const invalidCases: ((b: PortableProject) => void)[] = [
    (b) => {
      b.streams[0].projectId = 'prj_external';
    },
    (b) => {
      b.capsules[0].body = 'Not its recorded latest revision';
    },
    (b) => {
      b.revisions = b.revisions.filter((r) => !(r.capsuleId === c.id && r.version === 1));
    },
    (b) => {
      b.revisions.find((r) => r.capsuleId === derived.id && r.version === 1)!.dependencies = [
        { capsuleId: 'cap_external', version: 1 },
      ];
    },
    (b) => {
      b.revisions.find((r) => r.capsuleId === c.id && r.version === 1)!.dependencies = [
        { capsuleId: derived.id, version: 1 },
      ];
    },
    (b) => {
      b.packets[0].manifest[0].version = 999;
    },
    (b) => {
      b.receipts[0].streamId = publisher.id;
    },
    (b) => {
      b.mounts[0].pinnedVersion = 999;
    },
    (b) => {
      b.packets[0].estimatedTokens = 0;
    },
    (b) => {
      b.events[0].entityId = 'prj_external';
    },
  ];
  for (const alter of invalidCases) {
    const invalid = structuredClone(bundle);
    alter(invalid);
    const clean = new Store(':memory:');
    try {
      assert.throws(
        () => clean.restoreProject(invalid),
        (e: unknown) => e instanceof LoomplaneError && e.code === 'INVALID_EXPORT',
      );
      assert.equal(clean.listProjects().length, 0);
      assert.equal(clean.getChangeVersion(), 0);
    } finally {
      clean.close();
    }
  }
  console.log(
    'PASS: portable project roundtrip, exact history and packets, source fingerprints, restored indexes and receipts, repeated export, collisions, malformed references, cross-project rejection, and no partial writes.',
  );
} finally {
  source.close();
  target.close();
  empty.close();
}
