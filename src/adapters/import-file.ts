import { readFile, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Store } from '../core/store.js';
import type { ImportResult, PublishCapsule } from '../core/types.js';

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

function segmentTitle(
  format: 'codex' | 'claude',
  role: 'user' | 'assistant',
  path: string,
  line: number,
): string {
  const source = format === 'codex' ? 'Codex' : 'Claude';
  return `${source} ${role} message — ${basename(path)}:${line}`.slice(0, 240);
}

function publish(
  store: Store,
  input: ImportFileInput,
  capsule: Omit<PublishCapsule, 'projectId' | 'streamId'>,
): string {
  return store.publishCapsule({
    projectId: input.projectId,
    streamId: input.streamId ?? null,
    ...capsule,
  }).id;
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
    const uri = lineUri(absolutePath, 1, endLine);
    if (store.findBySource(input.projectId, uri)) {
      result.skipped++;
      result.warnings.push('Skipped Markdown already imported from the same source lines');
      return result;
    }
    result.capsuleIds.push(
      publish(store, input, {
        kind: 'artifact',
        title: markdownTitle(source, absolutePath),
        body,
        author: 'markdown-import',
        tags: ['imported', 'markdown'],
        evidence: [
          {
            label: `${basename(absolutePath)} lines 1-${endLine}`,
            uri,
            excerpt: body.slice(0, 300),
          },
        ],
      }),
    );
    result.imported++;
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
    const uri = lineUri(absolutePath, line);
    if (store.findBySource(input.projectId, uri)) {
      result.skipped++;
      continue;
    }
    result.capsuleIds.push(
      publish(store, input, {
        kind: 'artifact',
        title: segmentTitle(format, segment.role!, absolutePath, line),
        body: segment.text,
        author: `${format}-${segment.role}`,
        tags: ['imported', format, segment.role!],
        evidence: [
          {
            label: `${basename(absolutePath)} line ${line}`,
            uri,
            excerpt: segment.text.slice(0, 300),
          },
        ],
      }),
    );
    result.imported++;
  }

  if (!result.imported && !result.skipped) result.warnings.push('No importable records found');
  return result;
}
