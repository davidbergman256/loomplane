import assert from 'node:assert/strict';
import { Store, LoomplaneError } from '../src/core/store.js';
import { comparePacketSnapshots } from '../src/core/packet-diff.js';

const store = new Store(':memory:');
try {
  const project = store.createProject({ name: 'Packet comparison' });
  const stream = store.createStream({ projectId: project.id, name: 'Consumer' });
  const publish = (title: string, body = title, priority = 50) => {
    const capsule = store.publishCapsule({
      projectId: project.id,
      kind: 'fact',
      title,
      body,
      priority,
    });
    store.mount({ streamId: stream.id, capsuleId: capsule.id });
    return capsule;
  };
  const revised = publish('Revised');
  const removed = publish('Removed');
  const mode = publish('Mode');
  const both = publish('Both');
  const large = publish('Large', 'Long context. '.repeat(400), 0);
  const unchanged = publish('Unchanged');
  const from = store.compile({ streamId: stream.id, task: 'Before task', budget: 4000 });
  assert.equal(from.manifest.length, 6);
  const run = store.startReceipt(from.id, 'test agent');
  store.reviseCapsule(revised.id, {
    expectedVersion: 1,
    body: 'Second revision',
    evidence: [{ label: 'New evidence', uri: 'repo://contract.ts' }],
  });
  store.unmount(store.listMounts(stream.id).find((m) => m.capsuleId === removed.id)!.id);
  store.mount({ streamId: stream.id, capsuleId: mode.id, mode: 'pinned', pinnedVersion: 1 });
  store.reviseCapsule(both.id, { expectedVersion: 1, body: 'Second both revision' });
  store.mount({ streamId: stream.id, capsuleId: both.id, mode: 'pinned', pinnedVersion: 2 });
  const added = publish('Added');
  const to = store.compile({ streamId: stream.id, task: 'After task', budget: 700 });
  assert.ok(to.omitted.some((item) => item.capsuleId === large.id && item.reason === 'budget'));
  const eventVersion = store.getChangeVersion();
  const diff = store.comparePackets(from.id, to.id);
  const entry = (id: string) => diff.capsuleChanges.find((item) => item.capsuleId === id)!;
  assert.deepEqual(entry(revised.id).changes, ['revised']);
  assert.equal(entry(revised.id).before!.revision.body, 'Revised');
  assert.equal(entry(revised.id).after!.revision.body, 'Second revision');
  assert.equal(entry(revised.id).after!.revision.evidence[0].uri, 'repo://contract.ts');
  assert.deepEqual(entry(removed.id).changes, ['removed']);
  assert.equal(entry(removed.id).after, null);
  assert.deepEqual(entry(added.id).changes, ['added']);
  assert.equal(entry(added.id).before, null);
  assert.deepEqual(entry(mode.id).changes, ['mode']);
  assert.deepEqual(entry(both.id).changes, ['revised', 'mode']);
  assert.deepEqual(entry(large.id).changes, ['removed']);
  assert.equal(diff.unchangedCapsules, 1);
  assert.ok(!entry(unchanged.id));
  assert.equal(diff.task.changed, true);
  assert.equal(diff.budget.changed, true);
  assert.equal(diff.omissions.changed, true);
  assert.equal(diff.manifestOrder.changed, true);
  assert.equal(diff.changed, true);
  assert.equal(diff.textChanged, true);
  assert.deepEqual(
    diff.capsuleChanges.map((item) => item.capsuleId),
    [...diff.capsuleChanges.map((item) => item.capsuleId)].sort(),
  );
  assert.equal(store.getChangeVersion(), eventVersion);
  assert.equal(store.getReceipt(run.id).status, 'started');
  assert.deepEqual(store.getPacket(from.id), from);
  assert.deepEqual(store.getPacket(to.id), to);
  store.reviseCapsule(revised.id, {
    expectedVersion: 2,
    body: 'Third revision must not enter old comparisons',
  });
  assert.deepEqual(store.comparePackets(from.id, to.id), diff);
  assert.equal(store.comparePackets(to.id, to.id).changed, false);
  const equivalent = { ...to, id: 'pkt_other', createdAt: '2030-01-01T00:00:00.000Z' };
  assert.equal(
    comparePacketSnapshots(to, equivalent, () => {
      throw new Error('No revision lookup needed');
    }).changed,
    false,
  );
  const reversed = store.comparePackets(to.id, from.id);
  assert.deepEqual(reversed.capsuleChanges.find((item) => item.capsuleId === added.id)!.changes, [
    'removed',
  ]);

  const conflictStream = store.createStream({ projectId: project.id, name: 'Conflicts' });
  const conflicting = ['first', 'second'].map((body) =>
    store.publishCapsule({
      projectId: project.id,
      streamId: conflictStream.id,
      kind: 'fact',
      key: 'policy',
      title: body,
      body,
    }),
  );
  const conflictBefore = store.compile({ streamId: conflictStream.id });
  store.setCapsuleStatus(conflicting[1].id, 'retracted', 1);
  const conflictAfter = store.compile({ streamId: conflictStream.id });
  const resolution = store.comparePackets(conflictBefore.id, conflictAfter.id);
  assert.equal(resolution.conflicts.changed, true);
  assert.equal(resolution.conflicts.before.length, 1);
  assert.equal(resolution.conflicts.after.length, 0);
  assert.ok(resolution.omissions.after.some((item) => item.reason === 'retracted'));
  assert.throws(
    () => store.comparePackets(from.id, conflictAfter.id),
    (error: unknown) => error instanceof LoomplaneError && error.code === 'STREAM_MISMATCH',
  );
  const otherProject = store.createProject({ name: 'Other project' });
  const otherStream = store.createStream({ projectId: otherProject.id, name: 'Other stream' });
  const other = store.compile({ streamId: otherStream.id });
  assert.throws(
    () => store.comparePackets(from.id, other.id),
    (error: unknown) => error instanceof LoomplaneError && error.code === 'PROJECT_MISMATCH',
  );
  assert.throws(
    () => store.comparePackets(from.id, 'pkt_missing'),
    (error: unknown) => error instanceof LoomplaneError && error.code === 'NOT_FOUND',
  );
  console.log(
    'PASS: deterministic historical packet diffs, additions/removals/revisions/modes, budget omissions, conflicts, unchanged identity, scope rejection, and no writes or receipt changes.',
  );
} finally {
  store.close();
}
