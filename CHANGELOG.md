# Changelog

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
