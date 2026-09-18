import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/core/store.js';
import { LoomplaneClient } from '../src/sdk/client.js';
import { AccessManager } from '../src/server/access.js';
import { createLoomplaneServer } from '../src/server/index.js';

const directory = mkdtempSync(join(tmpdir(), 'loomplane-workspace-http-'));
const databasePath = join(directory, 'loomplane.sqlite');
const store = new Store(databasePath);
const access = new AccessManager(databasePath);

const projectA = store.createProject({ name: 'Workspace A' });
const projectB = store.createProject({ name: 'Private workspace B' });
const producer = store.createStream({ projectId: projectA.id, name: 'Producer' });
const consumer = store.createStream({ projectId: projectA.id, name: 'Consumer' });
const foreignStream = store.createStream({ projectId: projectB.id, name: 'Foreign stream' });
const owned = store.publishCapsule({
  projectId: projectA.id,
  streamId: producer.id,
  kind: 'fact',
  title: 'Owned A context',
  body: 'Visible in A.',
});
const shared = store.publishCapsule({
  projectId: projectA.id,
  kind: 'constraint',
  title: 'Shared A context',
  body: 'Mounted into the consumer.',
});
const foreign = store.publishCapsule({
  projectId: projectB.id,
  streamId: foreignStream.id,
  kind: 'fact',
  title: 'Foreign secret context',
  body: 'Must never appear in A.',
});
const mount = store.mount({ streamId: consumer.id, capsuleId: shared.id });
const packet = store.compile({ streamId: consumer.id, task: 'Exercise compact workspace' });
const reader = access.create(projectA.id, 'Workspace reader', 'reader');
const server = createLoomplaneServer(store, { access });
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;
const client = new LoomplaneClient({ baseUrl, token: reader.token });

try {
  const workspace = await client.workspace();
  assert.equal(workspace.format, 'loomplane.workspace');
  assert.equal(workspace.version, 1);
  assert.equal(workspace.project?.id, projectA.id);
  assert.deepEqual(
    workspace.projects.map((project) => project.id),
    [projectA.id],
  );
  assert.deepEqual(
    new Set(workspace.capsules.map((capsule) => capsule.id)),
    new Set([owned.id, shared.id]),
  );
  assert.ok(!workspace.capsules.some((capsule) => capsule.id === foreign.id));
  assert.ok(!workspace.streams.some((state) => state.stream.id === foreignStream.id));

  const capsuleIds = new Set(workspace.capsules.map((capsule) => capsule.id));
  for (const state of workspace.streams) {
    for (const capsuleId of state.ownedIds) assert.ok(capsuleIds.has(capsuleId));
    for (const reference of state.mounts) {
      assert.ok(capsuleIds.has(reference.capsuleId));
      assert.equal('capsule' in reference, false);
    }
  }
  const producerState = workspace.streams.find((state) => state.stream.id === producer.id)!;
  const consumerState = workspace.streams.find((state) => state.stream.id === consumer.id)!;
  assert.deepEqual(producerState.ownedIds, [owned.id]);
  assert.deepEqual(consumerState.mounts, [mount]);
  assert.equal(consumerState.latestPacket?.id, packet.id);
  assert.equal(consumerState.latestPacket?.capsuleCount, packet.manifest.length);
  assert.equal('text' in consumerState.latestPacket!, false);
  assert.equal('manifest' in consumerState.latestPacket!, false);
  assert.equal('omitted' in consumerState.latestPacket!, false);

  const explicit = await client.workspace(projectA.id);
  assert.equal(explicit.project?.id, projectA.id);
  const denied = await fetch(`${baseUrl}/api/workspace?projectId=${projectB.id}`, {
    headers: { Authorization: `Bearer ${reader.token}` },
  });
  assert.equal(denied.status, 404);
  const deniedBody = (await denied.json()) as { code?: string };
  assert.equal(deniedBody.code, 'NOT_FOUND');

  const legacy = await client.snapshot();
  const legacyProducer = legacy.streams.find((state) => state.stream.id === producer.id)!;
  const legacyConsumer = legacy.streams.find((state) => state.stream.id === consumer.id)!;
  assert.equal(legacyProducer.owned[0]?.id, owned.id);
  assert.equal(legacyConsumer.mounts[0]?.capsule.id, shared.id);
  assert.equal(legacyConsumer.latestPacket?.text, packet.text);

  console.log(
    'workspace HTTP smoke passed: scoped reader access, normalized references, packet summaries, foreign denial, and legacy snapshot',
  );
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  access.close();
  store.close();
  rmSync(directory, { recursive: true, force: true });
}
