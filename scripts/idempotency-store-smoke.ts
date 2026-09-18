import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store, LoomplaneError } from '../src/core/store.js';

const directory = mkdtempSync(join(tmpdir(), 'loomplane-idempotency-'));
const path = join(directory, 'context.sqlite');
let store = new Store(path);
const code = (expected: string) => (error: unknown) =>
  error instanceof LoomplaneError && error.code === expected;
try {
  assert.equal(typeof store.idempotent, 'function', 'Store exposes durable idempotency');
  const { idempotencyFingerprint } = await import('../src/core/idempotency.js');
  assert.equal(
    idempotencyFingerprint({ b: [1, 2], a: { y: true, x: null } }),
    idempotencyFingerprint({ a: { x: null, y: true }, b: [1, 2] }),
  );
  assert.notEqual(idempotencyFingerprint([1, 2]), idempotencyFingerprint([2, 1]));
  assert.throws(
    () => idempotencyFingerprint({ bad: undefined }),
    code('INVALID_IDEMPOTENCY_INPUT'),
  );
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.throws(() => idempotencyFingerprint(circular), code('INVALID_IDEMPOTENCY_INPUT'));

  const input = {
    scope: 'credential:synthetic',
    key: 'create-project',
    operation: 'POST /api/projects',
    fingerprint: idempotencyFingerprint({ name: 'Retry' }),
  };
  const first = store.idempotent(input, () => store.createProject({ name: 'Retry' }));
  assert.equal(first.replayed, false);
  const project = first.value;
  const events = store.getChangeVersion();
  store.close();
  store = new Store(path);
  assert.deepEqual(
    store.idempotent(input, () => {
      throw new Error('Replay invoked callback');
    }),
    { value: project, replayed: true },
  );
  assert.equal(store.getChangeVersion(), events);
  assert.throws(
    () =>
      store.idempotent(
        { ...input, fingerprint: idempotencyFingerprint({ name: 'Changed' }) },
        () => null,
      ),
    code('IDEMPOTENCY_CONFLICT'),
  );
  assert.throws(
    () => store.idempotent({ ...input, operation: 'PATCH /api/projects' }, () => null),
    code('IDEMPOTENCY_CONFLICT'),
  );
  assert.equal(store.idempotent({ ...input, scope: 'another-credential' }, () => 42).value, 42);
  for (const invalid of [
    { key: '' },
    { key: 'has space' },
    { key: 'trailing-newline\n' },
    { key: 'é' },
    { key: 'x'.repeat(129) },
    { scope: '' },
    { scope: 'x'.repeat(257) },
    { operation: 'x'.repeat(501) },
    { fingerprint: 'nope' },
    { fingerprint: '0'.repeat(64) + '\n' },
  ]) {
    assert.throws(
      () => store.idempotent({ ...input, ...invalid }, () => null),
      code('INVALID_IDEMPOTENCY_INPUT'),
    );
  }

  const failed = { ...input, key: 'failed' };
  assert.throws(
    () =>
      store.idempotent(failed, () => {
        store.createProject({ name: 'Must roll back' });
        throw new Error('Intentional failure');
      }),
    /Intentional failure/,
  );
  assert.equal(store.listProjects().length, 1);
  assert.equal(store.idempotent(failed, () => 'corrected').replayed, false);
  for (const invalidResult of [undefined, 1n, NaN, Promise.resolve('async')]) {
    assert.throws(
      () =>
        store.idempotent({ ...input, key: 'invalid-result' }, () => {
          store.createProject({ name: 'Invalid result rollback' });
          return invalidResult;
        }),
      code('INVALID_IDEMPOTENCY_RESULT'),
    );
  }
  let asyncInvoked = false;
  assert.throws(
    () =>
      store.idempotent({ ...input, key: 'async-function' }, async () => {
        asyncInvoked = true;
        return 1;
      }),
    code('INVALID_IDEMPOTENCY_RESULT'),
  );
  assert.equal(asyncInvoked, false);
  assert.throws(
    () =>
      store.idempotent({ ...input, key: 'oversize' }, () => {
        store.createProject({ name: 'Oversize rollback' });
        return 'x'.repeat(1024 * 1024);
      }),
    code('IDEMPOTENCY_RESULT_TOO_LARGE'),
  );
  assert.equal(store.listProjects().length, 1);

  const fixture = new DatabaseSync(path);
  fixture.exec(
    `CREATE TRIGGER reject_publish BEFORE INSERT ON events WHEN NEW.type='capsule.published' BEGIN SELECT RAISE(ABORT, 'injected event failure'); END;`,
  );
  const capsuleInput = {
    projectId: project.id,
    kind: 'fact' as const,
    title: 'Atomic',
    body: 'No partial capsule',
  };
  store.idempotent({ ...input, key: 'caught-inner-failure' }, () => {
    assert.throws(() => store.publishCapsule(capsuleInput), /injected event failure/);
    return { recovered: true };
  });
  assert.equal(
    store.listCapsules(project.id).length,
    0,
    'savepoint removes inner partial writes even if caller catches',
  );
  assert.equal(store.search(project.id, 'Atomic').length, 0);
  fixture.exec('DROP TRIGGER reject_publish');
  fixture
    .prepare('UPDATE idempotency SET expires_at=0 WHERE scope=? AND key=?')
    .run(input.scope, input.key);
  assert.equal(store.idempotent(input, () => 'after-expiry').replayed, false);
  fixture.exec('BEGIN');
  const insert = fixture.prepare(
    'INSERT INTO idempotency(scope,key,operation,fingerprint,result,created_at,expires_at) VALUES(?,?,?,?,?,?,?)',
  );
  for (let n = 0; n < 10000; n++)
    insert.run(
      'full',
      String(n),
      input.operation,
      input.fingerprint,
      'null',
      Date.now(),
      Date.now() + 86400000,
    );
  fixture.exec('COMMIT');
  assert.throws(
    () =>
      store.idempotent({ ...input, scope: 'full', key: 'overflow' }, () =>
        store.createProject({ name: 'Capacity rollback' }),
      ),
    code('IDEMPOTENCY_CAPACITY'),
  );
  assert.equal(
    store.idempotent({ ...input, scope: 'full', key: '0' }, () => 'not called').replayed,
    true,
  );
  assert.equal(store.listProjects().length, 1);
  assert.ok(
    !('idempotency' in store.exportProject(project.id)),
    'project archives exclude replay credentials and results',
  );
  fixture.close();

  // Two independent processes contend for one key against the same SQLite file.
  const childCode = `
    import { Store } from './src/core/store.ts';
    import { idempotencyFingerprint } from './src/core/idempotency.ts';
    const store = new Store(process.env.TEST_DATABASE);
    const result = store.idempotent({scope:'race',key:'one',operation:'POST /api/capsules',fingerprint:idempotencyFingerprint({})}, () => store.publishCapsule({projectId:process.env.TEST_PROJECT,kind:'fact',title:'Race',body:'One mutation'}));
    console.log(JSON.stringify(result));
    store.close();
  `;
  const runChild = () =>
    new Promise<{ value: { id: string }; replayed: boolean }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', '--input-type=module', '-e', childCode],
        {
          env: { ...process.env, TEST_DATABASE: path, TEST_PROJECT: project.id },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let output = '',
        error = '';
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (error += chunk));
      child.on('error', reject);
      child.on('close', (status) =>
        status === 0 ? resolve(JSON.parse(output)) : reject(new Error(error)),
      );
    });
  const race = await Promise.all([runChild(), runChild()]);
  assert.equal(race[0].value.id, race[1].value.id);
  assert.deepEqual(race.map((r) => r.replayed).sort(), [false, true]);
  assert.equal(store.listCapsules(project.id).length, 1);
  assert.equal(store.events(project.id).filter((e) => e.type === 'capsule.published').length, 1);

  // Remove only the v2 ledger to construct a genuine v1 schema retaining domain history.
  store.close();
  const legacy = new DatabaseSync(path);
  legacy.exec('DROP TABLE idempotency; UPDATE schema_version SET version=1');
  legacy.close();
  store = new Store(path);
  assert.deepEqual(store.getProject(project.id), project);
  assert.equal(store.listCapsules(project.id).length, 1);
  const migrated = new DatabaseSync(path, { readOnly: true });
  assert.equal(migrated.prepare('SELECT version FROM schema_version').get()!.version, 2);
  migrated.close();
  assert.equal(store.idempotent(input, () => 'migrated').replayed, false);
  console.log(
    'PASS: durable replay, canonical bodies, isolation, conflicts, rollback/savepoints, expiry/capacity/size limits, two-process contention and schema v1 migration.',
  );
} finally {
  store.close();
  rmSync(directory, { recursive: true, force: true });
}
