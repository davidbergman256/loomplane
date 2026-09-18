import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/core/store.js';
import { fingerprintSource, checkSources } from '../src/core/sources.js';
const root = await mkdtemp(join(tmpdir(), 'loomplane-sources-'));
const store = new Store(':memory:');
try {
  const file = join(root, 'contract.ts');
  await writeFile(file, 'type Amount = { cents: number };');
  const reference = await fingerprintSource(root, file);
  const p = store.createProject({ name: 'Sources' });
  const s = store.createStream({ projectId: p.id, name: 'UI' });
  store.publishCapsule({
    projectId: p.id,
    streamId: s.id,
    kind: 'constraint',
    title: 'Amount shape',
    body: 'Use integer cents',
    evidence: [reference],
  });
  const packet = store.compile({ streamId: s.id });
  const before = store.events(p.id).length;
  assert.equal((await checkSources(store, { root, packetId: packet.id })).ok, true);
  assert.equal(store.events(p.id).length, before);
  const derivedStream = store.createStream({ projectId: p.id, name: 'Derived UI' });
  const sourceCapsule = store.getPacket(packet.id).manifest[0];
  store.publishCapsule({
    projectId: p.id,
    streamId: derivedStream.id,
    kind: 'decision',
    title: 'Formatting based on source',
    body: 'Divide cents by one hundred',
    dependencies: [{ capsuleId: sourceCapsule.capsuleId, version: sourceCapsule.version }],
  });
  const derivedPacket = store.compile({ streamId: derivedStream.id });
  const afterSetup = store.events(p.id).length;
  await writeFile(file, 'type Amount = { minor: number; exponent: number };');
  const result = await checkSources(store, { root, packetId: packet.id });
  assert.equal(result.ok, false);
  assert.equal(result.findings[0].status, 'changed');
  assert.equal(store.events(p.id).length, afterSetup, 'Read-only source checks do not mutate');
  const transitive = await checkSources(store, { root, packetId: derivedPacket.id });
  assert.equal(transitive.ok, false);
  assert.equal(transitive.findings[0].capsuleId, sourceCapsule.capsuleId);
  await symlink(tmpdir(), join(root, 'escape'));
  await assert.rejects(() => fingerprintSource(root, join(root, 'escape')), /escapes/);
  assert.throws(
    () =>
      store.publishCapsule({
        projectId: p.id,
        kind: 'fact',
        title: 'Bad',
        body: 'Bad',
        evidence: [{ ...reference, fingerprint: { ...reference.fingerprint!, path: '../escape' } }],
      }),
    /relative/,
  );
  console.log(
    'PASS: explicit source fingerprints, exact and transitive packet revision checks, changed-file detection, no read mutation, and root/symlink boundaries.',
  );
} finally {
  store.close();
  await rm(root, { recursive: true, force: true });
}
