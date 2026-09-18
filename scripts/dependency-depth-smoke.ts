import assert from 'node:assert/strict';
import { Store, LoomplaneError } from '../src/core/store.js';
import type { Capsule } from '../src/core/types.js';

const store = new Store(':memory:');
try {
  const project = store.createProject({ name: 'Synthetic deep dependency graph' });
  const stream = store.createStream({ projectId: project.id, name: 'Tip consumer' });
  const chain: Capsule[] = [];
  for (let i = 0; i < 6000; i++)
    chain.push(
      store.publishCapsule({
        projectId: project.id,
        kind: 'fact',
        title: `Node ${i}`,
        body: 'Synthetic dependency',
        dependencies: i ? [{ capsuleId: chain[i - 1].id, version: 1 }] : [],
      }),
    );
  const root = chain[0];
  const tip = chain.at(-1)!;
  store.mount({ streamId: stream.id, capsuleId: tip.id, mode: 'pinned', pinnedVersion: 1 });
  const packet = store.compile({ streamId: stream.id });
  assert.equal(store.checkPacket(packet.id).ok, true, 'deep unchanged graph remains usable');

  // A valid edit traverses the full current graph during cycle validation.
  store.reviseCapsule(tip.id, { expectedVersion: 1, dependencies: tip.dependencies });
  assert.equal(store.checkPacket(packet.id).ok, true, 'direct pinned update stays nonblocking');
  store.reviseCapsule(root.id, { expectedVersion: 1, body: 'Changed root contract' });
  const check = store.checkPacket(packet.id);
  assert.equal(check.ok, false);
  assert.equal(check.drift.length, 1);
  assert.equal(check.drift[0].capsuleId, tip.id);
  assert.equal(check.drift[0].compiledVersion, 1);
  assert.equal(check.drift[0].pinned, false, 'pins do not hide stale historical dependencies');
  assert.equal(check.drift[0].dependency?.capsuleId, root.id);
  assert.equal(check.drift[0].dependency?.expectedVersion, 1);
  assert.equal(check.drift[0].dependency?.currentVersion, 2);
  assert.throws(
    () =>
      store.reviseCapsule(root.id, {
        expectedVersion: 2,
        dependencies: [{ capsuleId: tip.id, version: 2 }],
      }),
    (error: unknown) => error instanceof LoomplaneError && error.code === 'DEPENDENCY_CYCLE',
  );
  assert.equal(store.getCapsule(root.id).version, 2, 'rejected cycle does not mutate the root');

  // The current tip can stop depending on the chain; its recorded packet must not.
  store.reviseCapsule(tip.id, { expectedVersion: 2, dependencies: [] });
  assert.equal(store.checkPacket(packet.id).drift[0].dependency?.capsuleId, root.id);
  const unrelated = store.publishCapsule({
    projectId: project.id,
    kind: 'fact',
    title: 'Unrelated',
    body: 'No dependency edges',
  });
  const impact = store.impact(unrelated.id); // Full historical reachability walk, no matching ancestor.
  assert.deepEqual(impact.streams, []);
  assert.deepEqual(impact.dependentCapsules, []);

  const orderedProject = store.createProject({ name: 'Synthetic dependency order' });
  const orderedStream = store.createStream({
    projectId: orderedProject.id,
    name: 'Order consumer',
  });
  const publish = (title: string, dependencies: Capsule[], owned = false) =>
    store.publishCapsule({
      projectId: orderedProject.id,
      ...(owned ? { streamId: orderedStream.id } : {}),
      kind: 'fact',
      title,
      body: title,
      dependencies: dependencies.map((c) => ({ capsuleId: c.id, version: c.version })),
    });
  const shared = publish('Shared', []);
  const first = publish('First', [shared]);
  const second = publish('Second', [shared]);
  const owner = publish('Diamond consumer', [first, second], true);
  const otherOwner = publish('Other consumer', [shared], true);
  const orderedPacket = store.compile({ streamId: orderedStream.id });
  for (const capsule of [first, second, shared])
    store.reviseCapsule(capsule.id, { expectedVersion: 1, body: 'Changed' });
  const orderedCheck = store.checkPacket(orderedPacket.id);
  assert.deepEqual(
    orderedCheck.drift.filter((d) => d.capsuleId === owner.id).map((d) => d.dependency?.capsuleId),
    [first.id, shared.id, second.id],
    'depth-first dependency-array order and per-root deduplication',
  );
  assert.deepEqual(
    orderedCheck.drift
      .filter((d) => d.capsuleId === otherOwner.id)
      .map((d) => d.dependency?.capsuleId),
    [shared.id],
    'shared ancestors still produce findings for each consumer',
  );
  console.log(
    'PASS: 6000-node checks and cycle validation, historical reachability, pinned dependency drift, DFS ordering and per-consumer findings.',
  );
} finally {
  store.close();
}
