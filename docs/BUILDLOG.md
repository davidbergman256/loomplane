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
