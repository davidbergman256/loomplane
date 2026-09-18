import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { Store } from '../src/core/store.js';
import { AccessManager } from '../src/server/access.js';
import { createLoomplaneServer } from '../src/server/index.js';

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'loomplane-remote-mcp-'));
const databasePath = join(temporaryDirectory, 'team.sqlite');
const store = new Store(databasePath);
const access = new AccessManager(databasePath);
const projectA = store.createProject({ name: 'Synthetic remote MCP project A' });
const projectB = store.createProject({ name: 'Synthetic remote MCP project B' });
const writer = access.create(projectA.id, 'Synthetic writer', 'writer');
const reader = access.create(projectA.id, 'Synthetic reader', 'reader');
const server = createLoomplaneServer(store, { host: '127.0.0.1', port: 0, access });

function parsed(result: unknown): any {
  const content = (result as { content?: unknown }).content as
    Array<{ type: string; text?: string }> | undefined;
  return JSON.parse(content?.[0]?.type === 'text' ? (content[0].text ?? '{}') : '{}');
}

async function connect(url: string, token: string, urlFromEnvironment = false) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      '--import',
      'tsx',
      resolve('src/mcp/index.ts'),
      ...(urlFromEnvironment ? [] : ['--url', url]),
    ],
    env: {
      ...getDefaultEnvironment(),
      LOOMPLANE_API_TOKEN: token,
      ...(urlFromEnvironment ? { LOOMPLANE_URL: url } : {}),
    },
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });
  const client = new Client({ name: 'loomplane-remote-smoke', version: '0.1.0' });
  await client.connect(transport);
  return { client, stderr: () => stderr };
}

await new Promise<void>((resolveListen, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolveListen);
});

try {
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const writerMcp = await connect(url, writer.token);
  try {
    const projects = parsed(
      await writerMcp.client.callTool({ name: 'loomplane_list_projects', arguments: {} }),
    );
    assert.deepEqual(
      projects.map((project: { id: string }) => project.id),
      [projectA.id],
    );

    const stream = parsed(
      await writerMcp.client.callTool({
        name: 'loomplane_create_stream',
        arguments: { projectId: projectA.id, name: 'Remote writer stream', agent: 'remote-writer' },
      }),
    );
    const capsule = parsed(
      await writerMcp.client.callTool({
        name: 'loomplane_publish_capsule',
        arguments: {
          projectId: projectA.id,
          streamId: stream.id,
          kind: 'constraint',
          title: 'Synthetic remote contract',
          body: 'Remote MCP operations stay inside the credential project.',
          author: 'remote-writer',
        },
      }),
    );
    assert.match(capsule.id, /^cap_/);
    const details = parsed(
      await writerMcp.client.callTool({
        name: 'loomplane_inspect_revisions',
        arguments: { capsuleId: capsule.id },
      }),
    );
    assert.equal(details.capsule.id, capsule.id);
    assert.equal(details.revisions.length, 1);
    const packet = parsed(
      await writerMcp.client.callTool({
        name: 'loomplane_compile_context',
        arguments: { streamId: stream.id, task: 'Remote scoped MCP smoke', budget: 1_000 },
      }),
    );
    const check = parsed(
      await writerMcp.client.callTool({
        name: 'loomplane_check_packet',
        arguments: { packetId: packet.id },
      }),
    );
    assert.equal(check.ok, true);
    const receipt = parsed(
      await writerMcp.client.callTool({
        name: 'loomplane_start_receipt',
        arguments: { packetId: packet.id, agent: 'remote-writer' },
      }),
    );
    const receiptDetails = parsed(
      await writerMcp.client.callTool({
        name: 'loomplane_inspect_receipt',
        arguments: { receiptId: receipt.id },
      }),
    );
    assert.equal(receiptDetails.receipt.id, receipt.id);
    assert.equal(receiptDetails.check.ok, true);

    const crossProject = await writerMcp.client.callTool({
      name: 'loomplane_list_streams',
      arguments: { projectId: projectB.id },
    });
    assert.equal(crossProject.isError, true);
    assert.equal(parsed(crossProject).code, 'NOT_FOUND');
  } finally {
    await writerMcp.client.close();
  }
  assert.doesNotMatch(
    writerMcp.stderr(),
    new RegExp(writer.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );

  const readerMcp = await connect(url, reader.token, true);
  try {
    const projects = parsed(
      await readerMcp.client.callTool({ name: 'loomplane_list_projects', arguments: {} }),
    );
    assert.deepEqual(
      projects.map((project: { id: string }) => project.id),
      [projectA.id],
    );
    const mutation = await readerMcp.client.callTool({
      name: 'loomplane_create_stream',
      arguments: { projectId: projectA.id, name: 'Reader must not create this' },
    });
    assert.equal(mutation.isError, true);
    assert.equal(parsed(mutation).code, 'FORBIDDEN');
    const crossProject = await readerMcp.client.callTool({
      name: 'loomplane_list_streams',
      arguments: { projectId: projectB.id },
    });
    assert.equal(crossProject.isError, true);
    assert.equal(parsed(crossProject).code, 'NOT_FOUND');
  } finally {
    await readerMcp.client.close();
  }
  assert.doesNotMatch(
    readerMcp.stderr(),
    new RegExp(reader.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );

  console.log(
    'remote MCP smoke passed: writer lifecycle, packet check, reader denial, project isolation, no token logs',
  );
} finally {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  access.close();
  store.close();
  await import('node:fs/promises').then(({ rm }) =>
    rm(temporaryDirectory, { recursive: true, force: true }),
  );
}
