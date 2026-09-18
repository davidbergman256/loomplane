import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/core/store.js';

const directory = mkdtempSync(join(tmpdir(), 'loomplane-lifecycle-'));
const path = join(directory, 'db.sqlite');
const a = new Store(path);
const b = new Store(path);
try {
  const p = a.createProject({ name: 'Lifecycle' });
  const producer = a.createStream({ projectId: p.id, name: 'Producer' });
  const consumer = a.createStream({ projectId: p.id, name: 'Consumer' });
  const source = a.publishCapsule({
    projectId: p.id,
    streamId: producer.id,
    kind: 'decision',
    title: 'API contract',
    body: 'Use cents',
  });
  const derived = a.publishCapsule({
    projectId: p.id,
    streamId: consumer.id,
    kind: 'decision',
    title: 'UI formatting',
    body: 'Divide cents by 100',
    dependencies: [{ capsuleId: source.id, version: 1 }],
  });
  const packet = a.compile({ streamId: consumer.id });
  const run = a.startReceipt(packet.id, 'test agent');
  assert.equal(a.checkPacket(packet.id).ok, true);
  b.reviseCapsule(source.id, { expectedVersion: 1, body: 'Use amount_minor and exponent' });
  assert.throws(
    () => a.reviseCapsule(source.id, { expectedVersion: 1, body: 'Concurrent stale edit' }),
    /changed/,
  );
  const check = a.checkPacket(packet.id);
  assert.equal(check.ok, false);
  assert.equal(check.drift[0].reason, 'dependency');
  assert.equal(check.drift[0].dependency?.capsuleId, source.id);
  assert.throws(() => a.finishReceipt(run.id, { status: 'completed' }), /changed/);
  assert.equal(a.getReceipt(run.id).status, 'started');
  a.finishReceipt(run.id, { status: 'abandoned', outcome: 'Upstream contract changed' });
  assert.throws(() => a.finishReceipt(run.id, { status: 'completed' }), /finalized/);
  const impact = a.impact(source.id);
  assert.equal(impact.dependentCapsules[0].id, derived.id);
  assert.ok(impact.streams.some((s) => s.stream.id === consumer.id && s.relation === 'transitive'));
  a.reviseCapsule(derived.id, {
    expectedVersion: 1,
    body: 'Divide amount_minor by 10 ** exponent',
    dependencies: [{ capsuleId: source.id, version: 2 }],
    changeNote: 'Revalidated new contract',
  });
  const newPacket = a.compile({ streamId: consumer.id });
  assert.equal(a.checkPacket(newPacket.id).ok, true);
  const newRun = a.startReceipt(newPacket.id, 'test agent');
  a.finishReceipt(newRun.id, {
    status: 'completed',
    outcome: 'Revalidated formatting',
    gitCommit: 'abcdef0',
  });
  assert.throws(
    () =>
      a.reviseCapsule(source.id, {
        expectedVersion: 2,
        dependencies: [{ capsuleId: derived.id, version: 2 }],
      }),
    /cycle/,
  );
  assert.equal(a.getRevisions(source.id).length, 2);
  assert.equal(a.getPacket(packet.id).manifest[0].version, 1);

  // Context omitted because it was inactive must invalidate a packet when restored.
  const restoredStream = a.createStream({ projectId: p.id, name: 'Restored context' });
  const restored = a.publishCapsule({
    projectId: p.id,
    kind: 'constraint',
    title: 'Currency constraint',
    body: 'Honor the currency exponent.',
  });
  a.mount({ streamId: restoredStream.id, capsuleId: restored.id });
  a.setCapsuleStatus(restored.id, 'retracted', 1);
  const withoutRestored = a.compile({ streamId: restoredStream.id });
  assert.equal(withoutRestored.omitted[0].reason, 'retracted');
  const restoredRun = a.startReceipt(withoutRestored.id, 'test agent');
  b.setCapsuleStatus(restored.id, 'active', 2);
  assert.ok(
    a
      .checkPacket(withoutRestored.id)
      .drift.some((d) => d.capsuleId === restored.id && d.reason === 'added'),
  );
  assert.throws(() => a.finishReceipt(restoredRun.id, { status: 'completed' }), /changed/);

  // Historical packets retain dependencies even after the current capsule drops them.
  const historyStream = a.createStream({ projectId: p.id, name: 'Historical consumer' });
  const historySource = a.publishCapsule({
    projectId: p.id,
    kind: 'fact',
    title: 'Historical source',
    body: 'Original agreement',
  });
  const historyDerived = a.publishCapsule({
    projectId: p.id,
    streamId: historyStream.id,
    kind: 'decision',
    title: 'Historical derivation',
    body: 'Use original agreement',
    dependencies: [{ capsuleId: historySource.id, version: 1 }],
  });
  const historicalPacket = a.compile({ streamId: historyStream.id });
  const historicalRun = a.startReceipt(historicalPacket.id, 'test agent');
  a.reviseCapsule(historyDerived.id, {
    expectedVersion: 1,
    body: 'Independent agreement',
    dependencies: [],
  });
  b.reviseCapsule(historySource.id, { expectedVersion: 1, body: 'Changed agreement' });
  const historicalImpact = a.impact(historySource.id);
  assert.ok(
    historicalImpact.receipts.some(
      (r) =>
        r.receipt.id === historicalRun.id &&
        r.check.drift.some((d) => d.dependency?.capsuleId === historySource.id),
    ),
  );
  assert.ok(
    historicalImpact.streams.some(
      (s) => s.stream.id === historyStream.id && s.relation === 'transitive' && s.stale,
    ),
  );
  assert.equal(historicalImpact.dependentCapsules.length, 0);
  const independentPacket = a.compile({ streamId: historyStream.id });
  const independentRun = a.startReceipt(independentPacket.id, 'test agent');
  assert.ok(!a.impact(historySource.id).receipts.some((r) => r.receipt.id === independentRun.id));
  assert.ok(!a.impact(historySource.id).streams.some((s) => s.stream.id === historyStream.id));
  console.log(
    'PASS: two database clients, transitive invalidation, dependency cycle rejection, immutable packets, reactivated context, historical impact, and completion checks against exact run receipts.',
  );
} finally {
  a.close();
  b.close();
  rmSync(directory, { recursive: true, force: true });
}
