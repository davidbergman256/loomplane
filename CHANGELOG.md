# Changelog

## 0.4.0 — independent task handoff

- Start independent work in one atomic operation: create a stream, connect explicit shared capsules, compile the exact packet, and register a caller-reported receipt. Available in the CLI, HTTP SDK, local/remote MCP and workbench.
- Requested context must fit and pass tracked-revision preflight; any failure rolls back the entire handoff. HTTP/SDK retries can use explicit idempotency keys. Task start does not execute a model or change the directory's selected stream.
- Added exact packet retrieval to MCP and a two-client integration walkthrough.
- Replaced recursive core dependency walks after a valid 6000-node chain exposed a call-stack crash. Historical revisions, dependency order and pinned semantics are preserved; no production capacity guarantee is implied.

## 0.3.0 — compact workspace

- The workbench uses a normalized workspace response with shared capsule references and packet summaries. Full immutable packets load when opened, with visible loading/errors and protection against obsolete selections.
- Added `GET /api/workspace`, `Store.workspaceSnapshot`, and SDK `workspace` without changing legacy snapshot APIs. Project-scoped access rules remain the same.
- A 500-capsule/30-stream synthetic fixture falls from 1,831,459 to 589,898 JSON bytes (67.8% smaller). This is a payload measurement, not a production capacity or database CPU claim.
- Added a founder brief and reproducible comparison notes. Database schema remains version 2.

## 0.2.0 — shared-server reliability

- Optional credential-scoped idempotency keys return the original result when a JSON POST/PATCH write is retried within 24 hours. Domain mutations and their replay records commit atomically, including across processes.
- Schema version 1 migrates transactionally to version 2. Export before upgrading if you need a portable pre-upgrade archive; in-place downgrade is not supported.
- The command runner can use an authenticated shared server, while optional source fingerprint checks still read only files under an explicitly chosen local root.
- Internal development used two Loomplane streams and exact shared-contract packets. This is internal use, not customer validation.

## 0.1.0 — first public preview

Loomplane starts with one concrete coordination problem: an agent changes a shared contract while other tasks are still using its old revision.

- Independent streams share versioned capsules through live or pinned subscriptions.
- Bounded context packets record exact inputs, omissions, explicit conflicts, and transitive revision dependencies.
- Preflight checks and caller-reported run receipts identify stale tracked assumptions.
- Historical packet comparison explains changes without claiming semantic validation.
- An explicit command wrapper supplies packet files and checks freshness before recording completion.
- A local workbench, CLI, typed HTTP SDK, and local/remote-backed MCP expose the same model.
- Explicit Markdown and coding-session imports preserve history and refuse to overwrite locally edited capsules.
- Optional source fingerprints compare specific files under a chosen root.
- Project-scoped reader/writer keys support shared-server use and live revocation.
- Validated archives restore project history atomically into another database.

The core is Apache-2.0. This preview is a single-server prototype, not a managed enterprise service. See README for installation and current boundaries, and docs/strategy for the commercial thesis.
