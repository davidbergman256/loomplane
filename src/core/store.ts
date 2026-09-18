import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { compileContext, detectConflicts } from './compiler.js';
import { invariant, requiredText, LoomplaneError } from './errors.js';
import { validatePortableProject } from './portable.js';
import { comparePacketSnapshots } from './packet-diff.js';
import { serializeIdempotencyResult } from './idempotency.js';
import type {
  AuditEvent,
  Capsule,
  CapsuleKind,
  CapsuleStatus,
  CompileInput,
  CreateProject,
  CreateStream,
  Drift,
  Evidence,
  Mount,
  MountInput,
  Packet,
  PacketPage,
  PacketDiff,
  Project,
  PublishCapsule,
  Revision,
  ReviseCapsule,
  SearchHit,
  Snapshot,
  Stream,
  StreamState,
  Receipt,
  PacketCheck,
  ContextDependency,
  Impact,
} from './types.js';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
const kinds: CapsuleKind[] = ['decision', 'fact', 'constraint', 'question', 'artifact'];
const statuses: CapsuleStatus[] = ['active', 'superseded', 'retracted'];
const json = JSON.stringify;
const parse = <T>(row: unknown): T => JSON.parse((row as { data: string }).data) as T;
function optionalText(value: unknown, field: string, max = 500, fallback = ''): string {
  if (value === undefined) return fallback;
  invariant(
    typeof value === 'string' && value.length <= max,
    `${field} must be text up to ${max} characters`,
  );
  return value.trim();
}
function tags(value: unknown): string[] {
  if (value === undefined) return [];
  invariant(
    Array.isArray(value) && value.length <= 30,
    'tags must be an array of at most 30 strings',
  );
  return [...new Set(value.map((v) => requiredText(v, 'tag', 100)))];
}
function evidence(value: unknown): Evidence[] {
  if (value === undefined) return [];
  invariant(
    Array.isArray(value) && value.length <= 50,
    'evidence must be an array of at most 50 references',
  );
  return value.map((v) => {
    invariant(v && typeof v === 'object', 'Invalid evidence reference');
    const uri = requiredText(v.uri, 'evidence uri', 4000);
    invariant(!/^(javascript|data|vbscript):/i.test(uri), 'Unsafe evidence URI');
    let fingerprint;
    if (v.fingerprint !== undefined) {
      const f = v.fingerprint;
      invariant(f && typeof f === 'object', 'Invalid fingerprint');
      const path = requiredText(f.path, 'fingerprint path', 2000);
      invariant(
        !path.startsWith('/') &&
          !path.startsWith('\\') &&
          !/^[a-z]:/i.test(path) &&
          !path.split(/[\\/]/).includes('..'),
        'Fingerprint path must be relative without traversal',
      );
      invariant(
        typeof f.sha256 === 'string' && /^[0-9a-f]{64}$/.test(f.sha256),
        'Invalid SHA-256 fingerprint',
      );
      invariant(
        Number.isSafeInteger(f.bytes) && f.bytes >= 0 && f.bytes <= 10 * 1024 * 1024,
        'Invalid fingerprint byte count',
      );
      if (f.gitCommit !== undefined)
        invariant(
          typeof f.gitCommit === 'string' && /^[0-9a-f]{40,64}$/.test(f.gitCommit),
          'Invalid fingerprint Git commit',
        );
      fingerprint = {
        path,
        sha256: f.sha256,
        bytes: f.bytes,
        ...(f.gitCommit ? { gitCommit: f.gitCommit } : {}),
      };
    }
    return {
      label: requiredText(v.label, 'evidence label', 300),
      uri,
      ...(fingerprint ? { fingerprint } : {}),
      ...(v.excerpt === undefined ? {} : { excerpt: optionalText(v.excerpt, 'excerpt', 4000) }),
    };
  });
}
function priority(value: unknown): number {
  if (value === undefined) return 50;
  invariant(
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100,
    'priority must be an integer from 0 to 100',
  );
  return value;
}

export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    try {
      // Inspect an existing version before journal-mode changes or schema initialization.
      if (this.db.prepare("SELECT 1 FROM sqlite_schema WHERE name='schema_version'").get()) {
        const versions = this.db.prepare('SELECT version FROM schema_version').all();
        invariant(
          versions.length === 1 && (versions[0].version === 1 || versions[0].version === 2),
          'Unsupported database schema version',
          500,
          'SCHEMA_VERSION',
        );
      }
      this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;`);
      this.transaction(() => {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version(version INTEGER NOT NULL);
      INSERT INTO schema_version SELECT 2 WHERE NOT EXISTS(SELECT 1 FROM schema_version);
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS streams(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS streams_project ON streams(project_id);
      CREATE TABLE IF NOT EXISTS capsules(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), stream_id TEXT REFERENCES streams(id), data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS capsules_project ON capsules(project_id);
      CREATE INDEX IF NOT EXISTS capsules_stream ON capsules(stream_id);
      CREATE TABLE IF NOT EXISTS revisions(capsule_id TEXT NOT NULL REFERENCES capsules(id), version INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(capsule_id,version));
      CREATE TABLE IF NOT EXISTS mounts(id TEXT PRIMARY KEY, stream_id TEXT NOT NULL REFERENCES streams(id), capsule_id TEXT NOT NULL REFERENCES capsules(id), data TEXT NOT NULL, UNIQUE(stream_id,capsule_id));
      CREATE TABLE IF NOT EXISTS packets(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), stream_id TEXT NOT NULL REFERENCES streams(id), created_at TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS packets_stream ON packets(stream_id,created_at);
      CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), packet_id TEXT NOT NULL REFERENCES packets(id), data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS receipts_project ON receipts(project_id);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL REFERENCES projects(id), type TEXT NOT NULL, entity_id TEXT NOT NULL, actor TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_project ON events(project_id,id);
      CREATE VIRTUAL TABLE IF NOT EXISTS capsule_search USING fts5(capsule_id UNINDEXED, project_id UNINDEXED, title, body, tags, tokenize='unicode61');
      CREATE TABLE IF NOT EXISTS idempotency(scope TEXT NOT NULL, key TEXT NOT NULL, operation TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(scope,key));
      CREATE INDEX IF NOT EXISTS idempotency_expiry ON idempotency(expires_at);
    `);
        const versions = this.db.prepare('SELECT version FROM schema_version').all();
        invariant(
          versions.length === 1 && (versions[0].version === 1 || versions[0].version === 2),
          'Unsupported database schema version',
          500,
          'SCHEMA_VERSION',
        );
        this.db.exec('UPDATE schema_version SET version=2 WHERE version=1');
      });
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  close(): void {
    this.db.close();
  }
  getChangeVersion(): number {
    return Number(
      (this.db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM events').get() as { id: number }).id,
    );
  }
  private transaction<T>(fn: () => T): T {
    const savepoint = this.db.isTransaction ? id('savepoint') : null;
    this.db.exec(savepoint ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec(savepoint ? `RELEASE SAVEPOINT ${savepoint}` : 'COMMIT');
      return result;
    } catch (error) {
      if (savepoint) {
        this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
      } else this.db.exec('ROLLBACK');
      throw error;
    }
  }
  idempotent<T>(
    input: { scope: string; key: string; operation: string; fingerprint: string },
    callback: () => T,
  ): { value: T; replayed: boolean } {
    invariant(
      input &&
        typeof input.scope === 'string' &&
        input.scope.trim().length > 0 &&
        input.scope.length <= 256 &&
        typeof input.key === 'string' &&
        input.key.length >= 1 &&
        input.key.length <= 128 &&
        !/[^A-Za-z0-9._:-]/.test(input.key) &&
        typeof input.operation === 'string' &&
        input.operation.trim().length > 0 &&
        input.operation.length <= 500 &&
        typeof input.fingerprint === 'string' &&
        input.fingerprint.length === 64 &&
        /^[0-9a-f]{64}$/i.test(input.fingerprint) &&
        typeof callback === 'function',
      'Invalid idempotency scope, key, operation or fingerprint',
      400,
      'INVALID_IDEMPOTENCY_INPUT',
    );
    invariant(
      Object.prototype.toString.call(callback) !== '[object AsyncFunction]',
      'Idempotency callbacks must be synchronous',
      400,
      'INVALID_IDEMPOTENCY_RESULT',
    );
    const { scope, key, operation } = input;
    const fingerprint = input.fingerprint.toLowerCase();
    return this.transaction(() => {
      const timestamp = Date.now();
      this.db.prepare('DELETE FROM idempotency WHERE expires_at<=?').run(timestamp);
      const existing = this.db
        .prepare('SELECT operation,fingerprint,result FROM idempotency WHERE scope=? AND key=?')
        .get(scope, key);
      if (existing) {
        invariant(
          existing.operation === operation && existing.fingerprint === fingerprint,
          'Idempotency key was already used for a different operation or body',
          409,
          'IDEMPOTENCY_CONFLICT',
        );
        return { value: JSON.parse(String(existing.result)) as T, replayed: true };
      }
      const checkCapacity = () =>
        invariant(
          Number(
            this.db.prepare('SELECT COUNT(*) AS n FROM idempotency WHERE scope=?').get(scope)!.n,
          ) < 10000,
          'Idempotency scope has reached its 10000-record limit',
          429,
          'IDEMPOTENCY_CAPACITY',
        );
      checkCapacity();
      const value = callback();
      const serialized = serializeIdempotencyResult(value);
      // A nested idempotent call may have consumed the final available slot.
      checkCapacity();
      const createdAt = Date.now();
      this.db
        .prepare(
          'INSERT INTO idempotency(scope,key,operation,fingerprint,result,created_at,expires_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          scope,
          key,
          operation,
          fingerprint,
          serialized,
          createdAt,
          createdAt + 24 * 60 * 60 * 1000,
        );
      // Return the JSON representation on first execution too, matching historical replays.
      return { value: JSON.parse(serialized) as T, replayed: false };
    });
  }
  private readSnapshot<T>(fn: () => T): T {
    // Composite reads share their caller's snapshot, including an active write transaction.
    if (this.db.isTransaction) return fn();
    // Deferred BEGIN establishes its snapshot on the first SELECT without reserving a writer.
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  private event(
    projectId: string,
    type: string,
    entityId: string,
    actor: string,
    data: Record<string, unknown> = {},
  ): void {
    this.db
      .prepare(
        'INSERT INTO events(project_id,type,entity_id,actor,data,created_at) VALUES(?,?,?,?,?,?)',
      )
      .run(projectId, type, entityId, actor, json(data), now());
  }
  private touchStream(streamId: string | null): void {
    if (!streamId) return;
    const stream = this.getStream(streamId);
    stream.updatedAt = now();
    this.db.prepare('UPDATE streams SET data=? WHERE id=?').run(json(stream), streamId);
  }
  private index(capsule: Capsule): void {
    this.db.prepare('DELETE FROM capsule_search WHERE capsule_id=?').run(capsule.id);
    if (capsule.status === 'active')
      this.db
        .prepare(
          'INSERT INTO capsule_search(capsule_id,project_id,title,body,tags) VALUES(?,?,?,?,?)',
        )
        .run(capsule.id, capsule.projectId, capsule.title, capsule.body, capsule.tags.join(' '));
  }
  private validateDependencies(
    projectId: string,
    value: unknown,
    ownerId?: string,
  ): ContextDependency[] {
    if (value === undefined) return [];
    invariant(
      Array.isArray(value) && value.length <= 50,
      'dependencies must be an array of at most 50 revision references',
    );
    const dependencies: ContextDependency[] = value.map((d) => {
      invariant(d && typeof d === 'object', 'Invalid context dependency');
      const capsule = this.getCapsule(requiredText(d.capsuleId, 'dependency capsuleId'));
      invariant(
        capsule.projectId === projectId,
        'Dependencies must belong to the same project',
        400,
        'PROJECT_MISMATCH',
      );
      invariant(
        Number.isInteger(d.version) && d.version > 0,
        'Dependency version must be a positive integer',
      );
      this.revision(capsule.id, d.version);
      return { capsuleId: capsule.id, version: d.version };
    });
    invariant(
      new Set(dependencies.map((d) => d.capsuleId)).size === dependencies.length,
      'Duplicate dependency',
    );
    if (ownerId) {
      const seen = new Set<string>();
      const reaches = (capsuleId: string): boolean => {
        if (capsuleId === ownerId) return true;
        if (seen.has(capsuleId)) return false;
        seen.add(capsuleId);
        return (this.getCapsule(capsuleId).dependencies ?? []).some((d) => reaches(d.capsuleId));
      };
      invariant(
        !dependencies.some((d) => reaches(d.capsuleId)),
        'Context dependencies cannot form a cycle',
        409,
        'DEPENDENCY_CYCLE',
      );
    }
    return dependencies;
  }
  private dependencyDrift(capsule: Capsule, revision: Revision): Drift[] {
    const result: Drift[] = [];
    const seen = new Set<string>();
    const visit = (current: Revision) => {
      for (const dep of current.dependencies ?? []) {
        const key = `${dep.capsuleId}@${dep.version}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const source = this.getCapsule(dep.capsuleId);
        if (source.version !== dep.version || source.status !== 'active')
          result.push({
            capsuleId: capsule.id,
            title: capsule.title,
            compiledVersion: revision.version,
            currentVersion: capsule.version,
            reason: 'dependency',
            pinned: false,
            dependency: {
              capsuleId: source.id,
              title: source.title,
              expectedVersion: dep.version,
              currentVersion: source.version,
              status: source.status,
            },
          });
        visit(this.revision(dep.capsuleId, dep.version));
      }
    };
    visit(revision);
    return result;
  }
  private writeRevision(capsule: Capsule, changeNote: string): void {
    const revision: Revision = {
      capsuleId: capsule.id,
      version: capsule.version,
      title: capsule.title,
      body: capsule.body,
      author: capsule.author,
      tags: capsule.tags,
      evidence: capsule.evidence,
      priority: capsule.priority,
      createdAt: capsule.updatedAt,
      changeNote,
      dependencies: capsule.dependencies ?? [],
    };
    this.db
      .prepare('INSERT INTO revisions(capsule_id,version,data) VALUES(?,?,?)')
      .run(capsule.id, capsule.version, json({ ...revision, status: capsule.status }));
  }
  listProjects(): Project[] {
    return this.db
      .prepare('SELECT data FROM projects ORDER BY rowid')
      .all()
      .map(parse<Project>);
  }
  getProject(projectId: string): Project {
    requiredText(projectId, 'projectId');
    const row = this.db.prepare('SELECT data FROM projects WHERE id=?').get(projectId);
    invariant(row, 'Project not found', 404, 'NOT_FOUND');
    return parse<Project>(row);
  }
  createProject(input: CreateProject): Project {
    const project: Project = {
      id: id('prj'),
      name: requiredText(input.name, 'name', 120),
      description: optionalText(input.description, 'description', 3000),
      createdAt: now(),
    };
    return this.transaction(() => {
      this.db.prepare('INSERT INTO projects(id,data) VALUES(?,?)').run(project.id, json(project));
      this.event(project.id, 'project.created', project.id, 'local', { name: project.name });
      return project;
    });
  }
  getStream(streamId: string): Stream {
    requiredText(streamId, 'streamId');
    const row = this.db.prepare('SELECT data FROM streams WHERE id=?').get(streamId);
    invariant(row, 'Stream not found', 404, 'NOT_FOUND');
    return parse<Stream>(row);
  }
  listStreams(projectId: string): Stream[] {
    return this.readSnapshot(() => {
      this.getProject(projectId);
      return this.db
        .prepare('SELECT data FROM streams WHERE project_id=? ORDER BY rowid')
        .all(projectId)
        .map(parse<Stream>);
    });
  }
  createStream(input: CreateStream): Stream {
    this.getProject(requiredText(input.projectId, 'projectId'));
    const timestamp = now();
    const color = optionalText(input.color, 'color', 20, '#5476d4');
    invariant(/^#[0-9a-f]{6}$/i.test(color), 'color must be a six-digit hex color');
    const stream: Stream = {
      id: id('str'),
      projectId: input.projectId,
      name: requiredText(input.name, 'name', 120),
      description: optionalText(input.description, 'description', 3000),
      agent: optionalText(input.agent, 'agent', 120, 'Human'),
      branch: optionalText(input.branch, 'branch', 300),
      color,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return this.transaction(() => {
      this.db
        .prepare('INSERT INTO streams(id,project_id,data) VALUES(?,?,?)')
        .run(stream.id, stream.projectId, json(stream));
      this.event(stream.projectId, 'stream.created', stream.id, stream.agent, {
        name: stream.name,
      });
      return stream;
    });
  }
  updateStream(
    streamId: string,
    patch: Partial<Pick<Stream, 'name' | 'description' | 'agent' | 'branch' | 'color'>>,
  ): Stream {
    return this.transaction(() => {
      const stream = this.getStream(streamId);
      if (patch.name !== undefined) stream.name = requiredText(patch.name, 'name', 120);
      for (const field of ['description', 'agent', 'branch'] as const)
        if (patch[field] !== undefined)
          stream[field] = optionalText(patch[field], field, field === 'description' ? 3000 : 300);
      if (patch.color !== undefined) {
        invariant(/^#[0-9a-f]{6}$/i.test(patch.color), 'color must be a six-digit hex color');
        stream.color = patch.color;
      }
      stream.updatedAt = now();
      this.db.prepare('UPDATE streams SET data=? WHERE id=?').run(json(stream), stream.id);
      this.event(stream.projectId, 'stream.updated', stream.id, 'local');
      return stream;
    });
  }
  getCapsule(capsuleId: string): Capsule {
    requiredText(capsuleId, 'capsuleId');
    const row = this.db.prepare('SELECT data FROM capsules WHERE id=?').get(capsuleId);
    invariant(row, 'Capsule not found', 404, 'NOT_FOUND');
    return parse<Capsule>(row);
  }
  listCapsules(projectId: string): Capsule[] {
    return this.readSnapshot(() => {
      this.getProject(projectId);
      return this.db
        .prepare('SELECT data FROM capsules WHERE project_id=? ORDER BY rowid DESC')
        .all(projectId)
        .map(parse<Capsule>);
    });
  }
  publishCapsule(input: PublishCapsule): Capsule {
    this.getProject(requiredText(input.projectId, 'projectId'));
    if (input.streamId)
      invariant(
        this.getStream(input.streamId).projectId === input.projectId,
        'Stream belongs to a different project',
        400,
        'PROJECT_MISMATCH',
      );
    invariant(kinds.includes(input.kind), 'Invalid capsule kind');
    const timestamp = now();
    const capsule: Capsule = {
      id: id('cap'),
      projectId: input.projectId,
      streamId: input.streamId || null,
      key: optionalText(input.key, 'key', 200),
      kind: input.kind,
      status: 'active',
      title: requiredText(input.title, 'title', 240),
      body: requiredText(input.body, 'body', 100000),
      version: 1,
      author: optionalText(input.author, 'author', 120, 'local'),
      tags: tags(input.tags),
      evidence: evidence(input.evidence),
      priority: priority(input.priority),
      dependencies: this.validateDependencies(input.projectId, input.dependencies),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return this.transaction(() => {
      this.db
        .prepare('INSERT INTO capsules(id,project_id,stream_id,data) VALUES(?,?,?,?)')
        .run(capsule.id, capsule.projectId, capsule.streamId, json(capsule));
      this.writeRevision(capsule, 'Published');
      this.index(capsule);
      this.touchStream(capsule.streamId);
      this.event(capsule.projectId, 'capsule.published', capsule.id, capsule.author, {
        title: capsule.title,
        version: 1,
      });
      return capsule;
    });
  }
  reviseCapsule(capsuleId: string, patch: ReviseCapsule): Capsule {
    return this.transaction(() => {
      const capsule = this.getCapsule(capsuleId);
      invariant(Number.isInteger(patch.expectedVersion), 'expectedVersion is required');
      invariant(
        capsule.version === patch.expectedVersion,
        `This capsule changed: expected v${patch.expectedVersion}, current v${capsule.version}. Reload before saving.`,
        409,
        'VERSION_CONFLICT',
      );
      if (patch.title !== undefined) capsule.title = requiredText(patch.title, 'title', 240);
      if (patch.body !== undefined) capsule.body = requiredText(patch.body, 'body', 100000);
      if (patch.author !== undefined) capsule.author = optionalText(patch.author, 'author', 120);
      if (patch.tags !== undefined) capsule.tags = tags(patch.tags);
      if (patch.evidence !== undefined) capsule.evidence = evidence(patch.evidence);
      if (patch.priority !== undefined) capsule.priority = priority(patch.priority);
      if (patch.dependencies !== undefined)
        capsule.dependencies = this.validateDependencies(
          capsule.projectId,
          patch.dependencies,
          capsule.id,
        );
      capsule.version++;
      capsule.updatedAt = now();
      const note = optionalText(patch.changeNote, 'changeNote', 3000, 'Updated context');
      this.db.prepare('UPDATE capsules SET data=? WHERE id=?').run(json(capsule), capsule.id);
      this.writeRevision(capsule, note);
      this.index(capsule);
      this.touchStream(capsule.streamId);
      this.event(capsule.projectId, 'capsule.revised', capsule.id, capsule.author, {
        title: capsule.title,
        version: capsule.version,
        changeNote: note,
      });
      return capsule;
    });
  }
  getRevisions(capsuleId: string): Revision[] {
    return this.readSnapshot(() => {
      this.getCapsule(capsuleId);
      return this.db
        .prepare('SELECT data FROM revisions WHERE capsule_id=? ORDER BY version DESC')
        .all(capsuleId)
        .map(parse<Revision>);
    });
  }
  private revision(capsuleId: string, version: number): Revision {
    const row = this.db
      .prepare('SELECT data FROM revisions WHERE capsule_id=? AND version=?')
      .get(capsuleId, version);
    invariant(row, `Revision ${version} not found`, 404, 'NOT_FOUND');
    return parse<Revision>(row);
  }
  setCapsuleStatus(
    capsuleId: string,
    status: CapsuleStatus,
    expectedVersion: number,
    author = 'local',
  ): Capsule {
    invariant(statuses.includes(status), 'Invalid capsule status');
    return this.transaction(() => {
      const capsule = this.getCapsule(capsuleId);
      invariant(Number.isInteger(expectedVersion), 'expectedVersion is required');
      invariant(
        capsule.version === expectedVersion,
        'Capsule changed; reload before saving.',
        409,
        'VERSION_CONFLICT',
      );
      capsule.status = status;
      capsule.version++;
      capsule.updatedAt = now();
      capsule.author = optionalText(author, 'author', 120, 'local');
      this.db.prepare('UPDATE capsules SET data=? WHERE id=?').run(json(capsule), capsule.id);
      this.writeRevision(capsule, `Status changed to ${status}`);
      this.index(capsule);
      this.event(capsule.projectId, 'capsule.status_changed', capsule.id, capsule.author, {
        status,
        version: capsule.version,
      });
      return capsule;
    });
  }
  listMounts(streamId: string): Mount[] {
    return this.readSnapshot(() => {
      this.getStream(streamId);
      return this.db
        .prepare('SELECT data FROM mounts WHERE stream_id=? ORDER BY rowid')
        .all(streamId)
        .map(parse<Mount>);
    });
  }
  mount(input: MountInput): Mount {
    return this.transaction(() => {
      const stream = this.getStream(input.streamId);
      const capsule = this.getCapsule(input.capsuleId);
      invariant(
        stream.projectId === capsule.projectId,
        'Cannot mount context from a different project',
        400,
        'PROJECT_MISMATCH',
      );
      invariant(capsule.streamId !== stream.id, 'This stream already owns the capsule');
      const mode = input.mode ?? 'live';
      invariant(mode === 'live' || mode === 'pinned', 'Invalid mount mode');
      const version = mode === 'pinned' ? (input.pinnedVersion ?? capsule.version) : null;
      if (version !== null) {
        invariant(Number.isInteger(version) && version > 0, 'Invalid pinned version');
        this.revision(capsule.id, version);
      }
      const existing = this.db
        .prepare('SELECT data FROM mounts WHERE stream_id=? AND capsule_id=?')
        .get(stream.id, capsule.id);
      const mount: Mount = {
        id: existing ? parse<Mount>(existing).id : id('mnt'),
        streamId: stream.id,
        capsuleId: capsule.id,
        mode,
        pinnedVersion: version,
        createdAt: existing ? parse<Mount>(existing).createdAt : now(),
      };
      this.db
        .prepare(
          'INSERT INTO mounts(id,stream_id,capsule_id,data) VALUES(?,?,?,?) ON CONFLICT(stream_id,capsule_id) DO UPDATE SET data=excluded.data',
        )
        .run(mount.id, stream.id, capsule.id, json(mount));
      this.touchStream(stream.id);
      this.event(stream.projectId, 'context.mounted', mount.id, stream.agent, {
        capsuleId: capsule.id,
        streamId: stream.id,
        mode,
        version,
      });
      return mount;
    });
  }
  unmount(mountId: string): void {
    this.transaction(() => {
      const row = this.db.prepare('SELECT data FROM mounts WHERE id=?').get(mountId);
      invariant(row, 'Mount not found', 404, 'NOT_FOUND');
      const mount = parse<Mount>(row);
      const stream = this.getStream(mount.streamId);
      this.db.prepare('DELETE FROM mounts WHERE id=?').run(mountId);
      this.touchStream(stream.id);
      this.event(stream.projectId, 'context.unmounted', mountId, stream.agent, {
        capsuleId: mount.capsuleId,
        streamId: stream.id,
      });
    });
  }
  private candidates(streamId: string) {
    const owned = this.db
      .prepare('SELECT data FROM capsules WHERE stream_id=? ORDER BY id')
      .all(streamId)
      .map(parse<Capsule>);
    return [
      ...owned.map((capsule) => ({
        capsule,
        revision: this.revision(capsule.id, capsule.version),
        mode: 'owned' as const,
      })),
      ...this.listMounts(streamId).map((m) => {
        const capsule = this.getCapsule(m.capsuleId);
        return {
          capsule,
          revision: this.revision(capsule.id, m.pinnedVersion ?? capsule.version),
          mode: m.mode,
        };
      }),
    ];
  }
  compile(input: CompileInput): Packet {
    return this.transaction(() => {
      const stream = this.getStream(input.streamId);
      const task = optionalText(input.task, 'task', 4000);
      const budget = input.budget ?? 4000;
      const compiled = compileContext(stream, this.candidates(stream.id), task, budget);
      const packet: Packet = {
        id: id('pkt'),
        projectId: stream.projectId,
        streamId: stream.id,
        task,
        budget,
        ...compiled,
        createdAt: now(),
      };
      this.db
        .prepare('INSERT INTO packets(id,project_id,stream_id,created_at,data) VALUES(?,?,?,?,?)')
        .run(packet.id, packet.projectId, packet.streamId, packet.createdAt, json(packet));
      this.event(stream.projectId, 'packet.compiled', packet.id, stream.agent, {
        streamId: stream.id,
        capsules: packet.manifest.length,
        estimatedTokens: packet.estimatedTokens,
        budget,
      });
      return packet;
    });
  }
  getPacket(packetId: string): Packet {
    requiredText(packetId, 'packetId');
    const row = this.db.prepare('SELECT data FROM packets WHERE id=?').get(packetId);
    invariant(row, 'Packet not found', 404, 'NOT_FOUND');
    return parse<Packet>(row);
  }
  comparePackets(fromId: string, toId: string): PacketDiff {
    return this.readSnapshot(() => {
      return comparePacketSnapshots(
        this.getPacket(fromId),
        this.getPacket(toId),
        (capsuleId, version) => this.revision(capsuleId, version),
      );
    });
  }
  getLatestPacket(streamId: string): Packet | null {
    return this.readSnapshot(() => {
      this.getStream(streamId);
      const row = this.db
        .prepare('SELECT data FROM packets WHERE stream_id=? ORDER BY rowid DESC LIMIT 1')
        .get(streamId);
      return row ? parse<Packet>(row) : null;
    });
  }
  listPackets(streamId: string, options: { before?: string; limit?: number } = {}): PacketPage {
    return this.readSnapshot(() => {
      this.getStream(streamId);
      const limit = options.limit ?? 10;
      invariant(
        Number.isInteger(limit) && limit >= 1 && limit <= 50,
        'Packet limit must be from 1 to 50',
      );
      let before: number | null = null;
      if (options.before !== undefined) {
        requiredText(options.before, 'before');
        const cursor = this.db
          .prepare('SELECT rowid FROM packets WHERE id=? AND stream_id=?')
          .get(options.before, streamId);
        invariant(cursor, 'Packet cursor not found in this stream', 404, 'NOT_FOUND');
        before = Number(cursor.rowid);
      }
      const rows =
        before === null
          ? this.db
              .prepare('SELECT data FROM packets WHERE stream_id=? ORDER BY rowid DESC LIMIT ?')
              .all(streamId, limit + 1)
          : this.db
              .prepare(
                'SELECT data FROM packets WHERE stream_id=? AND rowid<? ORDER BY rowid DESC LIMIT ?',
              )
              .all(streamId, before, limit + 1);
      const items = rows.slice(0, limit).map((row) => {
        const p = parse<Packet>(row);
        return {
          id: p.id,
          projectId: p.projectId,
          streamId: p.streamId,
          task: p.task,
          budget: p.budget,
          estimatedTokens: p.estimatedTokens,
          createdAt: p.createdAt,
          capsuleCount: p.manifest.length,
          omittedCount: p.omitted.length,
          conflictCount: p.conflicts.length,
        };
      });
      return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
    });
  }
  private packetDrift(packet: Packet): Drift[] {
    const candidates = this.candidates(packet.streamId);
    const drift: Drift[] = [];
    const current = new Map(candidates.map((c) => [c.capsule.id, c]));
    for (const item of packet.manifest) {
      const c = current.get(item.capsuleId);
      if (!c) {
        const capsule = this.getCapsule(item.capsuleId);
        drift.push({
          capsuleId: item.capsuleId,
          title: item.title,
          compiledVersion: item.version,
          currentVersion: capsule.version,
          reason: 'unmounted',
          pinned: false,
        });
        continue;
      }
      if (c.capsule.status !== 'active')
        drift.push({
          capsuleId: item.capsuleId,
          title: c.capsule.title,
          compiledVersion: item.version,
          currentVersion: c.capsule.version,
          reason: c.capsule.status,
          pinned: false,
        });
      else if (c.revision.version !== item.version || c.capsule.version !== item.version)
        drift.push({
          capsuleId: item.capsuleId,
          title: c.capsule.title,
          compiledVersion: item.version,
          currentVersion: c.capsule.version,
          reason: 'revised',
          pinned:
            item.mode === 'pinned' && c.mode === 'pinned' && c.revision.version === item.version,
        });
    }
    // Budget omissions were active when compiled; inactive omissions becoming active are new context.
    const prior = new Set(
      [...packet.manifest, ...packet.omitted.filter((c) => c.reason === 'budget')].map(
        (c) => c.capsuleId,
      ),
    );
    for (const c of candidates)
      if (c.capsule.status === 'active' && !prior.has(c.capsule.id))
        drift.push({
          capsuleId: c.capsule.id,
          title: c.capsule.title,
          compiledVersion: 0,
          currentVersion: c.revision.version,
          reason: 'added',
          pinned: false,
        });
    for (const item of packet.manifest) {
      const capsule = this.getCapsule(item.capsuleId);
      drift.push(...this.dependencyDrift(capsule, this.revision(item.capsuleId, item.version)));
    }
    return drift;
  }
  checkPacket(packetId: string): PacketCheck {
    return this.readSnapshot(() => {
      const packet = this.getPacket(packetId);
      const changes = this.packetDrift(packet);
      const conflicts = detectConflicts(
        this.candidates(packet.streamId).map((c) => ({ ...c.capsule, body: c.revision.body })),
      );
      const drift = changes.filter((d) => !d.pinned);
      return {
        ok: drift.length === 0 && conflicts.length === 0 && packet.conflicts.length === 0,
        packetId,
        drift,
        conflicts: [
          ...packet.conflicts,
          ...conflicts.filter((c) => !packet.conflicts.some((p) => p.key === c.key)),
        ],
        pinnedUpdates: changes.filter((d) => d.pinned),
        checkedAt: now(),
      };
    });
  }
  getStreamState(streamId: string): StreamState {
    return this.readSnapshot(() => {
      const stream = this.getStream(streamId);
      const candidates = this.candidates(streamId);
      const latestPacket = this.getLatestPacket(streamId);
      return {
        stream,
        owned: candidates.filter((c) => c.mode === 'owned').map((c) => c.capsule),
        mounts: this.listMounts(streamId).map((m) => ({
          ...m,
          capsule: this.getCapsule(m.capsuleId),
        })),
        latestPacket,
        drift: latestPacket ? this.packetDrift(latestPacket) : [],
        conflicts: detectConflicts(
          candidates.map((c) => ({ ...c.capsule, body: c.revision.body })),
        ),
      };
    });
  }
  startReceipt(packetId: string, agent: string): Receipt {
    return this.transaction(() => {
      const packet = this.getPacket(packetId);
      const check = this.checkPacket(packetId);
      invariant(
        check.ok,
        'Context is stale or conflicted. Refresh before starting work.',
        409,
        'STALE_CONTEXT',
      );
      const timestamp = now();
      const receipt: Receipt = {
        id: id('run'),
        projectId: packet.projectId,
        streamId: packet.streamId,
        packetId,
        agent: requiredText(agent, 'agent', 120),
        status: 'started',
        outcome: '',
        gitCommit: '',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.db
        .prepare('INSERT INTO receipts(id,project_id,packet_id,data) VALUES(?,?,?,?)')
        .run(receipt.id, receipt.projectId, packetId, json(receipt));
      this.event(receipt.projectId, 'run.started', receipt.id, receipt.agent, {
        packetId,
        streamId: receipt.streamId,
      });
      return receipt;
    });
  }
  getReceipt(receiptId: string): Receipt {
    requiredText(receiptId, 'receiptId');
    const row = this.db.prepare('SELECT data FROM receipts WHERE id=?').get(receiptId);
    invariant(row, 'Receipt not found', 404, 'NOT_FOUND');
    return parse<Receipt>(row);
  }
  listReceipts(projectId: string): Receipt[] {
    return this.readSnapshot(() => {
      this.getProject(projectId);
      return this.db
        .prepare('SELECT data FROM receipts WHERE project_id=? ORDER BY rowid DESC')
        .all(projectId)
        .map(parse<Receipt>);
    });
  }
  finishReceipt(
    receiptId: string,
    input: { status: 'completed' | 'abandoned'; outcome?: string; gitCommit?: string },
  ): Receipt {
    return this.transaction(() => {
      const receipt = this.getReceipt(receiptId);
      invariant(
        receipt.status === 'started',
        'This run receipt is already finalized',
        409,
        'RUN_FINALIZED',
      );
      invariant(
        input.status === 'completed' || input.status === 'abandoned',
        'status must be completed or abandoned',
      );
      if (input.status === 'completed')
        invariant(
          this.checkPacket(receipt.packetId).ok,
          'Context changed during this run. Revalidate using a new packet and receipt before recording completion.',
          409,
          'STALE_CONTEXT',
        );
      receipt.status = input.status;
      receipt.outcome = optionalText(input.outcome, 'outcome', 4000);
      receipt.gitCommit = optionalText(input.gitCommit, 'gitCommit', 64);
      invariant(
        !receipt.gitCommit || /^[0-9a-f]{7,64}$/i.test(receipt.gitCommit),
        'gitCommit must be a hexadecimal commit ID',
      );
      receipt.updatedAt = now();
      this.db.prepare('UPDATE receipts SET data=? WHERE id=?').run(json(receipt), receipt.id);
      this.event(receipt.projectId, `run.${receipt.status}`, receipt.id, receipt.agent, {
        packetId: receipt.packetId,
        gitCommit: receipt.gitCommit,
        outcome: receipt.outcome,
      });
      return receipt;
    });
  }
  impact(capsuleId: string): Impact {
    return this.readSnapshot(() => {
      const capsule = this.getCapsule(capsuleId);
      const all = this.listCapsules(capsule.projectId);
      const impacted = new Set([capsuleId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const c of all)
          if (
            !impacted.has(c.id) &&
            (c.dependencies ?? []).some((d) => impacted.has(d.capsuleId))
          ) {
            impacted.add(c.id);
            changed = true;
          }
      }
      // Current dependencies identify potential consumers. Recorded packets require their historical graph.
      const revisionReferences = new Map<string, boolean>();
      const references = (id: string, version: number): boolean => {
        if (id === capsuleId) return true;
        const key = `${id}@${version}`;
        const cached = revisionReferences.get(key);
        if (cached !== undefined) return cached;
        revisionReferences.set(key, false);
        const result = (this.revision(id, version).dependencies ?? []).some((d) =>
          references(d.capsuleId, d.version),
        );
        revisionReferences.set(key, result);
        return result;
      };
      const packetReferences = (packet: Packet) =>
        packet.manifest.some((m) => references(m.capsuleId, m.version));
      const streams: Impact['streams'] = [];
      for (const stream of this.listStreams(capsule.projectId)) {
        const state = this.getStreamState(stream.id);
        const owned = state.owned.map((c) => c.id);
        const mounted = state.mounts.map((m) => m.capsuleId);
        const historical = state.latestPacket && packetReferences(state.latestPacket);
        if (
          owned.some((c) => impacted.has(c)) ||
          mounted.some((c) => impacted.has(c)) ||
          historical
        )
          streams.push({
            stream,
            relation: owned.includes(capsuleId)
              ? 'owner'
              : mounted.includes(capsuleId) ||
                  state.latestPacket?.manifest.some((m) => m.capsuleId === capsuleId)
                ? 'direct'
                : 'transitive',
            stale: state.drift.some((d) => !d.pinned),
          });
      }
      const receipts = this.listReceipts(capsule.projectId)
        .filter((r) => packetReferences(this.getPacket(r.packetId)))
        .map((receipt) => ({ receipt, check: this.checkPacket(receipt.packetId) }));
      return {
        capsule,
        dependentCapsules: all.filter((c) => c.id !== capsuleId && impacted.has(c.id)),
        streams,
        receipts,
      };
    });
  }
  snapshot(projectId?: string): Snapshot {
    return this.readSnapshot(() => {
      const projects = this.listProjects();
      const project = projectId ? this.getProject(projectId) : (projects[0] ?? null);
      const streams = project
        ? this.listStreams(project.id).map((s) => this.getStreamState(s.id))
        : [];
      const capsules = project ? this.listCapsules(project.id) : [];
      return {
        projects,
        project,
        streams,
        capsules,
        events: project ? this.events(project.id, 50) : [],
        stats: {
          capsules: capsules.filter((c) => c.status === 'active').length,
          streams: streams.length,
          packets: project
            ? Number(
                (
                  this.db
                    .prepare('SELECT COUNT(*) AS n FROM packets WHERE project_id=?')
                    .get(project.id) as { n: number }
                ).n,
              )
            : 0,
          staleStreams: streams.filter((s) => s.drift.some((d) => !d.pinned)).length,
          mounts: streams.reduce((n, s) => n + s.mounts.length, 0),
        },
      };
    });
  }
  search(projectId: string, query: string, limit = 30): SearchHit[] {
    return this.readSnapshot(() => {
      this.getProject(projectId);
      invariant(
        typeof query === 'string' && query.length <= 1000,
        'Search query exceeds 1000 characters',
      );
      invariant(
        Number.isInteger(limit) && limit > 0 && limit <= 100,
        'limit must be between 1 and 100',
      );
      const terms = query.match(/[\p{L}\p{N}_-]+/gu)?.slice(0, 30) ?? [];
      if (!terms.length) return [];
      const match = terms.map((t) => `"${t.replaceAll('"', '""')}"*`).join(' OR ');
      const rows = this.db
        .prepare(
          "SELECT capsule_id, snippet(capsule_search,3,'[',']','…',28) AS snippet, bm25(capsule_search,0,0,5,1,2) AS rank FROM capsule_search WHERE capsule_search MATCH ? AND project_id=? ORDER BY rank LIMIT ?",
        )
        .all(match, projectId, limit) as { capsule_id: string; snippet: string; rank: number }[];
      return rows.map((r) => ({
        capsule: this.getCapsule(r.capsule_id),
        snippet: r.snippet,
        rank: r.rank,
      }));
    });
  }
  events(projectId: string, limit = 100): AuditEvent[] {
    return this.readSnapshot(() => {
      this.getProject(projectId);
      invariant(Number.isInteger(limit) && limit > 0 && limit <= 10000, 'Event limit out of range');
      return this.db
        .prepare('SELECT * FROM events WHERE project_id=? ORDER BY id DESC LIMIT ?')
        .all(projectId, limit)
        .map((row) => ({
          id: Number(row.id),
          projectId: String(row.project_id),
          type: String(row.type),
          entityId: String(row.entity_id),
          actor: String(row.actor),
          data: JSON.parse(String(row.data)),
          createdAt: String(row.created_at),
        }));
    });
  }
  findBySource(projectId: string, sourceUri: string): Capsule | null {
    return this.readSnapshot(() => {
      return (
        this.listCapsules(projectId).find((c) => c.evidence.some((e) => e.uri === sourceUri)) ??
        null
      );
    });
  }
  exportProject(projectId: string): object {
    return this.readSnapshot(() => {
      const project = this.getProject(projectId);
      const streams = this.listStreams(projectId);
      const capsules = this.listCapsules(projectId);
      return {
        format: 'loomplane.project',
        version: 1,
        exportedAt: now(),
        project,
        streams,
        capsules,
        revisions: capsules.flatMap((c) => this.getRevisions(c.id)),
        mounts: streams.flatMap((s) => this.listMounts(s.id)),
        packets: this.db
          .prepare('SELECT data FROM packets WHERE project_id=? ORDER BY rowid')
          .all(projectId)
          .map(parse<Packet>),
        receipts: this.listReceipts(projectId),
        events: this.events(projectId, 10000).reverse(),
      };
    });
  }
  restoreProject(input: unknown): Project {
    const bundle = validatePortableProject(input);
    return this.transaction(() => {
      const groups = [
        ['projects', [bundle.project]],
        ['streams', bundle.streams],
        ['capsules', bundle.capsules],
        ['mounts', bundle.mounts],
        ['packets', bundle.packets],
        ['receipts', bundle.receipts],
      ] as const;
      for (const [table, records] of groups)
        for (const record of records)
          invariant(
            !this.db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(record.id),
            `Restore collision: ${record.id} already exists`,
            409,
            'RESTORE_COLLISION',
          );
      this.db
        .prepare('INSERT INTO projects(id,data) VALUES(?,?)')
        .run(bundle.project.id, json(bundle.project));
      for (const s of bundle.streams)
        this.db
          .prepare('INSERT INTO streams(id,project_id,data) VALUES(?,?,?)')
          .run(s.id, s.projectId, json(s));
      for (const c of [...bundle.capsules].reverse()) {
        this.db
          .prepare('INSERT INTO capsules(id,project_id,stream_id,data) VALUES(?,?,?,?)')
          .run(c.id, c.projectId, c.streamId, json(c));
        this.index(c);
      }
      for (const r of bundle.revisions)
        this.db
          .prepare('INSERT INTO revisions(capsule_id,version,data) VALUES(?,?,?)')
          .run(r.capsuleId, r.version, json(r));
      for (const m of bundle.mounts)
        this.db
          .prepare('INSERT INTO mounts(id,stream_id,capsule_id,data) VALUES(?,?,?,?)')
          .run(m.id, m.streamId, m.capsuleId, json(m));
      for (const p of bundle.packets)
        this.db
          .prepare('INSERT INTO packets(id,project_id,stream_id,created_at,data) VALUES(?,?,?,?,?)')
          .run(p.id, p.projectId, p.streamId, p.createdAt, json(p));
      for (const r of [...bundle.receipts].reverse())
        this.db
          .prepare('INSERT INTO receipts(id,project_id,packet_id,data) VALUES(?,?,?,?)')
          .run(r.id, r.projectId, r.packetId, json(r));
      for (const e of [...bundle.events].sort((a, b) => a.id - b.id))
        this.db
          .prepare(
            'INSERT INTO events(project_id,type,entity_id,actor,data,created_at) VALUES(?,?,?,?,?,?)',
          )
          .run(
            e.projectId,
            e.type,
            e.entityId,
            e.actor,
            json({
              ...e.data,
              _loomplaneRestore: {
                sourceEventId: e.id,
                ...(e.data._loomplaneRestore === undefined
                  ? {}
                  : { previous: e.data._loomplaneRestore }),
              },
            }),
            e.createdAt,
          );
      this.event(bundle.project.id, 'project.restored', bundle.project.id, 'local', {
        format: bundle.format,
        exportedAt: bundle.exportedAt,
        sourceEvents: bundle.events.length,
      });
      return bundle.project;
    });
  }
}
export { LoomplaneError } from './errors.js';
