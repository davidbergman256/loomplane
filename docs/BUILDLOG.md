# Build log

## 2026-09-18

- Ruling: Loomplane is a context coordination runtime, not a conversation visualization app. The old assessment is retained in archive only.
- Ruling: User's explicit autonomous authorization replaces the skills' approval pauses. New empty project is isolated; initial main branch is authorized as part of repository creation.
- Ruling: Parallel implementation uses separate file ownership and a shared contract. Light outcome checks replace formal TDD/repeated review ceremony per user's instruction.
- Ruling: Public Apache-2.0 core. Enterprise features are a documented roadmap, not represented as implemented.
- Ruling: No account-wide usage-burning goal. Spend effort on substantive milestones; availability of credits is not proof more generated code is valuable.
- Interface review: core produces Store and shared types; UI consumes HTTP only; adapters consume Store; research changes only strategy files. No overlapping implementation file ownership.

### Milestone: local runtime and workspace

- Public repository created at github.com/davidbergman256/loomplane.
- Implemented immutable capsules, typed streams, mounts, bounded packets, exact revision manifests, optimistic writes, project isolation, FTS, HTTP, CLI, MCP, opt-in imports, React workbench.
- Added caller-reported packet-use receipts, blocked stale completion, historical/transitive impact and source fingerprints.
- Fixed two review findings: reactivated omitted context must invalidate old packets; impact must traverse exact historical revision dependencies rather than only today's graph.
- Verified actual core lifecycle, separate SQLite clients, HTTP access boundaries, MCP handshake, explicit source digests and browser create/publish/mount/compile flows. This is prototype evidence, not production qualification.
- Next planned useful expansion: shared-server scoped credentials and remote MCP. Basic security remains open-source; managed enterprise operation is the commercial thesis.

### Milestone: Loomplane 0.1 preview

- Renamed product, repository, package, CLI and configuration to Loomplane after finding exact-name coding-agent collisions with the initial working name. See strategy/naming.md for bounded checks and limitations.
- Added validated atomic project restore, a typed HTTP SDK, remote MCP, scoped reader/writer credentials, live revocation and token-based workbench sign-in.
- Fixed authorization at the mutation boundary after delayed request bodies, uniform denial of foreign resource references, and exact historical source dependency fingerprint checking.
- Verified full TypeScript/build, core lifecycle, source fingerprints, archive restore, scoped HTTP/SSE, local MCP, remote MCP, and SDK flows; exercised documentation onboarding in a fresh directory.
- Browser verification covered personal and authenticated workflows, mobile layout, immutable history, impact, packets and receipts. Production assets use bundled fonts and made zero external HTTP resource requests in the inspected run.
- Docker configuration is provided; Docker is not installed on this host, so the container build has not been exercised here.

### Milestone: adoption and explainability

- Published the complete preview source; the first GitHub CI run passed on commit 70ae5e3.
- Added historical packet comparison across core, CLI, HTTP, SDK, MCP and workbench, plus bounded packet-history cursors that remain stable as new packets arrive.
- Added source-aware re-import: identical records skip, changed managed records create revisions, and local edits surface conflicts.
- Added explicit command runner with private packet files, caller-reported receipt lifecycle, direct argv execution, signal forwarding, and source/packet postflight. Verified CLI argument forwarding and exit-code preservation from a fresh directory.
- Added consistent multi-query SQLite read snapshots and rejection of future database schema versions before mutation. Verified an interleaved writer cannot produce a torn export.
- Workbench browser checks exercised new compilation, historical comparison, revision details and mobile layout; inspected 390px layout had no document overflow.
- Added a static, explicitly synthetic concept demo for GitHub Pages, repository contribution templates, third-party notices, and private vulnerability reporting.

### Milestone: public distribution

- GitHub Pages deployment and complete CI both passed on 9cfd206. Public demo: https://davidbergman256.github.io/loomplane/.
- Published v0.1.0 as a GitHub prerelease with npm-compatible tarball and SHA-256 checksum. It is not published to the npm registry.
- Installed the final tarball in a fresh directory and exercised init, remember, exact context hand-off and command receipt completion. Confirmed bundled workbench and license notices.
- Began the next iteration on safe network write retries, with the implementation contract published to a separate local Loomplane development project and consumed through exact packets by two implementation streams. This is internal use, not customer validation.

### Milestone: v0.2 shared-server reliability

- Added credential-scoped safe retries for JSON POST/PATCH with canonical request fingerprints, historical status/body replay, 24-hour retention and bounded ledger results. Core writes and replay records commit atomically; nested writes use savepoints.
- Added transactional schema-1→2 migration. Portable project format remains version 1 and excludes credentials/replay records. In-place downgrade is not supported.
- Added shared-server command execution through an async runner port. Explicit source fingerprints are fetched as immutable metadata and checked only under the caller’s local root. No file contents are uploaded.
- Verified independent-process contention commits one result/event, real concurrent HTTP replay, body conflict handling, revoked-key denial, old-schema migration, remote CLI hand-off and mid-run contract/source changes.
- Internal development streams consumed the same cap_be17621e08284a3f@1 contract through separate exact packets and completed caller-reported receipts after checking those packets. This demonstrates protocol use, not that the context improved model output or prevented a defect.
- Measured frozen v0.1 source with synthetic 100/500-capsule fixtures. At 500 capsules/30 streams, median snapshot time was 21.885 ms with 1,831,459 JSON bytes; this motivates a smaller workspace payload. See scaling-baseline.md for raw samples and limits.

### Milestone: compact workspace

- Added normalized workspace reads across core, HTTP, SDK and workbench while preserving full snapshot compatibility. Shared capsule objects are sent once; full packets load on demand.
- Same-state synthetic measurement: 500 capsules/30 streams fell from 1,831,459 to 589,898 JSON bytes (67.8% smaller). The initial implementation projects an existing full snapshot; no database CPU or production-capacity improvement is claimed.
- Focused checks verified shape parity, project-scoped access, immutable packet detail, and read-only behavior. Browser checks exercised lazy loading, compile response reuse, history/diff, delayed-response selection and project races, recoverable packet-load errors, scoped readers and a 390px layout.
- All three implementation streams consumed the same workspace contract through exact Loomplane packets and finished caller-reported receipts after a fresh preflight. Internal use remains distinct from customer or model-behavior evidence.
- Added START_HERE.md to connect the usable product, open-source boundary, enterprise thesis, and next validation work.
