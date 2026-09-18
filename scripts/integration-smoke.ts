import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { importFile } from '../src/adapters/index.js';
import { Store } from '../src/core/store.js';

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'loomplane-integration-'));
const fixtureDirectory = resolve('examples/integrations');

try {
  const store = new Store(':memory:');
  const project = store.createProject({ name: 'Synthetic integration smoke' });
  const stream = store.createStream({ projectId: project.id, name: 'Importer' });

  const markdown = await importFile(store, {
    projectId: project.id,
    streamId: stream.id,
    path: join(fixtureDirectory, 'sample-context.md'),
    format: 'auto',
  });
  const codex = await importFile(store, {
    projectId: project.id,
    streamId: stream.id,
    path: join(fixtureDirectory, 'codex-synthetic.jsonl'),
    format: 'codex',
  });
  const claude = await importFile(store, {
    projectId: project.id,
    streamId: stream.id,
    path: join(fixtureDirectory, 'claude-synthetic.jsonl'),
    format: 'claude',
  });
  const duplicate = await importFile(store, {
    projectId: project.id,
    streamId: stream.id,
    path: join(fixtureDirectory, 'codex-synthetic.jsonl'),
    format: 'codex',
  });

  assert.equal(markdown.imported, 1);
  assert.equal(codex.imported, 2);
  assert.equal(claude.imported, 2);
  assert.equal(duplicate.imported, 0);
  assert.equal(duplicate.skipped, 4);
  assert.match(store.getCapsule(codex.capsuleIds[0]!).evidence[0]!.uri, /#L2$/);

  const changingMarkdownPath = join(temporaryDirectory, 'changing-context.md');
  await writeFile(changingMarkdownPath, '# Managed source\n\nFirst imported value.\n');
  const firstMarkdownImport = await importFile(store, {
    projectId: project.id,
    streamId: stream.id,
    path: changingMarkdownPath,
    format: 'markdown',
  });
  const unchangedMarkdownImport = await importFile(store, {
    projectId: project.id,
    streamId: stream.id,
    path: changingMarkdownPath,
    format: 'markdown',
  });
  await writeFile(changingMarkdownPath, '# Managed source\n\nSecond imported value.\n');
  const changedMarkdownImport = await importFile(store, {
    projectId: project.id,
    streamId: stream.id,
    path: changingMarkdownPath,
    format: 'markdown',
  });
  const managedCapsuleId = firstMarkdownImport.capsuleIds[0]!;
  assert.equal(unchangedMarkdownImport.imported, 0);
  assert.equal(unchangedMarkdownImport.skipped, 1);
  assert.equal(changedMarkdownImport.imported, 1);
  assert.deepEqual(changedMarkdownImport.capsuleIds, [managedCapsuleId]);
  assert.equal(store.getCapsule(managedCapsuleId).version, 2);
  assert.equal(store.getRevisions(managedCapsuleId).length, 2);
  assert.match(store.getCapsule(managedCapsuleId).body, /Second imported value/);

  store.reviseCapsule(managedCapsuleId, {
    expectedVersion: 2,
    body: 'Human-maintained replacement that must survive re-import.',
    author: 'human-editor',
    changeNote: 'Manual correction',
  });
  await writeFile(changingMarkdownPath, '# Managed source\n\nThird imported value.\n');
  const humanConflict = await importFile(store, {
    projectId: project.id,
    streamId: stream.id,
    path: changingMarkdownPath,
    format: 'markdown',
  });
  assert.equal(humanConflict.imported, 0);
  assert.equal(humanConflict.skipped, 1);
  assert.match(humanConflict.warnings.join('\n'), /conflict/i);
  assert.equal(
    store.getCapsule(managedCapsuleId).body,
    'Human-maintained replacement that must survive re-import.',
  );
  assert.equal(store.getCapsule(managedCapsuleId).version, 3);

  const changingJsonlPath = join(temporaryDirectory, 'changing-codex.jsonl');
  await writeFile(
    changingJsonlPath,
    '{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"First line value"}]}}\n',
  );
  const firstJsonlImport = await importFile(store, {
    projectId: project.id,
    streamId: stream.id,
    path: changingJsonlPath,
    format: 'codex',
  });
  await writeFile(
    changingJsonlPath,
    '{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Changed line value"}]}}\n',
  );
  const changedJsonlImport = await importFile(store, {
    projectId: project.id,
    streamId: stream.id,
    path: changingJsonlPath,
    format: 'codex',
  });
  assert.equal(changedJsonlImport.imported, 1);
  assert.deepEqual(changedJsonlImport.capsuleIds, firstJsonlImport.capsuleIds);
  assert.equal(store.getCapsule(firstJsonlImport.capsuleIds[0]!).version, 2);
  assert.equal(store.getCapsule(firstJsonlImport.capsuleIds[0]!).body, 'Changed line value');
  await assert.rejects(
    importFile(store, {
      projectId: project.id,
      path: join(fixtureDirectory, 'codex-synthetic.jsonl'),
      format: 'unsupported' as 'auto',
    }),
    /Unsupported import format/,
  );
  store.close();

  const databasePath = join(temporaryDirectory, 'mcp.sqlite');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', resolve('src/mcp/index.ts'), '--db', databasePath],
    stderr: 'pipe',
  });
  const client = new Client({ name: 'loomplane-smoke-client', version: '0.1.0' });
  await client.connect(transport);
  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === 'loomplane_create_project'));
  assert.ok(tools.tools.some((tool) => tool.name === 'loomplane_compile_context'));

  const created = await client.callTool({
    name: 'loomplane_create_project',
    arguments: { name: 'MCP smoke project', description: 'Synthetic data only' },
  });
  assert.equal(created.isError, undefined);
  const content = created.content as Array<{ type: string; text?: string }>;
  const payload = JSON.parse(content[0]?.type === 'text' ? (content[0].text ?? '{}') : '{}') as {
    id?: string;
  };
  assert.match(payload.id ?? '', /^prj_/);
  await client.close();

  console.log('integration smoke passed: markdown, Codex, Claude, MCP handshake and tool call');
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
