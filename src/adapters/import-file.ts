import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Store } from '../core/store.js';
import type { Capsule, Evidence, ImportResult, PublishCapsule } from '../core/types.js';

export type ImportFormat = 'markdown' | 'codex' | 'claude' | 'auto';

export interface ImportFileInput {
  projectId: string;
  streamId?: string;
  path: string;
  format: ImportFormat;
}

interface Segment {
  line: number;
  role?: 'user' | 'assistant';
  text: string;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_SEGMENT_CHARS = 64_000;
const STATE_URI_PREFIX = 'urn:loomplane:import-state:sha256:';

type ManagedInput = Omit<PublishCapsule, 'projectId' | 'streamId' | 'kind'> & {
  title: string;
  body: string;
  author: string;
  tags: string[];
  evidence: Evidence[];
  priority: number;
};

function textParts(content: unknown, allowedTypes: ReadonlySet<string>): string[] {
  if (typeof content === 'string') return content.trim() ? [content.trim()] : [];
  if (!Array.isArray(content)) return [];
  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    const candidate = part as Record<string, unknown>;
    if (!allowedTypes.has(String(candidate.type ?? ''))) continue;
    if (typeof candidate.text === 'string' && candidate.text.trim())
      parts.push(candidate.text.trim());
  }
  return parts;
}

function parseCodex(record: unknown): Omit<Segment, 'line'> | null {
  if (!record || typeof record !== 'object') return null;
  const outer = record as Record<string, unknown>;
  const candidate =
    outer.type === 'response_item' && outer.payload && typeof outer.payload === 'object'
      ? (outer.payload as Record<string, unknown>)
      : outer;
  if (candidate.type !== 'message' || (candidate.role !== 'user' && candidate.role !== 'assistant'))
    return null;
  const parts = textParts(candidate.content, new Set(['input_text', 'output_text', 'text']));
  return parts.length ? { role: candidate.role, text: parts.join('\n\n') } : null;
}

function parseClaude(record: unknown): Omit<Segment, 'line'> | null {
  if (!record || typeof record !== 'object') return null;
  const outer = record as Record<string, unknown>;
  if (outer.type !== 'user' && outer.type !== 'assistant') return null;
  if (!outer.message || typeof outer.message !== 'object') return null;
  const message = outer.message as Record<string, unknown>;
  if (message.role !== outer.type || (message.role !== 'user' && message.role !== 'assistant'))
    return null;
  const parts = textParts(message.content, new Set(['text']));
  return parts.length ? { role: message.role, text: parts.join('\n\n') } : null;
}

function detectFormat(path: string, source: string): Exclude<ImportFormat, 'auto'> {
  const extension = extname(path).toLowerCase();
  if (extension === '.md' || extension === '.markdown') return 'markdown';
  for (const line of source.split(/\r?\n/).slice(0, 30)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as Record<string, unknown>;
      if (
        value.type === 'response_item' ||
        value.type === 'session_meta' ||
        value.type === 'event_msg'
      )
        return 'codex';
      if ((value.type === 'user' || value.type === 'assistant') && value.message) return 'claude';
    } catch {
      break;
    }
  }
  throw new Error('Could not detect import format; specify markdown, codex, or claude');
}

function markdownTitle(source: string, path: string): string {
  const heading = source.split(/\r?\n/).find((line) => /^#{1,6}\s+\S/.test(line));
  return heading
    ? heading
        .replace(/^#{1,6}\s+/, '')
        .trim()
        .slice(0, 220)
    : basename(path).slice(0, 220);
}

function lineUri(path: string, line?: number, endLine?: number): string {
  const uri = pathToFileURL(path).href;
  if (line === undefined) return uri;
  return `${uri}#L${line}${endLine && endLine !== line ? `-L${endLine}` : ''}`;
}

function identityUri(path: string, format: Exclude<ImportFormat, 'auto'>, line?: number): string {
  return `${pathToFileURL(path).href}#import-format=${format}${line === undefined ? '' : `&record-line=${line}`}`;
}

function evidenceWithoutState(evidence: Evidence[]): Evidence[] {
  return evidence.filter((item) => !item.uri.startsWith(STATE_URI_PREFIX));
}

function stateDigest(
  input: Pick<ManagedInput, 'title' | 'body' | 'author' | 'tags' | 'evidence' | 'priority'> & {
    dependencies?: unknown[];
  },
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        title: input.title,
        body: input.body,
        author: input.author,
        tags: input.tags,
        evidence: evidenceWithoutState(input.evidence),
        priority: input.priority,
        dependencies: input.dependencies ?? [],
      }),
    )
    .digest('hex');
}

function storedStateDigest(capsule: Capsule): string | null {
  const uri = capsule.evidence.find((item) => item.uri.startsWith(STATE_URI_PREFIX))?.uri;
  const digest = uri?.slice(STATE_URI_PREFIX.length);
  return digest && /^[0-9a-f]{64}$/.test(digest) ? digest : null;
}

function managedStateDigest(capsule: Capsule): string {
  return stateDigest({
    title: capsule.title,
    body: capsule.body,
    author: capsule.author,
    tags: capsule.tags,
    evidence: capsule.evidence,
    priority: capsule.priority,
    dependencies: capsule.dependencies ?? [],
  });
}

function withStateEvidence(input: ManagedInput): ManagedInput {
  const digest = stateDigest({ ...input, dependencies: input.dependencies ?? [] });
  return {
    ...input,
    evidence: [
      ...evidenceWithoutState(input.evidence),
      { label: 'Imported state digest', uri: `${STATE_URI_PREFIX}${digest}` },
    ],
  };
}

function segmentTitle(
  format: 'codex' | 'claude',
  role: 'user' | 'assistant',
  path: string,
  line: number,
): string {
  const source = format === 'codex' ? 'Codex' : 'Claude';
  return `${source} ${role} message — ${basename(path)}:${line}`.slice(0, 240);
}

function findExisting(
  store: Store,
  projectId: string,
  stableUri: string,
  provenanceUri: string,
  format: Exclude<ImportFormat, 'auto'>,
): Capsule | null {
  const exact =
    store.findBySource(projectId, stableUri) ?? store.findBySource(projectId, provenanceUri);
  if (exact || format !== 'markdown') return exact;
  const baseUri = stableUri.split('#')[0]!;
  return (
    store
      .listCapsules(projectId)
      .find(
        (capsule) =>
          capsule.tags.includes('imported') &&
          capsule.tags.includes('markdown') &&
          capsule.evidence.some((item) => item.uri.split('#')[0] === baseUri),
      ) ?? null
  );
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function legacyManaged(capsule: Capsule, incoming: ManagedInput, provenanceUri: string): boolean {
  return (
    capsule.version === 1 &&
    capsule.status === 'active' &&
    capsule.kind === 'artifact' &&
    capsule.author === incoming.author &&
    capsule.priority === incoming.priority &&
    sameStringArray(capsule.tags, incoming.tags) &&
    !capsule.dependencies?.length &&
    capsule.evidence.some((item) => item.uri === provenanceUri)
  );
}

function legacyIdentical(capsule: Capsule, incoming: ManagedInput): boolean {
  return (
    capsule.title === incoming.title &&
    capsule.body === incoming.body &&
    capsule.author === incoming.author &&
    capsule.priority === incoming.priority &&
    sameStringArray(capsule.tags, incoming.tags)
  );
}

function importManaged(
  store: Store,
  input: ImportFileInput,
  format: Exclude<ImportFormat, 'auto'>,
  stableUri: string,
  provenanceUri: string,
  candidate: ManagedInput,
  result: ImportResult,
  sourceLabel: string,
): void {
  const managed = withStateEvidence(candidate);
  const incomingDigest = stateDigest({ ...managed, dependencies: managed.dependencies ?? [] });
  const existing = findExisting(store, input.projectId, stableUri, provenanceUri, format);
  if (!existing) {
    const capsule = store.publishCapsule({
      projectId: input.projectId,
      streamId: input.streamId ?? null,
      kind: 'artifact',
      ...managed,
    });
    result.imported++;
    result.capsuleIds.push(capsule.id);
    return;
  }

  const expectedStreamId = input.streamId ?? null;
  const storedDigest = storedStateDigest(existing);
  const currentDigest = managedStateDigest(existing);
  const hasHumanChanges =
    existing.status !== 'active' ||
    existing.kind !== 'artifact' ||
    existing.streamId !== expectedStreamId ||
    (storedDigest
      ? currentDigest !== storedDigest
      : !legacyManaged(existing, candidate, provenanceUri));
  if (hasHumanChanges) {
    result.skipped++;
    result.warnings.push(
      `Import conflict for ${sourceLabel}: capsule ${existing.id} has local changes; source content was not applied`,
    );
    return;
  }

  const unchanged = storedDigest
    ? incomingDigest === storedDigest
    : legacyIdentical(existing, candidate);
  if (unchanged) {
    result.skipped++;
    return;
  }

  const revised = store.reviseCapsule(existing.id, {
    expectedVersion: existing.version,
    title: managed.title,
    body: managed.body,
    author: managed.author,
    tags: managed.tags,
    evidence: managed.evidence,
    priority: managed.priority,
    dependencies: managed.dependencies ?? [],
    changeNote: `Re-imported changed explicit source: ${sourceLabel}`,
  });
  result.imported++;
  result.capsuleIds.push(revised.id);
  result.warnings.push(`Updated capsule ${revised.id} from changed source ${sourceLabel}`);
}

export async function importFile(store: Store, input: ImportFileInput): Promise<ImportResult> {
  if (!input.path || typeof input.path !== 'string')
    throw new Error('An explicit import path is required');
  if (!['auto', 'markdown', 'codex', 'claude'].includes(input.format)) {
    throw new Error(`Unsupported import format: ${String(input.format)}`);
  }
  store.getProject(input.projectId);
  if (input.streamId) {
    const stream = store.getStream(input.streamId);
    if (stream.projectId !== input.projectId)
      throw new Error('Import stream belongs to a different project');
  }

  const absolutePath = resolve(input.path);
  const file = await stat(absolutePath);
  if (!file.isFile()) throw new Error('Import path must refer to a regular file');
  if (file.size > MAX_FILE_BYTES) throw new Error(`Import file exceeds ${MAX_FILE_BYTES} bytes`);
  const source = await readFile(absolutePath, 'utf8');
  if (Buffer.byteLength(source, 'utf8') > MAX_FILE_BYTES)
    throw new Error(`Import file exceeds ${MAX_FILE_BYTES} bytes`);
  if (source.includes('\0')) throw new Error('Import file contains binary data');

  const format = input.format === 'auto' ? detectFormat(absolutePath, source) : input.format;
  const result: ImportResult = { imported: 0, skipped: 0, capsuleIds: [], warnings: [] };

  if (format === 'markdown') {
    const body = source.trim();
    if (!body) {
      result.skipped++;
      result.warnings.push('Skipped empty Markdown file');
      return result;
    }
    if (body.length > MAX_SEGMENT_CHARS)
      throw new Error(`Markdown content exceeds ${MAX_SEGMENT_CHARS} characters`);
    const endLine = source.split(/\r?\n/).length;
    const provenanceUri = lineUri(absolutePath, 1, endLine);
    const stableUri = identityUri(absolutePath, format);
    importManaged(
      store,
      input,
      format,
      stableUri,
      provenanceUri,
      {
        title: markdownTitle(source, absolutePath),
        body,
        author: 'markdown-import',
        tags: ['imported', 'markdown'],
        priority: 50,
        dependencies: [],
        evidence: [
          {
            label: `${basename(absolutePath)} lines 1-${endLine}`,
            uri: provenanceUri,
            excerpt: body.slice(0, 300),
          },
          { label: `Imported Markdown file ${basename(absolutePath)}`, uri: stableUri },
        ],
      },
      result,
      basename(absolutePath),
    );
    return result;
  }

  const parser = format === 'codex' ? parseCodex : parseClaude;
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index]!;
    const line = index + 1;
    if (!raw.trim()) continue;
    let record: unknown;
    try {
      record = JSON.parse(raw);
    } catch {
      result.skipped++;
      result.warnings.push(`Line ${line}: skipped invalid JSON`);
      continue;
    }
    const segment = parser(record);
    if (!segment) {
      result.skipped++;
      continue;
    }
    if (segment.text.length > MAX_SEGMENT_CHARS) {
      result.skipped++;
      result.warnings.push(
        `Line ${line}: skipped message exceeding ${MAX_SEGMENT_CHARS} characters`,
      );
      continue;
    }
    const provenanceUri = lineUri(absolutePath, line);
    const stableUri = identityUri(absolutePath, format, line);
    importManaged(
      store,
      input,
      format,
      stableUri,
      provenanceUri,
      {
        title: segmentTitle(format, segment.role!, absolutePath, line),
        body: segment.text,
        author: `${format}-${segment.role}`,
        tags: ['imported', format, segment.role!],
        priority: 50,
        dependencies: [],
        evidence: [
          {
            label: `${basename(absolutePath)} line ${line}`,
            uri: provenanceUri,
            excerpt: segment.text.slice(0, 300),
          },
          { label: `Imported ${format} record ${basename(absolutePath)}:${line}`, uri: stableUri },
        ],
      },
      result,
      `${basename(absolutePath)} line ${line}`,
    );
  }

  if (!result.imported && !result.skipped) result.warnings.push('No importable records found');
  return result;
}
