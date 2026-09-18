import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request, type ClientRequest } from 'node:http';
import { Store } from '../src/core/store.js';
import { AccessManager } from '../src/server/access.js';
import { createLoomplaneServer } from '../src/server/index.js';
const directory = mkdtempSync(join(tmpdir(), 'loomplane-access-'));
const path = join(directory, 'db.sqlite');
const store = new Store(path);
const access = new AccessManager(path);
const a = store.createProject({ name: 'A' });
const b = store.createProject({ name: 'B' });
const sa = store.createStream({ projectId: a.id, name: 'A stream' });
const sb = store.createStream({ projectId: b.id, name: 'B stream' });
const cap = store.publishCapsule({
  projectId: b.id,
  streamId: sb.id,
  title: 'Private B context',
  kind: 'fact',
  body: 'B only',
});
const bp = store.compile({ streamId: sb.id });
const reader = access.create(a.id, 'Read A', 'reader');
const writer = access.create(a.id, 'Write A', 'writer');
const server = createLoomplaneServer(store, { access });
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api`;
const call = (path: string, token?: string, method = 'GET', body?: object) =>
  fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
try {
  assert.equal((await call('/auth')).status, 200);
  assert.equal((await call('/projects')).status, 401);
  const projects = await (await call('/projects', reader.token)).json();
  assert.deepEqual(
    projects.map((p: any) => p.id),
    [a.id],
  );
  const snapshot = await (await call('/snapshot', reader.token)).json();
  assert.equal(snapshot.project.id, a.id);
  assert.equal(snapshot.projects.length, 1);
  for (const endpoint of [
    `/snapshot?projectId=${b.id}`,
    `/search?projectId=${b.id}&q=Private`,
    `/export?projectId=${b.id}`,
    `/events?projectId=${b.id}`,
    `/streams/${sb.id}`,
    `/capsules/${cap.id}`,
    `/capsules/${cap.id}/impact`,
    `/packets/${bp.id}`,
    `/packets/${bp.id}/check`,
  ])
    assert.equal((await call(endpoint, reader.token)).status, 404, endpoint);
  assert.equal(
    (
      await call('/capsules', reader.token, 'POST', {
        projectId: a.id,
        title: 'No',
        kind: 'fact',
        body: 'No',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call('/capsules', writer.token, 'POST', {
        projectId: a.id,
        streamId: sa.id,
        title: 'Allowed',
        kind: 'fact',
        body: 'Yes',
      })
    ).status,
    201,
  );
  const ownCapsule = store.listCapsules(a.id)[0];
  for (const streamId of [sb.id, 'str_unknown'])
    assert.equal(
      (
        await call('/capsules', writer.token, 'POST', {
          projectId: a.id,
          streamId,
          title: 'No',
          kind: 'fact',
          body: 'No',
        })
      ).status,
      404,
    );
  for (const capsuleId of [cap.id, 'cap_unknown']) {
    const dependencies = [{ capsuleId, version: 1 }];
    assert.equal(
      (
        await call('/capsules', writer.token, 'POST', {
          projectId: a.id,
          title: 'No',
          kind: 'fact',
          body: 'No',
          dependencies,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await call(`/capsules/${ownCapsule.id}`, writer.token, 'PATCH', {
          expectedVersion: 1,
          dependencies,
        })
      ).status,
      404,
    );
  }
  assert.equal(
    (
      await call('/capsules', writer.token, 'POST', {
        projectId: a.id,
        title: 'Invalid',
        kind: 'fact',
        body: 'Invalid',
        dependencies: [null],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(`/capsules/${ownCapsule.id}`, writer.token, 'PATCH', {
        expectedVersion: 1,
        dependencies: [{ capsuleId: ownCapsule.id, version: 'invalid' }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(`/capsules/${ownCapsule.id}`, reader.token, 'PATCH', {
        expectedVersion: 1,
        body: 'No',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call('/capsules', writer.token, 'POST', {
        projectId: b.id,
        title: 'No',
        kind: 'fact',
        body: 'No',
      })
    ).status,
    404,
  );
  assert.equal(
    (await call('/mounts', writer.token, 'POST', { streamId: sa.id, capsuleId: cap.id })).status,
    404,
  );
  assert.equal((await call('/compile', writer.token, 'POST', { streamId: sb.id })).status, 404);
  assert.equal(
    (await call('/receipts', writer.token, 'POST', { packetId: bp.id, agent: 'No' })).status,
    404,
  );
  assert.equal((await call('/projects', writer.token, 'POST', { name: 'No' })).status, 403);
  assert.equal((await call('/demo', writer.token, 'POST', {})).status, 403);
  // The server receives authorization and a partial body before revocation, then must reject the write.
  const delayedKey = access.create(a.id, 'Delayed writer', 'writer');
  const priorVersion = store.getChangeVersion();
  const accepted = new Promise<void>((resolve) => server.once('request', () => resolve()));
  let delayed!: ClientRequest;
  const delayedResult = new Promise<number>((resolve, reject) => {
    delayed = request(
      base + '/capsules',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${delayedKey.token}`,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode!));
      },
    );
    delayed.on('error', reject);
  });
  delayed.write('{"projectId":');
  await accepted;
  access.revoke(delayedKey.key.id);
  delayed.end(
    JSON.stringify(a.id) + ',"kind":"fact","title":"Revoked write","body":"Must not persist"}',
  );
  assert.equal(await delayedResult, 401);
  assert.equal(store.getChangeVersion(), priorVersion);
  const controller = new AbortController();
  const events = await fetch(base + '/changes', {
    headers: { Authorization: `Bearer ${reader.token}` },
    signal: controller.signal,
  });
  const stream = events.body!.getReader();
  await stream.read();
  let buffered = '';
  async function nextChange(): Promise<string | null> {
    while (true) {
      const boundary = buffered.indexOf('\n\n');
      if (boundary >= 0) {
        const frame = buffered.slice(0, boundary);
        buffered = buffered.slice(boundary + 2);
        if (frame.startsWith('event: change')) return frame;
        continue;
      }
      const chunk = await stream.read();
      if (chunk.done) return null;
      buffered += new TextDecoder().decode(chunk.value);
    }
  }
  store.publishCapsule({
    projectId: b.id,
    kind: 'fact',
    title: 'Private B update',
    body: 'No event for A',
  });
  const eventRead = nextChange();
  const isolated = await Promise.race([
    eventRead.then(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 950)),
  ]);
  assert.equal(isolated, true, 'Other project events must not leak');
  store.publishCapsule({ projectId: a.id, kind: 'fact', title: 'A update', body: 'Visible event' });
  assert.match((await eventRead) ?? '', /event: change/);
  access.revoke(reader.key.id);
  assert.equal((await call('/projects', reader.token)).status, 401);
  assert.equal(await nextChange(), null, 'Revocation closes event stream');
  controller.abort();
  assert.equal(
    access.list(a.id).some((k) => 'token' in k),
    false,
  );
  console.log(
    'PASS: scoped reader/writer keys, filtered snapshots, cross-project route denial, privileged-operation denial, project-specific SSE and live revocation.',
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  access.close();
  store.close();
  rmSync(directory, { recursive: true, force: true });
}
