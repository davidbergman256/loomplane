# Loomplane API and Store contract

All endpoints below JSON, no /v1 prefix; base `/api`. Errors `{error: string, code: string}`. IDs opaque strings. All timestamps ISO strings. Types in `src/core/types.ts`. Server returns domain objects directly, except lists as stated. Read routes never mutate. POST /demo is explicit and creates idempotent synthetic project.

| Method | Path                            | Body / result                                                              |
| ------ | ------------------------------- | -------------------------------------------------------------------------- |
| GET    | /api/health                     | `{ok:true,version:'0.1.0'}`                                                |
| GET    | /api/snapshot?projectId=ID      | `Snapshot`, defaults first project                                         |
| GET    | /api/projects                   | `Project[]`                                                                |
| POST   | /api/projects                   | `CreateProject` → `Project`                                                |
| POST   | /api/streams                    | `CreateStream` → `Stream`                                                  |
| GET    | /api/streams/:id                | `StreamState`                                                              |
| PATCH  | /api/streams/:id                | `{name?,description?,agent?,branch?,color?}` → `Stream`                    |
| POST   | /api/capsules                   | `PublishCapsule` → `Capsule`                                               |
| GET    | /api/capsules/:id               | `{capsule:Capsule,revisions:Revision[]}` newest revision first             |
| PATCH  | /api/capsules/:id               | `ReviseCapsule` → `Capsule`                                                |
| POST   | /api/capsules/:id/status        | `{status:CapsuleStatus,expectedVersion:number,author?:string}` → `Capsule` |
| POST   | /api/mounts                     | `MountInput` → `Mount`, upsert stream/capsule                              |
| DELETE | /api/mounts/:id                 | `{ok:true}`                                                                |
| POST   | /api/compile                    | `CompileInput` → `Packet`                                                  |
| GET    | /api/packets/:id                | `Packet`                                                                   |
| GET    | /api/search?projectId=ID&q=TEXT | `SearchHit[]`                                                              |
| GET    | /api/events?projectId=ID        | `AuditEvent[]` latest 100                                                  |
| GET    | /api/export?projectId=ID        | portable project object                                                    |
| POST   | /api/demo                       | `{projectId:string}`                                                       |
| GET    | /api/changes                    | SSE `change` event with `{at:string}`, UI refetch snapshot                 |

Store constructor `new Store(path: string)` (`:memory:` works). Import `{ Store } from '../core/store.js'`.
Methods synchronous:

- listProjects(): Project[]; getProject(id): Project; createProject(CreateProject): Project
- createStream(CreateStream): Stream; getStream(id): Stream; listStreams(projectId): Stream[]; updateStream(id, patch): Stream
- publishCapsule(PublishCapsule): Capsule; getCapsule(id): Capsule; listCapsules(projectId): Capsule[]
- reviseCapsule(id, ReviseCapsule): Capsule; getRevisions(id): Revision[]
- setCapsuleStatus(id,status,expectedVersion,author?): Capsule
- mount(MountInput): Mount; unmount(mountId): void; listMounts(streamId): Mount[]
- compile(CompileInput): Packet; getPacket(id): Packet; getLatestPacket(streamId): Packet|null
- getStreamState(id): StreamState; snapshot(projectId?): Snapshot
- search(projectId, query, limit?): SearchHit[]
- events(projectId,limit?): AuditEvent[]; exportProject(projectId): object; close(): void
- findBySource(projectId, sourceUri): Capsule|null for importer dedupe; import adapters can use this.
  Domain errors `LoomplaneError` with `status` and `code`.

MCP tools should wrap Store with zod shapes (SDK registerTool). Use --db or LOOMPLANE_DB or .loomplane/loomplane.sqlite default. API does not automatically import local paths from the browser. CLI accepts explicit import paths. Fixture data synthetic only.

## Run receipts and context preflight

Receipts are caller-reported records of packet use, not model execution or proof of compliance. Start only accepts a currently valid, conflict-free packet. Completed receipt refuses stale context; abandon the old run, refresh/revalidate, and register a new receipt. Completed historical receipts remain history; checking their packet can identify later changes.

- `POST /api/receipts` `{packetId,agent}` → `Receipt`
- `GET /api/receipts?projectId=ID` → `Receipt[]`
- `GET /api/receipts/:id` → `{receipt:Receipt,check:PacketCheck}`
- `PATCH /api/receipts/:id` `{status:'completed'|'abandoned',outcome?,gitCommit?}` → `Receipt`
- `GET /api/packets/:id/check` → `PacketCheck`
- Store `checkPacket(packetId)`, `startReceipt(packetId,agent)`, `getReceipt(id)`, `listReceipts(projectId)`, `finishReceipt(id,{status,outcome?,gitCommit?})`.
- CLI `loomplane check --packet ID` uses exit code 2 when invalid. `loomplane receipt start --packet ID --agent NAME`; `loomplane receipt finish ID --outcome TEXT --commit SHA`.

## Revision-bound derivation and impact

Capsule publication and revision accept `dependencies: [{capsuleId,version}]`. References must exist in the same project; cycles in the current dependency graph are rejected. Each revision retains its own dependencies. If an upstream revision changes or is retracted, packets containing a derived capsule become stale transitively, even if that upstream capsule was not mounted directly. Recompiling a stale derived claim does not revalidate it: publish a reviewed revision with updated dependencies.

`GET /api/capsules/:id/impact` / Store `impact(id)` returns `Impact`: current dependent capsules, direct/transitive consuming streams, and historical run receipts that consumed revision-specific dependencies. Current capsule relationships and historical packet relationships are intentionally distinct.

## Explicit source fingerprints

Evidence may contain `fingerprint:{path,sha256,bytes,gitCommit?}`. Paths are relative and cannot traverse upward. Capture is CLI-only with `loomplane source attach CAPSULE --file FILE --root ROOT --expected-version N`. It stores a SHA-256 digest and path, not source content. `loomplane check --packet ID --root ROOT` also checks source files from that packet's exact revisions. Source verification never writes new capsule revisions.

HTTP/MCP context checks validate database revisions; they do not read local files. Source fingerprints are not automatically refreshed and are not a semantic claim about whether a file change invalidates the context. No fingerprint means no file-level coverage, and callers should inspect the returned checked count.
