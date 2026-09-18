import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { invariant, requiredText } from '../core/errors.js';

export interface AccessKey {
  id: string;
  projectId: string;
  name: string;
  role: 'reader' | 'writer';
  createdAt: string;
  revokedAt: string | null;
}
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
/** Project credentials for a single server. This is not human identity or source-level ACL. */
export class AccessManager {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS access_keys(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),digest TEXT NOT NULL UNIQUE,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS access_keys_project ON access_keys(project_id);`);
  }
  close() {
    this.db.close();
  }
  create(
    projectId: string,
    name: string,
    role: 'reader' | 'writer',
  ): { key: AccessKey; token: string } {
    requiredText(projectId, 'projectId');
    name = requiredText(name, 'name', 120);
    invariant(role === 'reader' || role === 'writer', 'role must be reader or writer');
    invariant(
      this.db.prepare('SELECT id FROM projects WHERE id=?').get(projectId),
      'Project not found',
      404,
      'NOT_FOUND',
    );
    const token = `loomplane_${randomBytes(32).toString('base64url')}`;
    const key: AccessKey = {
      id: `key_${randomUUID().replaceAll('-', '').slice(0, 16)}`,
      projectId,
      name,
      role,
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };
    this.db
      .prepare('INSERT INTO access_keys(id,project_id,digest,data) VALUES(?,?,?,?)')
      .run(key.id, projectId, digest(token), JSON.stringify(key));
    return { key, token };
  }
  list(projectId: string): AccessKey[] {
    requiredText(projectId, 'projectId');
    return this.db
      .prepare('SELECT data FROM access_keys WHERE project_id=? ORDER BY rowid DESC')
      .all(projectId)
      .map((r) => JSON.parse(String(r.data)));
  }
  revoke(keyId: string): AccessKey {
    requiredText(keyId, 'keyId');
    const row = this.db.prepare('SELECT data FROM access_keys WHERE id=?').get(keyId);
    invariant(row, 'Access key not found', 404, 'NOT_FOUND');
    const key = JSON.parse(String(row.data)) as AccessKey;
    key.revokedAt ??= new Date().toISOString();
    this.db.prepare('UPDATE access_keys SET data=? WHERE id=?').run(JSON.stringify(key), key.id);
    return key;
  }
  authenticate(token: string): AccessKey | null {
    if (!/^loomplane_[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = this.db.prepare('SELECT data FROM access_keys WHERE digest=?').get(digest(token));
    if (!row) return null;
    const key = JSON.parse(String(row.data)) as AccessKey;
    return key.revokedAt ? null : key;
  }
  projectForResource(kind: string, id: string): string | null {
    if (kind === 'mounts') {
      const row = this.db
        .prepare(
          'SELECT streams.project_id FROM mounts JOIN streams ON streams.id=mounts.stream_id WHERE mounts.id=?',
        )
        .get(id);
      return row ? String(row.project_id) : null;
    }
    invariant(
      ['streams', 'capsules', 'packets', 'receipts'].includes(kind),
      'Unknown resource kind',
    );
    const row = this.db.prepare(`SELECT project_id FROM ${kind} WHERE id=?`).get(id);
    return row ? String(row.project_id) : null;
  }
  changeVersion(projectId: string): number {
    return Number(
      (
        this.db
          .prepare('SELECT COALESCE(MAX(id),0) AS id FROM events WHERE project_id=?')
          .get(projectId) as { id: number }
      ).id,
    );
  }
}
