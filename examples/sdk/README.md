# Loomplane TypeScript SDK

The SDK talks to a running Loomplane HTTP server and returns the domain types from
`loomplane/types`. It uses the platform `fetch` implementation available in
Node 24 and current browsers.

```ts
import { LoomplaneClient } from 'loomplane/sdk';

const loomplane = new LoomplaneClient({
  baseUrl: 'http://127.0.0.1:4318', // this is the default
  token: process.env.LOOMPLANE_TOKEN,
  timeoutMs: 10_000,
});

const projects = await loomplane.listProjects();
```

Pass `{ signal, timeoutMs }` as the last argument to any method to cancel a
single request or override its timeout. A client-level `signal` cancels every
request made by that instance. Set a timeout to `0` to disable it.

Non-2xx responses throw `LoomplaneApiError`, which carries the HTTP `status`, Loomplane
`code`, message, and parsed response `body`:

```ts
try {
  await loomplane.getPacket('pkt_missing');
} catch (error) {
  if (error instanceof LoomplaneApiError) {
    console.error(error.status, error.code, error.message);
  }
}
```

Write calls are attempted once. The SDK does not retry creates, revisions,
mounts, compiles, status changes, or receipt mutations because repeating those
operations may create new state or hide a stale-version failure.

## Parallel-agent example

Start Loomplane, then run the executable example from a built checkout:

```sh
loomplane serve
LOOMPLANE_URL=http://127.0.0.1:4318 npx tsx examples/sdk/parallel-agents.ts
```

Set `LOOMPLANE_TOKEN` too when the server requires bearer authentication. The
example creates a clearly labeled synthetic project, two streams, shared
context, an exact packet and run receipt. It then revises the producer's
contract and shows the consumer packet becoming stale plus the affected-stream
impact. Every invocation intentionally creates new local example records.

The client covers projects, snapshots, streams, capsules and revisions,
mounts, compilation, packet reads and checks, search, events, export, impact,
run receipts, and synthetic demo creation. `listStreams`, `listCapsules`,
`listMounts`, and `getLatestPacket` are convenience reads assembled from the
server's snapshot or stream-state endpoints.

## Retry a logical write safely

With a v0.2+ server, retain one unique key for each logical POST/PATCH operation:

```ts
const requestId = crypto.randomUUID();
const input = {
  projectId,
  kind: 'constraint' as const,
  title: 'Amount units',
  body: 'Use integer minor units.',
};
const result = await client.publishCapsule(input, { idempotencyKey: requestId });
// If the response was lost, retry this same input with this same requestId.
```

There are no automatic retries. Successful results are replayable for 24 hours under the same credential identity. Reusing the key with different input yields `IDEMPOTENCY_CONFLICT`; a replay returns the historical result, not current capsule state. Expired keys can execute again. Read and delete operations do not gain retry semantics from this option. See [the full contract](../../docs/specs/idempotency.md).
