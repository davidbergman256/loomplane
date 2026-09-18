import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import type {
  Evidence,
  SourceCheck,
  SourceFingerprint,
  Revision,
  Packet,
  Capsule,
} from './types.js';
import { invariant, LoomplaneError } from './errors.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
export interface SourceReader {
  getPacket(id: string): Packet | Promise<Packet>;
  listCapsules(projectId: string): Capsule[] | Promise<Capsule[]>;
  getRevisions(capsuleId: string): Revision[] | Promise<Revision[]>;
}
function inside(root: string, path: string) {
  return path === root || path.startsWith(root + sep);
}
async function hashFile(
  root: string,
  path: string,
): Promise<{ path: string; sha256: string; bytes: number }> {
  const absolute = resolve(root, path);
  if (!inside(root, absolute))
    throw new LoomplaneError('Source path escapes the chosen root', 400, 'OUTSIDE_ROOT');
  const actual = await realpath(absolute);
  if (!inside(root, actual))
    throw new LoomplaneError('Source symlink escapes the chosen root', 400, 'OUTSIDE_ROOT');
  const info = await stat(actual);
  invariant(info.isFile(), 'Source is not a regular file');
  invariant(info.size <= MAX_FILE_BYTES, 'Source file exceeds 10 MB');
  const data = await readFile(actual);
  invariant(data.length <= MAX_FILE_BYTES, 'Source file exceeds 10 MB');
  return {
    path: relative(root, absolute).split(sep).join('/'),
    sha256: createHash('sha256').update(data).digest('hex'),
    bytes: data.length,
  };
}
/** Explicit filesystem access only. Captures a digest, never source contents. */
export async function fingerprintSource(rootPath: string, filePath: string): Promise<Evidence> {
  const logicalRoot = resolve(rootPath);
  const root = await realpath(logicalRoot);
  const absolute = resolve(filePath);
  const sourcePath = inside(logicalRoot, absolute) ? relative(logicalRoot, absolute) : absolute;
  const fingerprint: SourceFingerprint = await hashFile(root, sourcePath);
  try {
    const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
    if (/^[0-9a-f]{40,64}$/.test(head)) fingerprint.gitCommit = head;
  } catch {
    /* A Git checkout is optional. */
  }
  return {
    label: fingerprint.path,
    uri: `repo:///${fingerprint.path.split('/').map(encodeURIComponent).join('/')}`,
    fingerprint,
  };
}
/** Read-only check of exact packet revisions, or current project capsules. */
export async function checkSources(
  store: SourceReader,
  input: { root: string; packetId?: string; projectId?: string },
): Promise<SourceCheck> {
  invariant(
    Boolean(input.packetId) !== Boolean(input.projectId),
    'Choose one packetId or projectId',
  );
  const root = await realpath(resolve(input.root));
  const pending = input.packetId
    ? (await store.getPacket(input.packetId)).manifest.map((m) => ({
        capsuleId: m.capsuleId,
        version: m.version,
      }))
    : (await store.listCapsules(input.projectId!))
        .filter((c) => c.status === 'active')
        .map((c) => ({ capsuleId: c.id, version: c.version }));
  const records: Revision[] = [];
  const seen = new Set<string>();
  const history = new Map<string, Revision[]>();
  while (pending.length) {
    const ref = pending.pop()!;
    const key = `${ref.capsuleId}@${ref.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!history.has(ref.capsuleId))
      history.set(ref.capsuleId, await store.getRevisions(ref.capsuleId));
    const revision = history.get(ref.capsuleId)!.find((r) => r.version === ref.version);
    invariant(revision, 'A referenced source revision is missing', 500, 'INVALID_HISTORY');
    records.push(revision);
    pending.push(...(revision.dependencies ?? []));
  }
  const findings: SourceCheck['findings'] = [];
  for (const record of records)
    for (const evidence of record.evidence) {
      if (!evidence.fingerprint) continue;
      const source = evidence.fingerprint;
      const base = {
        capsuleId: record.capsuleId,
        version: record.version,
        path: source.path,
        expectedSha256: source.sha256,
      };
      try {
        if (isAbsolute(source.path) || source.path.split(/[\\/]/).includes('..'))
          throw new LoomplaneError('Source escapes root', 400, 'OUTSIDE_ROOT');
        const actual = await hashFile(root, source.path);
        findings.push({
          ...base,
          status: source.sha256 === actual.sha256 ? 'unchanged' : 'changed',
          actualSha256: actual.sha256,
        });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        findings.push({
          ...base,
          status:
            code === 'OUTSIDE_ROOT' ? 'outside-root' : code === 'ENOENT' ? 'missing' : 'unreadable',
        });
      }
    }
  return {
    ok: findings.every((f) => f.status === 'unchanged'),
    checkedAt: new Date().toISOString(),
    root,
    checked: findings.length,
    findings,
  };
}
