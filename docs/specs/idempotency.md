# Safe retries for shared-server writes

Implemented in v0.2.0. This feature is absent from v0.1.0.

A client may lose the response after the server commits a capsule, packet, or receipt. Repeating that logical write should return its original result instead of duplicating it. This requires a durable transaction that covers both the domain mutation and its replay record.

## Contract

- Optional `Idempotency-Key` on supported JSON POST/PATCH routes. 1–128 ASCII letters, digits, dot, underscore, colon or hyphen. No automatic client retries.
- A key is scoped to the authenticated credential identity (or separate local/admin instance scopes), not merely its project. Never store raw credentials. Authentication and resource authorization run on every request, including replays.
- Reusing a key with the same method, exact route, and canonical JSON body returns the committed original JSON result and original status. Object key order is insignificant; array order is significant.
- Reusing it for a different operation/body within the retention window returns 409 `IDEMPOTENCY_CONFLICT` without mutating.
- Response header `Idempotency-Replayed` is `true` for a replay, `false` for the first recorded write. A replay returns historical output; it is not a fresh read.
- Retain successful replay entries for 24 hours. Expired keys may be used again and can perform another mutation. Failed/rolled-back mutations do not reserve keys. The server clock determines retention.
- Cap active records at 10,000 per scope and serialized results at 1 MiB. Exhaustion returns a clear error before committing. This is a prototype bound, not a published hosted-service quota.
- Replays are serialized by SQLite write transactions across processes. No asynchronous callback runs inside that transaction. A crash before commit leaves neither mutation nor successful replay entry; a crash after commit preserves both.
- DELETE/GET do not accept retry semantics in this iteration. The SDK passes explicit keys only for write methods; no retries are automatic. DELETE with a supplied key is rejected clearly.

## Store and migration

`Store.idempotent(input, operation)` accepts `{scope,key,operation,fingerprint}` and a synchronous JSON-producing callback, returning `{value,replayed}`. `operation` identifies method + path; `fingerprint` is a SHA-256 digest of canonical JSON. A core helper exposes canonical fingerprinting so callers use one implementation. Nested write operations must use savepoints or join the outer transaction safely; callback failures must never leave partially committed changes.

Schema version 2 adds the replay ledger. Migrate version 1 transactionally, create new databases at version 2, and reject unknown future versions before mutation. The v0.1 application already rejects a newer schema; do not claim downgrade support. Project archives retain format version 1 and omit credential-scoped replay entries. Restoring project history does not restore a previous server's retry window.

The HTTP SDK adds optional `idempotencyKey` to request options. The server hashes canonical bodies after reading them and rechecking the current principal, then executes the route's synchronous domain mutation through the ledger. Supported writes keep their existing response status and shape.

## Verification

Use actual two-client HTTP requests: duplicate success yields one domain event; equivalent JSON object order replays; changed body conflicts; a revoked credential cannot replay; distinct credentials cannot read each other's cached response; invalid/failed writes can be corrected with the same key; an older schema migrates without losing context. A direct Store race from two processes should converge on one committed result. Avoid adding automatic network retries until retry policy is separately specified.
