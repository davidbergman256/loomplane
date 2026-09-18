# Weft API and Store contract

All endpoints below JSON, no /v1 prefix; base `/api`. Errors `{error: string, code: string}`. IDs opaque strings. All timestamps ISO strings. Types in `src/core/types.ts`. Server returns domain objects directly, except lists as stated. Read routes never mutate. POST /demo is explicit and creates idempotent synthetic project.

| Method | Path | Body / result |
|---|---|---|
| GET | /api/health | `{ok:true,version:'0.1.0'}` |
| GET | /api/snapshot?projectId=ID | `Snapshot`, defaults first project |
| GET | /api/projects | `Project[]` |
| POST | /api/projects | `CreateProject` → `Project` |
| POST | /api/streams | `CreateStream` → `Stream` |
| GET | /api/streams/:id | `StreamState` |
| PATCH | /api/streams/:id | `{name?,description?,agent?,branch?,color?}` → `Stream` |
| POST | /api/capsules | `PublishCapsule` → `Capsule` |
| GET | /api/capsules/:id | `{capsule:Capsule,revisions:Revision[]}` newest revision first |
| PATCH | /api/capsules/:id | `ReviseCapsule` → `Capsule` |
| POST | /api/capsules/:id/status | `{status:CapsuleStatus,expectedVersion:number,author?:string}` → `Capsule` |
| POST | /api/mounts | `MountInput` → `Mount`, upsert stream/capsule |
| DELETE | /api/mounts/:id | `{ok:true}` |
| POST | /api/compile | `CompileInput` → `Packet` |
| GET | /api/packets/:id | `Packet` |
| GET | /api/search?projectId=ID&q=TEXT | `SearchHit[]` |
| GET | /api/events?projectId=ID | `AuditEvent[]` latest 100 |
| GET | /api/export?projectId=ID | portable project object |
| POST | /api/demo | `{projectId:string}` |
| GET | /api/changes | SSE `change` event with `{at:string}`, UI refetch snapshot |

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
Domain errors `WeftError` with `status` and `code`.

MCP tools should wrap Store with zod shapes (SDK registerTool). Use --db or WEFT_DB or .weft/weft.sqlite default. API does not automatically import local paths from the browser. CLI accepts explicit import paths. Fixture data synthetic only.
