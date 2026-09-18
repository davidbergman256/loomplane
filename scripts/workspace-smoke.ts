import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Store } from '../src/core/store.js';

const store = new Store(':memory:');
try {
  assert.equal(typeof store.workspaceSnapshot, 'function', 'Store exposes compact workspace reads');
  const { compactSnapshot, summarizePacket } = await import('../src/core/workspace.js');
  const empty = store.workspaceSnapshot();
  assert.equal(empty.format, 'loomplane.workspace');
  assert.equal(empty.version, 1);
  assert.equal(empty.project, null);
  assert.deepEqual(empty.streams, []);

  const project = store.createProject({ name: 'Workspace fixture' });
  const streams = Array.from({ length: 4 }, (_, i) =>
    store.createStream({ projectId: project.id, name: `Consumer ${i}` }),
  );
  const capsules = Array.from({ length: 36 }, (_, i) =>
    store.publishCapsule({
      projectId: project.id,
      streamId: i % 4 === 0 ? null : streams[i % 3].id,
      kind: 'fact',
      key: i < 2 ? 'conflicting-contract' : `contract.${i}`,
      title: `Synthetic context ${i}`,
      body:
        `Record ${i}: ` + 'Keep versioned context available to independent consumers. '.repeat(12),
      evidence: [{ label: 'Synthetic source', uri: `repo://fixture/${i}.md` }],
    }),
  );
  for (const stream of streams.slice(0, 3)) {
    for (const capsule of capsules.filter((c) => c.streamId !== stream.id).slice(0, 8)) {
      store.mount({
        streamId: stream.id,
        capsuleId: capsule.id,
        mode: capsule === capsules[0] ? 'pinned' : 'live',
        ...(capsule === capsules[0] ? { pinnedVersion: 1 } : {}),
      });
    }
    store.compile({ streamId: stream.id, budget: 8000, task: 'Synthetic compact payload check' });
  }
  store.reviseCapsule(capsules[0].id, { expectedVersion: 1, body: 'A revised shared contract' });
  store.setCapsuleStatus(capsules[3].id, 'retracted', 1);
  const eventVersion = store.getChangeVersion();
  const full = store.snapshot(project.id);
  const before = JSON.stringify(full);
  const compact = compactSnapshot(full);
  assert.deepEqual(store.workspaceSnapshot(project.id), compact);
  assert.deepEqual(store.workspaceSnapshot(), compact);
  assert.equal(JSON.stringify(full), before, 'projection leaves the full snapshot unchanged');
  for (const field of ['projects', 'project', 'capsules', 'events', 'stats'] as const)
    assert.deepEqual(compact[field], full[field], field);
  const byId = new Map(compact.capsules.map((c) => [c.id, c]));
  assert.equal(byId.size, capsules.length);
  for (const [index, state] of compact.streams.entries()) {
    const original = full.streams[index];
    assert.deepEqual(state.stream, original.stream);
    assert.deepEqual(
      state.ownedIds.map((id) => byId.get(id)),
      original.owned,
    );
    assert.deepEqual(
      state.mounts.map((m) => ({ ...m, capsule: byId.get(m.capsuleId) })),
      original.mounts,
    );
    assert.ok(state.mounts.every((m) => !('capsule' in m)));
    assert.deepEqual(state.drift, original.drift);
    assert.deepEqual(state.conflicts, original.conflicts);
    assert.deepEqual(
      state.latestPacket,
      original.latestPacket ? summarizePacket(original.latestPacket) : null,
    );
    if (state.latestPacket) {
      for (const field of ['text', 'manifest', 'omitted', 'conflicts'])
        assert.ok(!(field in state.latestPacket));
      assert.deepEqual(state.latestPacket, store.listPackets(state.stream.id).items[0]);
      assert.deepEqual(
        store.getPacket(state.latestPacket.id),
        original.latestPacket,
        'full packet remains available separately',
      );
    }
  }
  assert.ok(compact.streams.some((s) => s.latestPacket === null));
  assert.ok(compact.streams.some((s) => s.drift.length > 0));
  assert.ok(compact.streams.some((s) => s.conflicts.length > 0));
  assert.equal(
    store.getChangeVersion(),
    eventVersion,
    'projection and workspace reads do not write events',
  );
  assert.deepEqual(store.snapshot(project.id), full, 'legacy snapshot stays intact');
  assert.throws(() => store.workspaceSnapshot('missing'), /Project not found/);

  const measure = (value: unknown) => {
    const start = performance.now();
    const json = JSON.stringify(value);
    const serializationMs = performance.now() - start;
    return {
      jsonBytes: Buffer.byteLength(json),
      serializationMs: Number(serializationMs.toFixed(3)),
    };
  };
  const fullSize = measure(full);
  const compactSize = measure(compact);
  assert.ok(
    compactSize.jsonBytes < fullSize.jsonBytes * 0.6,
    'synthetic duplicate-heavy fixture saves at least 40%',
  );
  console.log(
    JSON.stringify(
      {
        fixture: { capsules: 36, streams: 4, mounts: 24, packets: 3 },
        full: fullSize,
        compact: compactSize,
        byteReductionPercent: Number(
          ((1 - compactSize.jsonBytes / fullSize.jsonBytes) * 100).toFixed(1),
        ),
        scope:
          'Single synthetic payload; serialization timed separately. No database CPU or production-performance claim.',
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: compact references, summary/detail separation, full snapshot parity, empty state, read-only behavior and measured payload reduction.',
  );
} finally {
  store.close();
}
