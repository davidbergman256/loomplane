# Compact workbench payload

Status: implemented for the next preview. The v0.1 synthetic baseline produced 1.83 MB of JSON for 500 capsules/30 streams because the full snapshot repeats capsule objects under their owners/mounts and includes entire latest packets.

## Goal and boundary

Reduce transferred/parsing payload while preserving the exact workbench behavior. Keep the existing `Snapshot`, `getStreamState`, and `GET /api/snapshot` contracts for existing integrations. This iteration does not claim reduced database query time, delta synchronization, capsule pagination or concurrency throughput.

## New transport types

`WorkspaceSnapshot` has `format:'loomplane.workspace'`, `version:1`, and the same projects/project/capsules/events/stats fields as Snapshot. Its `streams` are `WorkspaceStream` values:

- `stream: Stream`
- `ownedIds: string[]`, in the existing owned order
- `mounts: Mount[]`, without nested capsule objects
- `latestPacket: PacketSummary|null`, using the existing summary type including capsuleCount
- `drift: Drift[]` and `conflicts: Conflict[]`, unchanged

Every current capsule is serialized once in top-level capsules. Historical revisions stay on their existing detail endpoints. A packet summary never masquerades as a full Packet: text, manifest, omissions and full conflicts are fetched through `GET /api/packets/:id` when the user opens it. Compile results can still supply a full packet directly.

Store `workspaceSnapshot(projectId?): WorkspaceSnapshot` returns a consistent read. A pure exported `compactSnapshot(snapshot:Snapshot):WorkspaceSnapshot` can project the existing coherent snapshot initially. Reuse one `summarizePacket` helper between packet history and workspace summaries. Do not add fake empty packet fields to satisfy old types.

## HTTP and SDK

`GET /api/workspace?projectId=ID` mirrors snapshot selection and authorization. A scoped key sees only its project in both project and projects, and foreign project selection returns the same uniform denial as the legacy route. SDK `workspace(projectId?, options?): Promise<WorkspaceSnapshot>` is additive. Existing methods and the full snapshot endpoint remain unchanged.

## Workbench

Fetch workspace instead of snapshot. Hydrate capsule ID references into shared objects in the browser; use explicit view types whose latestPacket remains PacketSummary. Fetch a full packet only when opening it. Loading/error states must be visible; changing project or selecting another item while a packet fetch is pending must not reveal an obsolete selection. Retain current reader/writer controls, compilation, revision inspector, history/diff, forms, search, drag-connect, and responsive layout.

## Evidence

Use the existing synthetic benchmark shape to compare full and compact JSON from the same state, timing serialization separately. Report observed byte reduction without extrapolating production savings. Check scoped HTTP access, reference hydration and the actual browser open-packet/compile/history flow. Keep checks focused on the payload contract and user-visible behavior.
