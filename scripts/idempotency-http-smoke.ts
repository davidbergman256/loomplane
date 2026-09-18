import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/core/store.js';
import { LoomplaneApiError, LoomplaneClient } from '../src/sdk/client.js';
import { AccessManager } from '../src/server/access.js';
import { createLoomplaneServer } from '../src/server/index.js';

const directory = mkdtempSync(join(tmpdir(), 'loomplane-idempotency-http-'));
const databasePath = join(directory, 'loomplane.sqlite');
const store = new Store(databasePath);
const access = new AccessManager(databasePath);

const project = store.createProject({ name: 'HTTP idempotency smoke' });
const stream = store.createStream({ projectId: project.id, name: 'Writer stream' });
const writerA = access.create(project.id, 'Writer A', 'writer');
const writerB = access.create(project.id, 'Writer B', 'writer');
const revokedWriter = access.create(project.id, 'Revoked writer', 'writer');
const server = createLoomplaneServer(store, { access });
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;

interface RawResult {
  status: number;
  replayed: string | null;
  body: any;
}

async function rawWrite(
  token: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  input: object | string | undefined,
  idempotencyKey?: string,
): Promise<RawResult> {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(input === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(idempotencyKey === undefined ? {} : { 'Idempotency-Key': idempotencyKey }),
    },
    body:
      input === undefined ? undefined : typeof input === 'string' ? input : JSON.stringify(input),
  });
  return {
    status: response.status,
    replayed: response.headers.get('idempotency-replayed'),
    body: await response.json(),
  };
}

try {
  const input = {
    projectId: project.id,
    streamId: stream.id,
    kind: 'fact' as const,
    title: 'Concurrent logical write',
    body: 'Commit exactly once.',
  };
  const clientOne = new LoomplaneClient({ baseUrl, token: writerA.token });
  const clientTwo = new LoomplaneClient({ baseUrl, token: writerA.token });
  const [first, duplicate] = await Promise.all([
    clientOne.publishCapsule(input, { idempotencyKey: 'concurrent-write' }),
    clientTwo.publishCapsule(input, { idempotencyKey: 'concurrent-write' }),
  ]);
  assert.equal(first.id, duplicate.id);
  assert.equal(
    store
      .events(project.id)
      .filter((event) => event.type === 'capsule.published' && event.entityId === first.id).length,
    1,
  );
  const replay = await rawWrite(writerA.token, 'POST', '/capsules', input, 'concurrent-write');
  assert.equal(replay.status, 201);
  assert.equal(replay.replayed, 'true');
  assert.equal(replay.body.id, first.id);

  const ordered = `{"projectId":${JSON.stringify(project.id)},"streamId":${JSON.stringify(stream.id)},"kind":"fact","title":"Canonical object","body":"Same body"}`;
  const reordered = `{"body":"Same body","title":"Canonical object","kind":"fact","streamId":${JSON.stringify(stream.id)},"projectId":${JSON.stringify(project.id)}}`;
  const canonicalFirst = await rawWrite(
    writerA.token,
    'POST',
    '/capsules',
    ordered,
    'canonical-body',
  );
  const canonicalReplay = await rawWrite(
    writerA.token,
    'POST',
    '/capsules',
    reordered,
    'canonical-body',
  );
  assert.equal(canonicalFirst.status, 201);
  assert.equal(canonicalFirst.replayed, 'false');
  assert.equal(canonicalReplay.status, 201);
  assert.equal(canonicalReplay.replayed, 'true');
  assert.equal(canonicalReplay.body.id, canonicalFirst.body.id);

  const conflict = await rawWrite(
    writerA.token,
    'POST',
    '/capsules',
    { ...input, title: 'Different operation body' },
    'canonical-body',
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, 'IDEMPOTENCY_CONFLICT');

  const invalid = await rawWrite(
    writerA.token,
    'POST',
    '/capsules',
    { projectId: project.id, streamId: stream.id, kind: 'fact', body: 'Missing title' },
    'correct-after-failure',
  );
  assert.equal(invalid.status, 400);
  const corrected = await rawWrite(
    writerA.token,
    'POST',
    '/capsules',
    { ...input, title: 'Corrected after failure' },
    'correct-after-failure',
  );
  assert.equal(corrected.status, 201);
  assert.equal(corrected.replayed, 'false');

  const sharedKeyA = await rawWrite(
    writerA.token,
    'POST',
    '/capsules',
    { ...input, title: 'Credential A result' },
    'credential-isolation',
  );
  const sharedKeyB = await rawWrite(
    writerB.token,
    'POST',
    '/capsules',
    { ...input, title: 'Credential B result' },
    'credential-isolation',
  );
  assert.equal(sharedKeyA.status, 201);
  assert.equal(sharedKeyB.status, 201);
  assert.notEqual(sharedKeyA.body.id, sharedKeyB.body.id);
  assert.equal(sharedKeyA.replayed, 'false');
  assert.equal(sharedKeyB.replayed, 'false');

  const beforeRevocation = await rawWrite(
    revokedWriter.token,
    'POST',
    '/capsules',
    { ...input, title: 'Result behind revoked credential' },
    'revoked-replay',
  );
  assert.equal(beforeRevocation.status, 201);
  access.revoke(revokedWriter.key.id);
  const deniedReplay = await rawWrite(
    revokedWriter.token,
    'POST',
    '/capsules',
    { ...input, title: 'Result behind revoked credential' },
    'revoked-replay',
  );
  assert.equal(deniedReplay.status, 401);
  assert.equal(deniedReplay.body.code, 'UNAUTHORIZED');

  const sharedCapsule = store.publishCapsule({
    projectId: project.id,
    kind: 'fact',
    title: 'Mount target',
    body: 'Used only to verify DELETE rejection.',
  });
  const mounted = store.mount({ streamId: stream.id, capsuleId: sharedCapsule.id });
  const rejectedDelete = await rawWrite(
    writerA.token,
    'DELETE',
    `/mounts/${mounted.id}`,
    undefined,
    'delete-key',
  );
  assert.equal(rejectedDelete.status, 400);
  assert.equal(rejectedDelete.body.code, 'INVALID_IDEMPOTENCY_INPUT');
  assert.ok(store.listMounts(stream.id).some((candidate) => candidate.id === mounted.id));

  await assert.rejects(
    clientOne.publishCapsule(
      { ...input, title: 'SDK conflict attempt' },
      { idempotencyKey: 'concurrent-write' },
    ),
    (error: unknown) =>
      error instanceof LoomplaneApiError &&
      error.status === 409 &&
      error.code === 'IDEMPOTENCY_CONFLICT',
  );

  console.log(
    'idempotency HTTP smoke passed: concurrency, canonical replay, conflicts, correction, credential isolation, revocation, and DELETE rejection',
  );
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  access.close();
  store.close();
  rmSync(directory, { recursive: true, force: true });
}
