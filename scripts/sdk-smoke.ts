import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { LoomplaneClient, LoomplaneApiError } from '../src/sdk/index.js';
import { Store } from '../src/core/store.js';
import { createLoomplaneServer } from '../src/server/index.js';

const store = new Store(':memory:');
const server = createLoomplaneServer(store, {
  host: '127.0.0.1',
  port: 0,
  token: 'synthetic-smoke-token',
});

await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

try {
  const { port } = server.address() as AddressInfo;
  const client = new LoomplaneClient({
    baseUrl: `http://127.0.0.1:${port}`,
    token: 'synthetic-smoke-token',
    timeoutMs: 2_000,
  });

  assert.equal((await client.health()).ok, true);
  const project = await client.createProject({ name: 'Synthetic SDK smoke' });
  const producer = await client.createStream({
    projectId: project.id,
    name: 'Producer',
    agent: 'agent-a',
  });
  const consumer = await client.createStream({
    projectId: project.id,
    name: 'Consumer',
    agent: 'agent-b',
  });
  const capsule = await client.publishCapsule({
    projectId: project.id,
    streamId: producer.id,
    key: 'api-contract',
    kind: 'constraint',
    title: 'Preserve the response contract',
    body: 'Return domain objects directly from the documented endpoints.',
    author: 'agent-a',
    evidence: [{ label: 'Synthetic contract', uri: 'https://example.invalid/synthetic-contract' }],
  });
  await client.mount({ streamId: consumer.id, capsuleId: capsule.id });
  const packet = await client.compile({
    streamId: consumer.id,
    task: 'Implement the consumer',
    budget: 1_000,
  });
  assert.equal((await client.checkPacket(packet.id)).ok, true);

  const receipt = await client.startReceipt(packet.id, 'agent-b');
  const completed = await client.finishReceipt(receipt.id, {
    status: 'completed',
    outcome: 'Synthetic verification completed',
  });
  assert.equal(completed.status, 'completed');
  assert.equal((await client.getReceipt(receipt.id)).receipt.id, receipt.id);
  assert.equal((await client.listReceipts(project.id)).length, 1);
  assert.ok(
    (await client.impact(capsule.id)).streams.some((item) => item.stream.id === consumer.id),
  );
  assert.equal((await client.search(project.id, 'response contract')).length, 1);

  await client.reviseCapsule(capsule.id, {
    expectedVersion: 1,
    body: 'Return versioned domain objects directly from the documented endpoints.',
    changeNote: 'Synthetic revision',
  });
  assert.equal((await client.checkPacket(packet.id)).ok, false);

  await assert.rejects(
    client.getPacket('pkt_missing'),
    (error) =>
      error instanceof LoomplaneApiError && error.status === 404 && error.code === 'NOT_FOUND',
  );

  const controller = new AbortController();
  controller.abort('synthetic cancellation');
  await assert.rejects(client.listProjects({ signal: controller.signal }));

  console.log(
    'sdk smoke passed: authenticated HTTP, two streams, packet preflight, receipt, drift, impact, search, errors, cancellation',
  );
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
}
