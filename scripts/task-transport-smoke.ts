import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { Store } from '../src/core/store.js';
import type { StartedTask, StartTaskInput } from '../src/core/types.js';
import { LoomplaneApiError, LoomplaneClient } from '../src/sdk/client.js';
import { AccessManager } from '../src/server/access.js';
import { createLoomplaneServer } from '../src/server/index.js';

const directory = mkdtempSync(join(tmpdir(), 'loomplane-task-transport-'));
const databasePath = join(directory, 'loomplane.sqlite');
const store = new Store(databasePath);
const access = new AccessManager(databasePath);
const project = store.createProject({ name: 'Task transport project' });
const foreignProject = store.createProject({ name: 'Foreign task project' });
const contract = store.publishCapsule({
  projectId: project.id,
  kind: 'constraint',
  key: 'api.contract',
  title: 'Shared API contract',
  body: 'Return integer amount_minor and currency_exponent.',
});
const foreign = store.publishCapsule({
  projectId: foreignProject.id,
  kind: 'constraint',
  title: 'Foreign contract',
  body: 'Must remain inaccessible.',
});
const writer = access.create(project.id, 'Task writer', 'writer');
const reader = access.create(project.id, 'Task reader', 'reader');
const server = createLoomplaneServer(store, { access });

function parsed(result: unknown): any {
  const content = (result as { content?: unknown }).content as
    Array<{ type: string; text?: string }> | undefined;
  return JSON.parse(content?.[0]?.type === 'text' ? (content[0].text ?? '{}') : '{}');
}

async function connectMcp(url: string, token: string) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', resolve('src/mcp/index.ts'), '--url', url],
    env: {
      ...getDefaultEnvironment(),
      LOOMPLANE_API_TOKEN: token,
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'loomplane-task-smoke', version: '0.1.0' });
  await client.connect(transport);
  return client;
}

await new Promise<void>((resolveListen, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolveListen);
});

try {
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const writerClient = new LoomplaneClient({ baseUrl: url, token: writer.token });
  const readerClient = new LoomplaneClient({ baseUrl: url, token: reader.token });
  const firstInput: StartTaskInput = {
    projectId: project.id,
    name: 'HTTP client task',
    task: 'Implement the HTTP client against the shared API contract',
    agent: 'http-agent',
    branch: 'task/http-client',
    budget: 2_000,
    context: [{ capsuleId: contract.id }],
  };
  const first = await writerClient.startTask(firstInput, { idempotencyKey: 'task-start-http' });
  const replay = await writerClient.startTask(firstInput, { idempotencyKey: 'task-start-http' });
  assert.deepEqual(replay, first);
  assert.match(first.packet.text, /Shared API contract/);
  assert.equal(first.receipt.packetId, first.packet.id);
  assert.equal(first.stream.description, firstInput.task);
  assert.equal(store.listStreams(project.id).length, 1);

  await assert.rejects(
    readerClient.startTask({ ...firstInput, name: 'Reader task' }),
    (error: unknown) =>
      error instanceof LoomplaneApiError && error.status === 403 && error.code === 'FORBIDDEN',
  );

  const writerMcp = await connectMcp(url, writer.token);
  let second!: StartedTask;
  try {
    const tools = await writerMcp.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === 'loomplane_start_task'));
    assert.ok(tools.tools.some((tool) => tool.name === 'loomplane_get_packet'));
    second = parsed(
      await writerMcp.callTool({
        name: 'loomplane_start_task',
        arguments: {
          projectId: project.id,
          name: 'MCP client task',
          task: 'Implement the independent UI against the shared API contract',
          agent: 'mcp-agent',
          branch: 'task/mcp-ui',
          budget: 2_000,
          context: [{ capsuleId: contract.id, mode: 'live' }],
        },
      }),
    ) as StartedTask;
    assert.notEqual(second.stream.id, first.stream.id);
    assert.notEqual(second.packet.id, first.packet.id);
    assert.notEqual(second.receipt.id, first.receipt.id);
    assert.match(second.packet.text, /Shared API contract/);

    const exact = parsed(
      await writerMcp.callTool({
        name: 'loomplane_get_packet',
        arguments: { packetId: second.packet.id },
      }),
    );
    assert.deepEqual(exact, second.packet);

    const deniedForeign = await writerMcp.callTool({
      name: 'loomplane_start_task',
      arguments: {
        projectId: project.id,
        name: 'Foreign reference task',
        task: 'Must be denied before mutation',
        agent: 'mcp-agent',
        context: [{ capsuleId: foreign.id }],
      },
    });
    assert.equal(deniedForeign.isError, true);
    assert.equal(parsed(deniedForeign).code, 'NOT_FOUND');
    assert.equal(store.listStreams(project.id).length, 2);

    store.reviseCapsule(contract.id, {
      expectedVersion: 1,
      body: 'Return integer amount_minor, currency, and currency_exponent.',
      changeNote: 'Contract changed while both tasks were active',
    });
    assert.equal((await writerClient.checkPacket(first.packet.id)).ok, false);
    const secondCheck = parsed(
      await writerMcp.callTool({
        name: 'loomplane_check_packet',
        arguments: { packetId: second.packet.id },
      }),
    );
    assert.equal(secondCheck.ok, false);
  } finally {
    await writerMcp.close();
  }

  for (const receiptId of [first.receipt.id, second.receipt.id]) {
    await assert.rejects(
      writerClient.finishReceipt(receiptId, { status: 'completed' }),
      (error: unknown) =>
        error instanceof LoomplaneApiError &&
        error.status === 409 &&
        error.code === 'STALE_CONTEXT',
    );
    await writerClient.finishReceipt(receiptId, {
      status: 'abandoned',
      outcome: 'Shared API contract changed during the task.',
    });
  }

  console.log(
    'task transport smoke passed: HTTP replay, remote MCP start/get, scoped denial, two stale packets, and blocked completion',
  );
} finally {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  access.close();
  store.close();
  rmSync(directory, { recursive: true, force: true });
}
