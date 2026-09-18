import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { estimateTokens } from './compiler.js';
import { invariant, LoomplaneError } from './errors.js';

const MAX_BYTES = 32 * 1024 * 1024;
const MAX_RECORDS = 50000;
const text = (max: number) => z.string().max(max);
const required = (max: number) => text(max).refine((s) => s.trim().length > 0, 'Must not be blank');
const id = z.string().regex(/^[a-z]+_[a-zA-Z0-9_-]{1,100}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const version = integer.min(1);
const date = z.iso.datetime();
const status = z.enum(['active', 'superseded', 'retracted']);
const kind = z.enum(['decision', 'fact', 'constraint', 'question', 'artifact']);
const fingerprint = z.strictObject({
  path: required(2000).refine(
    (p) =>
      !p.startsWith('/') &&
      !p.startsWith('\\') &&
      !/^[a-z]:/i.test(p) &&
      !p.split(/[\\/]/).includes('..'),
    'Unsafe relative source path',
  ),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: integer.max(10 * 1024 * 1024),
  gitCommit: z
    .string()
    .regex(/^[0-9a-f]{40,64}$/)
    .optional(),
});
const evidence = z.strictObject({
  label: required(300),
  uri: required(4000).refine(
    (uri) => !/^(javascript|data|vbscript):/i.test(uri.trim()),
    'Unsafe evidence URI',
  ),
  excerpt: text(4000).optional(),
  fingerprint: fingerprint.optional(),
});
const dependency = z.strictObject({ capsuleId: id, version });
const content = {
  title: required(240),
  body: required(100000),
  author: text(120),
  tags: z.array(required(100)).max(30),
  evidence: z.array(evidence).max(50),
  priority: integer.max(100),
  dependencies: z.array(dependency).max(50).optional(),
};
const project = z.strictObject({
  id,
  name: required(120),
  description: text(3000),
  createdAt: date,
});
const stream = z.strictObject({
  id,
  projectId: id,
  name: required(120),
  description: text(3000),
  agent: text(300),
  branch: text(300),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  createdAt: date,
  updatedAt: date,
});
const capsule = z.strictObject({
  id,
  projectId: id,
  streamId: id.nullable(),
  key: text(200),
  kind,
  status,
  ...content,
  version,
  createdAt: date,
  updatedAt: date,
});
const revision = z.strictObject({
  capsuleId: id,
  version,
  ...content,
  status,
  createdAt: date,
  changeNote: text(3000),
});
const mount = z.strictObject({
  id,
  streamId: id,
  capsuleId: id,
  mode: z.enum(['live', 'pinned']),
  pinnedVersion: version.nullable(),
  createdAt: date,
});
const manifest = z.strictObject({
  capsuleId: id,
  version,
  title: required(240),
  kind,
  mode: z.enum(['owned', 'live', 'pinned']),
  estimatedTokens: integer,
});
const omission = z.strictObject({
  capsuleId: id,
  title: required(240),
  reason: z.enum(['budget', 'retracted', 'superseded']),
});
const conflict = z.strictObject({
  key: required(200),
  capsuleIds: z.array(id).min(2).max(10000),
  titles: z.array(required(240)).min(2).max(10000),
  reason: required(1000),
});
const packet = z.strictObject({
  id,
  projectId: id,
  streamId: id,
  task: text(4000),
  budget: integer.min(256).max(100000),
  estimatedTokens: integer.max(100000),
  text: text(400000),
  manifest: z.array(manifest).max(10000),
  omitted: z.array(omission).max(10000),
  conflicts: z.array(conflict).max(10000),
  createdAt: date,
});
const receipt = z.strictObject({
  id,
  projectId: id,
  streamId: id,
  packetId: id,
  agent: required(120),
  status: z.enum(['started', 'completed', 'abandoned']),
  outcome: text(4000),
  gitCommit: z.string().regex(/^(?:[0-9a-f]{7,64})?$/i),
  createdAt: date,
  updatedAt: date,
});
const event = z.strictObject({
  id: version,
  projectId: id,
  type: required(200),
  entityId: id,
  actor: text(300),
  data: z.record(z.string(), z.unknown()),
  createdAt: date,
});
const bundleSchema = z.strictObject({
  format: z.literal('loomplane.project'),
  version: z.literal(1),
  exportedAt: date,
  project,
  streams: z.array(stream).max(10000),
  capsules: z.array(capsule).max(10000),
  revisions: z.array(revision).max(MAX_RECORDS),
  mounts: z.array(mount).max(10000),
  packets: z.array(packet).max(10000),
  receipts: z.array(receipt).max(10000),
  events: z.array(event).max(10000),
});
export type PortableProject = z.infer<typeof bundleSchema>;

function unique<T>(values: T[], key: (value: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const k = key(value);
    invariant(!result.has(k), `Duplicate ${label}: ${k}`, 400, 'INVALID_EXPORT');
    result.set(k, value);
  }
  return result;
}
function acyclic(edges: Map<string, string[]>, label: string): void {
  const active = new Set<string>();
  const complete = new Set<string>();
  // An explicit stack prevents maliciously deep bundles overflowing the JS call stack.
  for (const root of edges.keys()) {
    const pending: { id: string; exit: boolean }[] = [{ id: root, exit: false }];
    while (pending.length) {
      const item = pending.pop()!;
      if (item.exit) {
        active.delete(item.id);
        complete.add(item.id);
        continue;
      }
      if (complete.has(item.id)) continue;
      invariant(!active.has(item.id), `${label} contains a cycle`, 400, 'INVALID_EXPORT');
      active.add(item.id);
      pending.push({ id: item.id, exit: true });
      for (const next of edges.get(item.id) ?? []) pending.push({ id: next, exit: false });
    }
  }
}

/** Validates structure and internal references. It does not attest to imported claims or packet contents. */
export function validatePortableProject(input: unknown): PortableProject {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(input);
  } catch {
    throw new LoomplaneError('Export must be finite JSON', 400, 'INVALID_EXPORT');
  }
  invariant(serialized !== undefined, 'Export must be a JSON object', 400, 'INVALID_EXPORT');
  invariant(
    Buffer.byteLength(serialized, 'utf8') <= MAX_BYTES,
    'Export exceeds 32 MiB',
    413,
    'EXPORT_TOO_LARGE',
  );
  const parsed = bundleSchema.safeParse(JSON.parse(serialized));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new LoomplaneError(
      `Invalid export at ${issue.path.join('.') || 'root'}: ${issue.message}`,
      400,
      'INVALID_EXPORT',
    );
  }
  const bundle = parsed.data;
  invariant(
    [
      bundle.streams,
      bundle.capsules,
      bundle.revisions,
      bundle.mounts,
      bundle.packets,
      bundle.receipts,
      bundle.events,
    ].reduce((n, v) => n + v.length, 1) <= MAX_RECORDS,
    'Export exceeds 50,000 records',
    413,
    'EXPORT_TOO_LARGE',
  );
  const streams = unique(bundle.streams, (s) => s.id, 'stream');
  const capsules = unique(bundle.capsules, (c) => c.id, 'capsule');
  const revisions = unique(bundle.revisions, (r) => `${r.capsuleId}@${r.version}`, 'revision');
  unique(bundle.mounts, (m) => m.id, 'mount');
  unique(bundle.mounts, (m) => `${m.streamId}:${m.capsuleId}`, 'mount pair');
  const packets = unique(bundle.packets, (p) => p.id, 'packet');
  const receipts = unique(bundle.receipts, (r) => r.id, 'receipt');
  unique(bundle.events, (e) => String(e.id), 'event');
  const entities = unique(
    [
      bundle.project,
      ...bundle.streams,
      ...bundle.capsules,
      ...bundle.mounts,
      ...bundle.packets,
      ...bundle.receipts,
    ],
    (e) => e.id,
    'entity ID',
  );
  const check = (condition: unknown, message: string) =>
    invariant(condition, message, 400, 'INVALID_EXPORT');
  for (const record of [
    ...bundle.streams,
    ...bundle.capsules,
    ...bundle.packets,
    ...bundle.receipts,
    ...bundle.events,
  ])
    check(record.projectId === bundle.project.id, 'Record belongs to another project');
  for (const c of bundle.capsules) {
    check(c.streamId === null || streams.has(c.streamId), 'Capsule refers to an unknown stream');
    check(c.version <= bundle.revisions.length, 'Capsule revision history is incomplete');
    for (let v = 1; v <= c.version; v++)
      check(revisions.has(`${c.id}@${v}`), 'Capsule revision history is incomplete');
    const latest = revisions.get(`${c.id}@${c.version}`)!;
    for (const field of [
      'title',
      'body',
      'author',
      'tags',
      'evidence',
      'priority',
      'status',
    ] as const)
      check(
        isDeepStrictEqual(c[field], latest[field]),
        `Current capsule ${field} disagrees with its latest revision`,
      );
    check(
      isDeepStrictEqual(c.dependencies ?? [], latest.dependencies ?? []),
      'Current dependencies disagree with latest revision',
    );
    check(
      c.updatedAt === latest.createdAt,
      'Current capsule timestamp disagrees with latest revision',
    );
    check(
      c.createdAt === revisions.get(`${c.id}@1`)!.createdAt,
      'Capsule creation timestamp disagrees with first revision',
    );
  }
  const revisionEdges = new Map<string, string[]>();
  for (const r of bundle.revisions) {
    const owner = capsules.get(r.capsuleId);
    check(
      owner && r.version <= owner.version,
      'Revision refers to an unknown capsule or future version',
    );
    unique(r.dependencies ?? [], (d) => d.capsuleId, 'dependency');
    const edges: string[] = [];
    for (const d of r.dependencies ?? []) {
      check(d.capsuleId !== r.capsuleId, 'Capsule depends on itself');
      const key = `${d.capsuleId}@${d.version}`;
      check(revisions.has(key), 'Dependency refers to an unknown revision');
      edges.push(key);
    }
    revisionEdges.set(`${r.capsuleId}@${r.version}`, edges);
  }
  acyclic(revisionEdges, 'Revision dependency graph');
  acyclic(
    new Map(bundle.capsules.map((c) => [c.id, (c.dependencies ?? []).map((d) => d.capsuleId)])),
    'Current dependency graph',
  );
  for (const m of bundle.mounts) {
    check(
      streams.has(m.streamId) && capsules.has(m.capsuleId),
      'Mount refers to an unknown stream or capsule',
    );
    check(
      capsules.get(m.capsuleId)!.streamId !== m.streamId,
      'A stream cannot mount its own capsule',
    );
    check(
      m.mode === 'live'
        ? m.pinnedVersion === null
        : m.pinnedVersion !== null && revisions.has(`${m.capsuleId}@${m.pinnedVersion}`),
      'Mount has an invalid pinned revision',
    );
  }
  for (const p of bundle.packets) {
    check(streams.has(p.streamId), 'Packet refers to an unknown stream');
    check(
      p.estimatedTokens === estimateTokens(p.text) && p.estimatedTokens <= p.budget,
      'Packet budget accounting is inconsistent',
    );
    unique([...p.manifest, ...p.omitted], (m) => m.capsuleId, 'packet context item');
    for (const m of p.manifest) {
      const c = capsules.get(m.capsuleId);
      const r = revisions.get(`${m.capsuleId}@${m.version}`);
      check(c && r, 'Manifest refers to an unknown capsule revision');
      check(
        m.kind === c!.kind && m.title === r!.title,
        'Manifest metadata disagrees with its revision',
      );
      check(
        m.mode === 'owned' ? c!.streamId === p.streamId : c!.streamId !== p.streamId,
        'Manifest ownership is inconsistent',
      );
    }
    for (const item of p.omitted)
      check(capsules.has(item.capsuleId), 'Omission refers to an unknown capsule');
    for (const item of p.conflicts) {
      unique(item.capsuleIds, (v) => v, 'conflict capsule');
      check(
        item.capsuleIds.length === item.titles.length,
        'Conflict titles do not match its capsules',
      );
      for (const cid of item.capsuleIds)
        check(
          capsules.has(cid) && capsules.get(cid)!.key === item.key,
          'Conflict refers to an unknown capsule or mismatched key',
        );
    }
  }
  for (const r of bundle.receipts) {
    const p = packets.get(r.packetId);
    check(p && p.streamId === r.streamId, 'Receipt refers to an unknown packet or another stream');
  }
  for (const e of bundle.events) {
    // Mount rows can be deleted and the event export may begin after their creation.
    const deletedMount =
      (e.type === 'context.mounted' || e.type === 'context.unmounted') &&
      e.entityId.startsWith('mnt_');
    const valid = e.type.startsWith('project.')
      ? e.entityId === bundle.project.id
      : e.type.startsWith('stream.')
        ? streams.has(e.entityId)
        : e.type.startsWith('capsule.')
          ? capsules.has(e.entityId)
          : e.type.startsWith('packet.')
            ? packets.has(e.entityId)
            : e.type.startsWith('run.')
              ? receipts.has(e.entityId)
              : entities.has(e.entityId) || deletedMount;
    check(valid, 'Event refers to an entity outside the imported project');
    if (e.type === 'context.mounted' || e.type === 'context.unmounted') {
      check(
        typeof e.data.capsuleId === 'string' && capsules.has(e.data.capsuleId),
        'Context event refers to an unknown capsule',
      );
      check(
        typeof e.data.streamId === 'string' && streams.has(e.data.streamId),
        'Context event refers to an unknown stream',
      );
    }
    if (e.type === 'packet.compiled' || e.type === 'run.started')
      check(
        typeof e.data.streamId === 'string' && streams.has(e.data.streamId),
        'Event refers to an unknown stream',
      );
    if (e.type.startsWith('run.'))
      check(
        typeof e.data.packetId === 'string' && packets.has(e.data.packetId),
        'Run event refers to an unknown packet',
      );
  }
  // Arbitrary event payload content remains untrusted historical data, not executable instructions.
  return bundle;
}
