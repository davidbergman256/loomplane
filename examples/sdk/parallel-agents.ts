#!/usr/bin/env node
import { LoomplaneApiError, LoomplaneClient } from 'loomplane/sdk';

const client = new LoomplaneClient({
  baseUrl: process.env.LOOMPLANE_URL,
  token: process.env.LOOMPLANE_TOKEN,
  timeoutMs: 10_000,
});

try {
  await client.health();
  const suffix = new Date().toISOString();
  const project = await client.createProject({
    name: `SDK parallel-agent example ${suffix}`,
    description: 'Synthetic project created by examples/sdk/parallel-agents.ts',
  });
  const apiAgent = await client.createStream({
    projectId: project.id,
    name: 'API agent',
    agent: 'agent-a',
    branch: 'example/api-contract',
  });
  const clientAgent = await client.createStream({
    projectId: project.id,
    name: 'Client agent',
    agent: 'agent-b',
    branch: 'example/client-consumer',
  });

  const contract = await client.publishCapsule({
    projectId: project.id,
    streamId: apiAgent.id,
    key: 'example.response-contract',
    kind: 'decision',
    title: 'Response values use integer minor units',
    body: 'The synthetic response contains amount_minor and currency_exponent. Format money only at the display boundary.',
    author: 'agent-a',
    tags: ['synthetic', 'api-contract'],
    evidence: [
      { label: 'Synthetic example source', uri: 'https://example.invalid/contracts/minor-units' },
    ],
  });
  await client.mount({ streamId: clientAgent.id, capsuleId: contract.id, mode: 'live' });

  const packet = await client.compile({
    streamId: clientAgent.id,
    task: 'Implement the synthetic client against the shared response contract',
    budget: 2_000,
  });
  const preflight = await client.checkPacket(packet.id);
  if (!preflight.ok) throw new Error('Newly compiled packet failed preflight');

  const run = await client.startReceipt(packet.id, 'agent-b');
  await client.finishReceipt(run.id, {
    status: 'completed',
    outcome: 'Synthetic consumer implementation verified against the exact packet',
  });

  const revised = await client.reviseCapsule(contract.id, {
    expectedVersion: contract.version,
    body: 'The synthetic response contains amount_minor, currency, and currency_exponent. Reject unsupported exponents before display.',
    author: 'agent-a',
    changeNote: 'Add explicit validation requirement',
  });
  const oldPacket = await client.checkPacket(packet.id);
  const impact = await client.impact(contract.id);

  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        streams: { producer: apiAgent.id, consumer: clientAgent.id },
        capsule: { id: revised.id, version: revised.version },
        originalPacket: { id: packet.id, stillValid: oldPacket.ok, drift: oldPacket.drift },
        impactedStreams: impact.streams.map((item) => ({
          id: item.stream.id,
          relation: item.relation,
          stale: item.stale,
        })),
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (error instanceof LoomplaneApiError) {
    console.error(`Loomplane API ${error.status} ${error.code}: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}
