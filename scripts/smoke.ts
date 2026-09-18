import assert from 'node:assert/strict';
import { Store, LoomplaneError } from '../src/core/store.js';
import { estimateTokens } from '../src/core/compiler.js';
import { createLoomplaneServer } from '../src/server/index.js';

const store = new Store(':memory:');
try {
  const p = store.createProject({ name: 'Smoke' });
  const other = store.createProject({ name: 'Isolated' });
  const api = store.createStream({ projectId: p.id, name: 'API' });
  const ui = store.createStream({ projectId: p.id, name: 'UI' });
  const capsule = store.publishCapsule({
    projectId: p.id,
    streamId: api.id,
    kind: 'decision',
    key: 'api.contract',
    title: 'Amount contract',
    body: 'Return amount_cents as integer.',
    evidence: [{ label: 'Source', uri: 'repo://smoke/types.ts#L1' }],
  });
  store.mount({ streamId: ui.id, capsuleId: capsule.id });
  const packet = store.compile({ streamId: ui.id, budget: 1000, task: 'Build usage UI' });
  assert.equal(packet.manifest[0].version, 1);
  assert.equal(packet.estimatedTokens, estimateTokens(packet.text));
  assert.ok(packet.estimatedTokens <= 1000);
  assert.equal(store.getStreamState(ui.id).drift.length, 0);
  store.reviseCapsule(capsule.id, {
    expectedVersion: 1,
    body: 'Return amount_minor and currency_exponent.',
    changeNote: 'Multi-currency',
  });
  assert.equal(store.getStreamState(ui.id).drift[0].reason, 'revised');
  assert.equal(store.getPacket(packet.id).manifest[0].version, 1);
  assert.match(store.getPacket(packet.id).text, /amount_cents/);
  assert.throws(
    () => store.reviseCapsule(capsule.id, { expectedVersion: 1, body: 'Lost update' }),
    (e: unknown) => e instanceof LoomplaneError && e.status === 409,
  );
  const refreshed = store.compile({ streamId: ui.id, budget: 1000 });
  assert.equal(refreshed.manifest[0].version, 2);
  assert.equal(store.getStreamState(ui.id).drift.length, 0);
  store.mount({ streamId: ui.id, capsuleId: capsule.id, mode: 'pinned', pinnedVersion: 1 });
  const pinned = store.compile({ streamId: ui.id });
  assert.equal(pinned.manifest[0].version, 1);
  assert.equal(store.getStreamState(ui.id).drift[0].pinned, true);
  const outside = store.createStream({ projectId: other.id, name: 'Other' });
  assert.throws(
    () => store.mount({ streamId: outside.id, capsuleId: capsule.id }),
    /different project/,
  );
  assert.equal(store.search(other.id, 'amount').length, 0);
  assert.equal(store.search(p.id, 'currency')[0].capsule.id, capsule.id);
  store.publishCapsule({
    projectId: p.id,
    streamId: ui.id,
    kind: 'decision',
    key: 'api.contract',
    title: 'Contradictory contract',
    body: 'Return floating-point dollars.',
  });
  assert.equal(store.getStreamState(ui.id).conflicts.length, 1);
  const before = store.events(p.id).length;
  assert.throws(() => store.compile({ streamId: ui.id, budget: 1 }), /budget/);
  assert.equal(store.events(p.id).length, before);
  const server = createLoomplaneServer(store);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(base + '/api/health')).status, 200);
    assert.equal(
      (
        await fetch(base + '/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' },
          body: '{"name":"Bad"}',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + '/api/capsules/' + capsule.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: '{"expectedVersion":1,"body":"Lost"}',
        })
      ).status,
      409,
    );
    const snapshot = await (await fetch(base + '/api/snapshot?projectId=' + p.id)).json();
    assert.equal(snapshot.streams.length, 2);
  } finally {
    await new Promise<void>((r, e) => server.close((err) => (err ? e(err) : r())));
  }
  console.log(
    'PASS: parallel context round-trip, immutable revisions, stale consumers, pins, conflicts, project isolation, budget, search, HTTP and origin protection.',
  );
} finally {
  store.close();
}
