export type CapsuleKind = 'decision' | 'fact' | 'constraint' | 'question' | 'artifact';
export type CapsuleStatus = 'active' | 'superseded' | 'retracted';
export interface Evidence {
  label: string;
  uri: string;
  excerpt?: string;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}
export interface Stream {
  id: string;
  projectId: string;
  name: string;
  description: string;
  agent: string;
  branch: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}
export interface Capsule {
  id: string;
  projectId: string;
  streamId: string | null;
  key: string;
  kind: CapsuleKind;
  status: CapsuleStatus;
  title: string;
  body: string;
  version: number;
  author: string;
  tags: string[];
  evidence: Evidence[];
  priority: number;
  createdAt: string;
  updatedAt: string;
}
export interface Revision {
  capsuleId: string;
  version: number;
  title: string;
  body: string;
  author: string;
  tags: string[];
  evidence: Evidence[];
  priority: number;
  createdAt: string;
  changeNote: string;
}
export interface Mount {
  id: string;
  streamId: string;
  capsuleId: string;
  mode: 'live' | 'pinned';
  pinnedVersion: number | null;
  createdAt: string;
}
export interface ManifestItem {
  capsuleId: string;
  version: number;
  title: string;
  kind: CapsuleKind;
  mode: 'owned' | 'live' | 'pinned';
  estimatedTokens: number;
}
export interface Conflict {
  key: string;
  capsuleIds: string[];
  titles: string[];
  reason: string;
}
export interface Omission {
  capsuleId: string;
  title: string;
  reason: string;
}
export interface Packet {
  id: string;
  projectId: string;
  streamId: string;
  task: string;
  budget: number;
  estimatedTokens: number;
  text: string;
  manifest: ManifestItem[];
  omitted: Omission[];
  conflicts: Conflict[];
  createdAt: string;
}
export interface PacketSummary extends Pick<
  Packet,
  'id' | 'projectId' | 'streamId' | 'task' | 'budget' | 'estimatedTokens' | 'createdAt'
> {
  capsuleCount: number;
  omittedCount: number;
  conflictCount: number;
}
export interface PacketPage {
  items: PacketSummary[];
  nextCursor: string | null;
}
export interface PacketValueChange<T> {
  before: T;
  after: T;
  changed: boolean;
}
export interface PacketRevisionSnapshot {
  manifest: ManifestItem;
  revision: Revision;
}
export interface PacketCapsuleChange {
  capsuleId: string;
  changes: ('added' | 'removed' | 'revised' | 'mode')[];
  before: PacketRevisionSnapshot | null;
  after: PacketRevisionSnapshot | null;
}
/** Historical comparison only: no assertion of freshness, compatibility, or revalidation. */
export interface PacketDiff {
  projectId: string;
  streamId: string;
  fromPacketId: string;
  toPacketId: string;
  changed: boolean;
  textChanged: boolean;
  unchangedCapsules: number;
  capsuleChanges: PacketCapsuleChange[];
  task: PacketValueChange<string>;
  budget: PacketValueChange<number>;
  estimatedTokens: PacketValueChange<number>;
  manifestOrder: PacketValueChange<string[]>;
  omissions: PacketValueChange<Omission[]>;
  conflicts: PacketValueChange<Conflict[]>;
}
export interface Drift {
  capsuleId: string;
  title: string;
  compiledVersion: number;
  currentVersion: number;
  reason: 'revised' | 'retracted' | 'superseded' | 'unmounted' | 'added' | 'dependency';
  pinned: boolean;
}
export interface StreamState {
  stream: Stream;
  owned: Capsule[];
  mounts: (Mount & { capsule: Capsule })[];
  latestPacket: Packet | null;
  drift: Drift[];
  conflicts: Conflict[];
}
export interface AuditEvent {
  id: number;
  projectId: string;
  type: string;
  entityId: string;
  actor: string;
  data: Record<string, unknown>;
  createdAt: string;
}
export interface Snapshot {
  projects: Project[];
  project: Project | null;
  streams: StreamState[];
  capsules: Capsule[];
  events: AuditEvent[];
  stats: {
    capsules: number;
    streams: number;
    packets: number;
    staleStreams: number;
    mounts: number;
  };
}
export interface CreateProject {
  name: string;
  description?: string;
}
export interface CreateStream {
  projectId: string;
  name: string;
  description?: string;
  agent?: string;
  branch?: string;
  color?: string;
}
export interface PublishCapsule {
  projectId: string;
  streamId?: string | null;
  key?: string;
  kind: CapsuleKind;
  title: string;
  body: string;
  author?: string;
  tags?: string[];
  evidence?: Evidence[];
  priority?: number;
}
export interface ReviseCapsule {
  expectedVersion: number;
  title?: string;
  body?: string;
  author?: string;
  tags?: string[];
  evidence?: Evidence[];
  priority?: number;
  changeNote?: string;
}
export interface CompileInput {
  streamId: string;
  task?: string;
  budget?: number;
}
export interface MountInput {
  streamId: string;
  capsuleId: string;
  mode?: 'live' | 'pinned';
  pinnedVersion?: number;
}
export interface SearchHit {
  capsule: Capsule;
  snippet: string;
  rank: number;
}
export interface ImportResult {
  imported: number;
  skipped: number;
  capsuleIds: string[];
  warnings: string[];
}

/** A caller-reported record. It proves registration, not that a model read or obeyed the context. */
export interface Receipt {
  id: string;
  projectId: string;
  streamId: string;
  packetId: string;
  agent: string;
  status: 'started' | 'completed' | 'abandoned';
  outcome: string;
  gitCommit: string;
  createdAt: string;
  updatedAt: string;
}
export interface PacketCheck {
  ok: boolean;
  packetId: string;
  drift: Drift[];
  conflicts: Conflict[];
  pinnedUpdates: Drift[];
  checkedAt: string;
}

export interface ContextDependency {
  capsuleId: string;
  version: number;
}
export interface Capsule {
  dependencies?: ContextDependency[];
}
export interface Revision {
  dependencies?: ContextDependency[];
}
export interface PublishCapsule {
  dependencies?: ContextDependency[];
}
export interface ReviseCapsule {
  dependencies?: ContextDependency[];
}
export interface Drift {
  dependency?: {
    capsuleId: string;
    title: string;
    expectedVersion: number;
    currentVersion: number;
    status: CapsuleStatus;
  };
}
export interface Impact {
  capsule: Capsule;
  dependentCapsules: Capsule[];
  streams: { stream: Stream; relation: 'owner' | 'direct' | 'transitive'; stale: boolean }[];
  receipts: { receipt: Receipt; check: PacketCheck }[];
}

export interface SourceFingerprint {
  path: string;
  sha256: string;
  bytes: number;
  gitCommit?: string;
}
export interface Evidence {
  fingerprint?: SourceFingerprint;
}
export interface SourceCheck {
  ok: boolean;
  checkedAt: string;
  root: string;
  checked: number;
  findings: {
    capsuleId: string;
    version: number;
    path: string;
    status: 'unchanged' | 'changed' | 'missing' | 'unreadable' | 'outside-root';
    expectedSha256: string;
    actualSha256?: string;
  }[];
}
