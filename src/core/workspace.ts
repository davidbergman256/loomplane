import type { Packet, PacketSummary, Snapshot, WorkspaceSnapshot } from './types.js';

export function summarizePacket(packet: Packet): PacketSummary {
  return {
    id: packet.id,
    projectId: packet.projectId,
    streamId: packet.streamId,
    task: packet.task,
    budget: packet.budget,
    estimatedTokens: packet.estimatedTokens,
    createdAt: packet.createdAt,
    capsuleCount: packet.manifest.length,
    omittedCount: packet.omitted.length,
    conflictCount: packet.conflicts.length,
  };
}

/** Pure projection of a coherent full snapshot; retained records are shared, not deep-cloned. */
export function compactSnapshot(snapshot: Snapshot): WorkspaceSnapshot {
  return {
    format: 'loomplane.workspace',
    version: 1,
    projects: snapshot.projects,
    project: snapshot.project,
    capsules: snapshot.capsules,
    events: snapshot.events,
    stats: snapshot.stats,
    streams: snapshot.streams.map((state) => ({
      stream: state.stream,
      ownedIds: state.owned.map((capsule) => capsule.id),
      mounts: state.mounts.map(({ capsule: _capsule, ...mount }) => mount),
      latestPacket: state.latestPacket ? summarizePacket(state.latestPacket) : null,
      drift: state.drift,
      conflicts: state.conflicts,
    })),
  };
}
