import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../src/core/store.js';
import { fingerprintSource } from '../src/core/sources.js';
import { AccessManager } from '../src/server/access.js';
import { createLoomplaneServer } from '../src/server/index.js';
import { LoomplaneClient } from '../src/sdk/client.js';
import { runWithContext, remoteRunnerPort } from '../src/runner/run.js';

const directory = mkdtempSync(join(tmpdir(), 'loomplane-remote-runner-'));
const database = join(directory, 'server.sqlite');
const store = new Store(database);
const access = new AccessManager(database);
const project = store.createProject({ name: 'Remote runner fixture' });
const stream = store.createStream({ projectId: project.id, name: 'Remote stream' });
const source = join(directory, 'contract.txt');
writeFileSync(source, 'v1');
const capsule = store.publishCapsule({
  projectId: project.id,
  streamId: stream.id,
  kind: 'constraint',
  title: 'Remote contract',
  body: 'Read the supplied file.',
  evidence: [await fingerprintSource(directory, source)],
});
const writer = access.create(project.id, 'Synthetic runner', 'writer');
const reader = access.create(project.id, 'Synthetic reader', 'reader');
const server = createLoomplaneServer(store, { access });
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const url = `http://127.0.0.1:${address.port}`;
const client = new LoomplaneClient({ baseUrl: url, token: writer.token });
const port = remoteRunnerPort(client);
try {
  const result = await runWithContext(port, {
    serverUrl: url,
    streamId: stream.id,
    sourceRoot: directory,
    command: [
      process.execPath,
      '-e',
      `
      if (!process.env.LOOMPLANE_URL || process.env.LOOMPLANE_DB) process.exit(8);
      const text=require('node:fs').readFileSync(process.env.LOOMPLANE_CONTEXT_FILE,'utf8');
      if (!text.includes('Remote contract')) process.exit(9);
    `,
    ],
  });
  assert.equal(result.status, 'completed-fresh');
  assert.equal(result.sourcePostflight?.checked, 1);
  assert.equal((await client.getReceipt(result.receiptId!)).receipt.status, 'completed');

  const changed = await runWithContext(port, {
    serverUrl: url,
    streamId: stream.id,
    command: [
      process.execPath,
      '-e',
      `
      fetch(process.env.LOOMPLANE_URL+'/api/capsules/'+process.argv[1], {
        method:'PATCH', headers:{'Content-Type':'application/json', Authorization:'Bearer '+process.argv[2]},
        body:JSON.stringify({expectedVersion:1,body:'A changed shared contract.'})
      }).then(r=>{if(!r.ok)process.exit(10)}).catch(()=>process.exit(11));
    `,
      capsule.id,
      writer.token,
    ],
  });
  assert.equal(changed.status, 'context-changed');
  assert.equal(changed.exitCode, 2);
  assert.equal(store.getReceipt(changed.receiptId!).status, 'abandoned');
  const sourceChanged = await runWithContext(port, {
    serverUrl: url,
    streamId: stream.id,
    sourceRoot: directory,
    command: [
      process.execPath,
      '-e',
      "require('node:fs').writeFileSync(process.argv[1],'v2')",
      source,
    ],
  });
  assert.equal(sourceChanged.sourcePostflight?.ok, false);
  assert.equal(sourceChanged.status, 'context-changed');

  const args = [
    '--import',
    resolve('node_modules/tsx/dist/loader.mjs'),
    resolve('src/cli/index.ts'),
    'run',
    '--url',
    url,
    '--stream',
    stream.id,
    '--',
    process.execPath,
    resolve('examples/runner/read-context.mjs'),
  ];
  const cli = await new Promise<{ code: number | null; out: string; err: string }>((done) => {
    const child = spawn(process.execPath, args, {
      cwd: directory,
      env: { ...process.env, LOOMPLANE_API_TOKEN: writer.token },
    });
    let out = '',
      err = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.stderr.on('data', (chunk) => {
      err += chunk;
    });
    child.on('close', (code) => done({ code, out, err }));
  });
  assert.equal(cli.code, 0, cli.err);
  assert.match(cli.out, /A changed shared contract/);
  assert.match(cli.err, /completed-fresh/);
  assert.ok(!cli.err.includes(writer.token));
  await assert.rejects(
    runWithContext(remoteRunnerPort(new LoomplaneClient({ baseUrl: url, token: reader.token })), {
      serverUrl: url,
      streamId: stream.id,
      command: [process.execPath, '-e', 'process.exit(0)'],
    }),
    (error: any) => error.code === 'FORBIDDEN',
  );
  console.log(
    'PASS: remote runner, authenticated receipt, shared contract drift, local source drift, CLI hand-off and reader denial.',
  );
} finally {
  await new Promise<void>((done) => server.close(() => done()));
  access.close();
  store.close();
  rmSync(directory, { recursive: true, force: true });
}
