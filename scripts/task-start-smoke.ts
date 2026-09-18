import assert from 'node:assert/strict';
import { Store, LoomplaneError } from '../src/core/store.js';
import type { StartTaskInput } from '../src/core/types.js';

const store = new Store(':memory:');
const errorCode = (code: string) => (error: unknown) =>
  error instanceof LoomplaneError && error.code === code;
try {
  assert.equal(typeof store.startTask, 'function', 'Store exposes atomic task start');
  const project = store.createProject({ name: 'Independent tasks' });
  const other = store.createProject({ name: 'Other scope' });
  const contract = store.publishCapsule({
    projectId: project.id,
    kind: 'decision',
    title: 'Shared contract',
    body: 'Use integer cents',
  });
  const input: StartTaskInput = {
    projectId: project.id,
    name: 'Implement checkout',
    task: 'Read the contract and implement checkout.',
    agent: 'Synthetic agent',
    branch: 'task/checkout',
    context: [{ capsuleId: contract.id }],
  };
  const first = store.startTask(input);
  const second = store.startTask({
    ...input,
    name: 'Implement invoices',
    task: 'Read the contract and implement invoices.',
  });
  assert.notEqual(first.stream.id, second.stream.id);
  assert.notEqual(first.packet.id, second.packet.id);
  assert.notEqual(first.receipt.id, second.receipt.id);
  assert.deepEqual(first.stream, store.getStream(first.stream.id));
  assert.equal(first.stream.description, input.task);
  assert.equal(first.stream.agent, input.agent);
  assert.equal(first.stream.branch, input.branch);
  assert.equal(first.mounts.length, 1);
  assert.equal(first.mounts[0].mode, 'live');
  assert.equal(first.packet.manifest[0].capsuleId, contract.id);
  assert.equal(first.packet.manifest[0].version, 1);
  assert.ok(first.packet.text.includes(input.task));
  assert.ok(first.packet.text.includes(contract.body));
  assert.equal(first.receipt.packetId, first.packet.id);
  assert.equal(first.receipt.status, 'started');
  assert.equal(store.checkPacket(first.packet.id).ok, true);
  assert.equal(store.checkPacket(second.packet.id).ok, true);
  store.reviseCapsule(contract.id, {
    expectedVersion: 1,
    body: 'Use minor units with explicit exponent',
  });
  for (const started of [first, second]) {
    assert.equal(store.checkPacket(started.packet.id).ok, false);
    assert.throws(
      () => store.finishReceipt(started.receipt.id, { status: 'completed' }),
      errorCode('STALE_CONTEXT'),
    );
    assert.deepEqual(store.getPacket(started.packet.id), started.packet);
    assert.equal(store.getReceipt(started.receipt.id).status, 'started');
  }
  const pinned = store.startTask({
    ...input,
    context: [{ capsuleId: contract.id, mode: 'pinned', pinnedVersion: 1 }],
  });
  assert.equal(pinned.packet.manifest[0].version, 1);
  assert.equal(pinned.mounts[0].pinnedVersion, 1);
  assert.equal(store.checkPacket(pinned.packet.id).ok, true);

  const foreign = store.publishCapsule({
    projectId: other.id,
    kind: 'fact',
    title: 'Foreign',
    body: 'Separate project',
  });
  const inactive = store.publishCapsule({
    projectId: project.id,
    kind: 'fact',
    title: 'Inactive',
    body: 'Withdrawn',
  });
  store.setCapsuleStatus(inactive.id, 'retracted', 1);
  const huge = store.publishCapsule({
    projectId: project.id,
    kind: 'fact',
    title: 'Large context',
    body: 'large '.repeat(2000),
  });
  const stale = store.publishCapsule({
    projectId: project.id,
    kind: 'fact',
    title: 'Stale derivation',
    body: 'Use old contract',
    dependencies: [{ capsuleId: contract.id, version: 1 }],
  });
  const conflicting = ['A', 'B'].map((body) =>
    store.publishCapsule({
      projectId: project.id,
      kind: 'decision',
      key: 'conflict',
      title: body,
      body,
    }),
  );
  const records = () =>
    [project, other].map((p) => {
      const { exportedAt: _exportedAt, ...rest } = store.exportProject(p.id) as Record<
        string,
        unknown
      >;
      return rest;
    });
  const rollback = (patch: Partial<StartTaskInput>, code: string) => {
    const before = records();
    assert.throws(() => store.startTask({ ...input, ...patch }), errorCode(code));
    assert.deepEqual(
      records(),
      before,
      'failed start leaves no stream, mount, packet, receipt or event',
    );
  };
  rollback({ context: [{ capsuleId: foreign.id }] }, 'PROJECT_MISMATCH');
  rollback({ context: [{ capsuleId: 'missing' }] }, 'NOT_FOUND');
  rollback({ context: [{ capsuleId: contract.id }, { capsuleId: contract.id }] }, 'INVALID_INPUT');
  rollback({ context: [] }, 'INVALID_INPUT');
  rollback(
    { context: Array.from({ length: 101 }, () => ({ capsuleId: contract.id })) },
    'INVALID_INPUT',
  );
  rollback({ context: [{ capsuleId: inactive.id }] }, 'INVALID_INPUT');
  rollback({ context: [{ capsuleId: contract.id, pinnedVersion: 1 }] }, 'INVALID_INPUT');
  rollback({ context: [{ capsuleId: contract.id, mode: 'pinned' }] }, 'INVALID_INPUT');
  rollback(
    { context: [{ capsuleId: contract.id, mode: 'pinned', pinnedVersion: 0 }] },
    'INVALID_INPUT',
  );
  rollback(
    { context: [{ capsuleId: contract.id, mode: 'pinned', pinnedVersion: 99 }] },
    'NOT_FOUND',
  );
  rollback({ context: [{ capsuleId: huge.id }], budget: 256 }, 'TASK_CONTEXT_OMITTED');
  rollback({ context: [{ capsuleId: stale.id }] }, 'STALE_CONTEXT');
  rollback({ context: conflicting.map((c) => ({ capsuleId: c.id })) }, 'STALE_CONTEXT');
  rollback({ name: ' ' }, 'INVALID_INPUT');
  rollback({ task: ' ' }, 'INVALID_INPUT');
  rollback({ task: 'x'.repeat(3001) }, 'INVALID_INPUT');
  rollback({ agent: ' ' }, 'INVALID_INPUT');
  rollback({ branch: 'x'.repeat(301) }, 'INVALID_INPUT');
  console.log(
    'PASS: independent atomic task starts, exact shared context and receipts, stale completion blocks, explicit pins and complete rollback on invalid/omitted/conflicted context.',
  );
} finally {
  store.close();
}
