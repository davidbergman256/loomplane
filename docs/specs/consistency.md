# Consistent Store reads

Composite Store reads use a synchronous SQLite read transaction. Every query in one call sees the same committed database snapshot, established by its first read. A concurrent client can commit a change while that call runs; the next call can see it.

This applies to packet checks, stream state, project snapshots, impact traversal, portable exports, search results and their capsules, packet comparisons, and the public list/history reads that also check their parent resource. Single-query reads already receive SQLite statement consistency. `listPackets` retains its stream-scoped cursor and limit behavior; separate pages are separate snapshots.

The private `readSnapshot` helper uses deferred `BEGIN`, not `BEGIN IMMEDIATE`. Under the configured WAL journal mode, a reader does not reserve the writer lock. Nested reads reuse the existing transaction via `DatabaseSync.isTransaction`. In particular, receipt preflight checks remain inside the write transaction that records the receipt; they do not start or commit an inner transaction. Existing writes still use `BEGIN IMMEDIATE` and retain expected-version checks. Exceptions roll back the transaction opened by the helper.

The boundary is one synchronous Store call. It does not combine separate API calls into one transaction, freeze filesystem evidence, guarantee freshness after return, or prove a packet's content is correct. Long reads can retain older WAL pages until their transaction ends; the prototype has no streaming transaction API.

## Opening databases

The constructor checks an existing `schema_version` before changing journal mode or creating tables. It accepts exactly one version row with value `1`; unknown versions are rejected with `SCHEMA_VERSION`, and the connection is closed on failure. Supported/new database initialization is atomic. This is a version guard, not a migration framework or a schema-integrity audit.

## Regression scenario

`npm run smoke:consistency` uses two real Store connections to one temporary WAL database. A hook commits a capsule revision through the writer between the reader's export queries. The export must retain the old capsule, old revision history and old events as a valid portable bundle, while the following read sees the new revision. The scenario also checks nested receipt reads, exception cleanup and rejection of a stale writer. A second case verifies that opening a future-version database leaves its bytes, journal mode and schema unchanged.
