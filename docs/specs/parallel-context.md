# Weft: parallel context for software teams

## Product thesis
A conversation is one serialization of work, not the boundary of its knowledge. Parallel agents need independent working contexts connected by shared, versioned facts, decisions, contracts, and constraints. Weft makes those pieces addressable and compiles a small context packet for each task. Agents can disagree without silently overwriting each other; consumers can see when a dependency changes.

The wedge: prevent agents shipping changes based on stale cross-task assumptions. The expansion: an organization-wide context coordination layer across agents, repositories, and teams. The mechanism is versioning and dependency invalidation, not a claim to have solved model reasoning or invented parallel agents.

## First complete slice
Run local app with synthetic demo; create project and parallel streams; publish a context capsule with evidence; mount capsule into another stream; compile bounded packet and record exact revision manifest; revise shared capsule; surface stale packets and affected streams; inspect diff; refresh affected stream; expose through CLI and MCP. No model API key required. Real log import is opt-in and local; nothing scans home directories automatically.

## Vocabulary and invariants
- Project: isolation boundary for context. One local database can contain many projects.
- Stream: an independently scoped line of work, associated with an agent and optionally a Git branch.
- Capsule: addressable knowledge of type decision, fact, constraint, question, or artifact; stable ID with immutable revisions.
- Revision: full text, title, author, evidence, tags, priority, timestamp and monotonically increasing version. Never edit history in place.
- Mount: subscription from a stream to capsule, either latest or pinned revision. Latest changes produce drift in prior packets; pins remain reproducible but show newer revisions.
- Packet: deterministic compiled working context plus exact revision manifest, omitted items, conflicts, and estimated token counts. Budget accounting includes the entire generated text. Never advertise estimate as provider billing count.
- Conflicts: explicit overlapping semantic keys with differing active values, surfaced rather than arbitrarily resolved. Automatic natural-language contradiction detection is not implemented.
- Audit events: local append-only application log; not tamper-proof compliance evidence.

Every relationship stays inside a project. Stale writes require expectedVersion and return 409. Transactions contain the revision and corresponding event. Read endpoints must not mutate. Local mode binds to loopback. Importers preserve source references and report rejected input without running it. Only synthetic fixtures may be committed.

## Storage and transport
Node 24+ built-in SQLite in WAL mode, FTS5 search, typed TypeScript domain methods, HTTP JSON with SSE changes, React/Vite UI, stdio MCP, CLI. SQLite is a deliberate single-node prototype; scale-out synchronization and enterprise identity are future products, not current capabilities. Files, packets and portable exports are available without a paywall. No proprietary enterprise directory until proprietary enterprise functionality exists.

## UX
A calm dense workbench: project navigation at left, parallel streams in the center, evidence/revisions in an inspector. Light mineral background, ink text, deep blue primary, restrained purple/coral/teal stream colors. Visually explain knowledge crossing stream boundaries. Empty state and demo clearly distinguished. Useful without a graph; graph is a secondary projection. Real actions: create, publish, mount, compile, revise, inspect, search, export. Never simulate running agents.

## Business boundaries
Apache-2.0 core including local CLI, storage, protocol, UI, imports, versioning, small-team self-host. Future commercial offering: managed sync, identity and source authorization, audit export/retention, regional/private deployment, policy, support, and operational guarantees. Price hypotheses and revenue scenarios must be labeled as assumptions. No fabricated customers, benchmark wins, market size, or traction.

## Authorization and execution
User explicitly requested autonomous decisions, a new GitHub repository, and execution without approval pauses. Old assessment is archived as superseded, not the design authority. Prioritize concrete product progress and cheap meaningful verification over test ceremony or generated line counts. Use independent agents on separated file ownership to work in parallel.
