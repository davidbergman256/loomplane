import { isDeepStrictEqual } from 'node:util';
import { invariant } from './errors.js';
import type {
  Conflict,
  ManifestItem,
  Omission,
  Packet,
  PacketCapsuleChange,
  PacketDiff,
  PacketRevisionSnapshot,
  PacketValueChange,
  Revision,
} from './types.js';

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const change = <T>(before: T, after: T): PacketValueChange<T> => ({
  before,
  after,
  changed: !isDeepStrictEqual(before, after),
});
const orderedOmissions = (items: Omission[]) =>
  [...items].sort((a, b) => compareText(a.capsuleId, b.capsuleId));
function orderedConflicts(items: Conflict[]): Conflict[] {
  return items
    .map((item) => {
      const entries = item.capsuleIds
        .map((id, index) => ({ id, title: item.titles[index] }))
        .sort((a, b) => compareText(a.id, b.id));
      return {
        ...item,
        capsuleIds: entries.map((entry) => entry.id),
        titles: entries.map((entry) => entry.title),
      };
    })
    .sort((a, b) => compareText(a.key, b.key));
}

/** Compare recorded snapshots without consulting current capsules, mounts, or source files. */
export function comparePacketSnapshots(
  from: Packet,
  to: Packet,
  resolveRevision: (capsuleId: string, version: number) => Revision,
): PacketDiff {
  invariant(
    from.projectId === to.projectId,
    'Packets belong to different projects',
    400,
    'PROJECT_MISMATCH',
  );
  invariant(
    from.streamId === to.streamId,
    'Packets belong to different streams',
    400,
    'STREAM_MISMATCH',
  );
  const before = new Map(from.manifest.map((item) => [item.capsuleId, item]));
  const after = new Map(to.manifest.map((item) => [item.capsuleId, item]));
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort(compareText);
  const capsuleChanges: PacketCapsuleChange[] = [];
  let unchangedCapsules = 0;
  const snapshot = (item: ManifestItem | undefined): PacketRevisionSnapshot | null =>
    item ? { manifest: item, revision: resolveRevision(item.capsuleId, item.version) } : null;
  for (const capsuleId of ids) {
    const previous = before.get(capsuleId);
    const next = after.get(capsuleId);
    const changes: PacketCapsuleChange['changes'] = [];
    if (!previous) changes.push('added');
    else if (!next) changes.push('removed');
    else {
      if (previous.version !== next.version) changes.push('revised');
      if (previous.mode !== next.mode) changes.push('mode');
    }
    if (changes.length)
      capsuleChanges.push({
        capsuleId,
        changes,
        before: snapshot(previous),
        after: snapshot(next),
      });
    else unchangedCapsules++;
  }
  const task = change(from.task, to.task);
  const budget = change(from.budget, to.budget);
  const estimatedTokens = change(from.estimatedTokens, to.estimatedTokens);
  const manifestOrder = change(
    from.manifest.map((item) => item.capsuleId),
    to.manifest.map((item) => item.capsuleId),
  );
  const omissions = change(orderedOmissions(from.omitted), orderedOmissions(to.omitted));
  const conflicts = change(orderedConflicts(from.conflicts), orderedConflicts(to.conflicts));
  const textChanged = from.text !== to.text;
  return {
    projectId: from.projectId,
    streamId: from.streamId,
    fromPacketId: from.id,
    toPacketId: to.id,
    changed:
      capsuleChanges.length > 0 ||
      textChanged ||
      task.changed ||
      budget.changed ||
      estimatedTokens.changed ||
      manifestOrder.changed ||
      omissions.changed ||
      conflicts.changed,
    textChanged,
    unchangedCapsules,
    capsuleChanges,
    task,
    budget,
    estimatedTokens,
    manifestOrder,
    omissions,
    conflicts,
  };
}
