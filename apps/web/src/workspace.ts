import type { Capsule, Mount, WorkspaceSnapshot, WorkspaceStream } from '../../../src/core/types';

/** Shared capsule references for rendering; packets deliberately remain summaries. */
export interface StreamView extends Omit<WorkspaceStream, 'ownedIds' | 'mounts'> {
  owned: Capsule[];
  mounts: Array<Mount & { capsule: Capsule }>;
}
export interface WorkspaceView extends Omit<WorkspaceSnapshot, 'streams' | 'format' | 'version'> {
  streams: StreamView[];
}
export function hydrateWorkspace(workspace: WorkspaceSnapshot): WorkspaceView {
  const capsules = new Map(workspace.capsules.map((capsule) => [capsule.id, capsule]));
  function resolve(id: string): Capsule {
    const capsule = capsules.get(id);
    if (!capsule) throw new Error('Workspace context is incomplete. Reload to try again.');
    return capsule;
  }
  return {
    ...workspace,
    streams: workspace.streams.map(({ ownedIds, mounts, ...state }) => ({
      ...state,
      owned: ownedIds.map(resolve),
      mounts: mounts.map((mount) => ({ ...mount, capsule: resolve(mount.capsuleId) })),
    })),
  };
}
