import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LoomplaneError } from '../core/errors.js';

export interface WorkspaceSelection {
  version: 1;
  database: string;
  projectId: string;
  streamId: string;
}
const file = () => resolve('.loomplane/workspace.json');
export function readSelection(database: string): WorkspaceSelection | null {
  if (!existsSync(file())) return null;
  try {
    const selected = JSON.parse(readFileSync(file(), 'utf8')) as WorkspaceSelection;
    if (
      selected.version !== 1 ||
      selected.database !== resolve(database) ||
      typeof selected.projectId !== 'string' ||
      typeof selected.streamId !== 'string'
    )
      return null;
    return selected;
  } catch {
    throw new LoomplaneError(
      'The local .loomplane/workspace.json is unreadable. Fix or remove it before choosing a workspace.',
    );
  }
}
export function writeSelection(selected: Omit<WorkspaceSelection, 'version'>): void {
  const path = file();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = path + '.' + randomUUID() + '.tmp';
  writeFileSync(
    temporary,
    JSON.stringify({ version: 1, ...selected, database: resolve(selected.database) }, null, 2) +
      '\n',
    { mode: 0o600 },
  );
  renameSync(temporary, path);
}
export function selectedProject(database: string, explicit?: string): string {
  const value = explicit ?? readSelection(database)?.projectId;
  if (!value)
    throw new LoomplaneError('Provide --project, or run loomplane init in this directory first.');
  return value;
}
export function selectedStream(database: string, explicit?: string): string {
  const value = explicit ?? readSelection(database)?.streamId;
  if (!value)
    throw new LoomplaneError('Provide a stream ID, or run loomplane init / loomplane use first.');
  return value;
}
