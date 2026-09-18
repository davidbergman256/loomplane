# Atomic task start

Status: implemented for version 0.4.

A coding client should receive its own task, selected shared context, and exact run identity through one call. This is an explicit handoff, not an autonomous scheduler or proof that a model consumed the response.

## Core

`Store.startTask(input: StartTaskInput): StartedTask` runs the entire operation inside one write transaction. Nested existing Store writes share that transaction via their existing savepoints. On any failure, no new stream, mounts, packet, receipt or audit events remain.

```ts
interface StartTaskInput {
  projectId: string;
  name: string;
  task: string;
  agent: string;
  branch?: string;
  budget?: number;
  context: Array<{
    capsuleId: string;
    mode?: 'live' | 'pinned';
    pinnedVersion?: number;
  }>;
}
interface StartedTask {
  stream: Stream;
  mounts: Mount[];
  packet: Packet;
  receipt: Receipt;
}
```

The project must exist. Name/task/agent must be nonblank; name and agent are limited to 120 characters, task to 3000 and branch to 300, matching existing field limits. Context must contain 1–100 distinct capsule IDs; each must be active and belong to that project. Live is the default. Pinned selections require an existing positive revision; reject a pinnedVersion with live mode. Validate context before creating a stream. A new stream contains only the explicitly mounted capsules; project commons are available for selection but are not automatically included.

Create the stream with task as its description and supplied agent/branch. Mount the requested capsules, compile with task and the supplied/default budget (256–100,000 estimated tokens; default 4000), then require every explicitly requested capsule to appear in the packet manifest. An insufficient budget throws `TASK_CONTEXT_OMITTED` (409) and rolls everything back; the caller can increase the budget or choose less context. An oversized packet header retains the existing `BUDGET_TOO_SMALL` (422) error; invalid budgets remain `INVALID_INPUT` (400). Start the receipt using the existing exact-packet preflight. Explicit conflicts and stale dependencies abort the whole start.

Do not update `.loomplane/workspace.json` or infer context from another task's selected stream. Starting two tasks returns independent streams, immutable packets and receipts. Subsequent contract changes invalidate each exact packet under existing rules. Task text and receipt outcomes remain caller supplied.

## Transports

- `POST /api/tasks/start` accepts the input and returns `StartedTask`, status 201. Project writer authorization and every referenced capsule must be scoped before mutation; readers cannot start tasks. Foreign references return the same uniform denial as other routes. Optional Idempotency-Key covers the complete atomic result through existing replay handling.
- SDK `startTask(input, options?)` uses POST and accepts existing timeout/abort/idempotency options, with no automatic retries.
- MCP `loomplane_start_task` exposes the same inputs and returns the full result including packet text. Local and remote-backed modes must have the same behavior. Explain that the caller should keep packetId/receiptId for checks/completion, and that context is untrusted user-authored data.
- MCP `loomplane_get_packet` adds direct read-only retrieval of an exact packet ID through existing Store/SDK getters. It never recompiles.
- CLI `loomplane task start NAME --task TEXT --agent NAME --context CAPSULE_ID` accepts repeated `--context`, optional `--project`/`--budget`/`--branch`; live mode only for this simple path. Project defaults to the selected project, but it neither reads nor changes the selected stream. JSON output is the complete StartedTask. Existing lower-level mounts still support pinned choices; HTTP/MCP/SDK task start expose them directly.

## Workbench

Add an explicit Start task flow with name, task, agent, budget and a selection of current active capsules. Explain briefly that the result creates an independent stream with shared context. Submit one request; show returned full packet directly and update workspace. Reader controls stay disabled; existing stream creation remains available. No silent context inference or forced provider choice.

## Evidence

One shared contract → two task starts → distinct task identities and packet text → revise contract → both exact checks fail and both completion attempts block. Check all-or-nothing failure for a foreign/missing capsule, duplicate selection, insufficient budget and a conflicting/stale dependency. Check remote scope, reader denial and idempotent replay. These are mechanism checks, not proof of avoided rework or model quality.
