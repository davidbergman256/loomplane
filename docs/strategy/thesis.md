# Parallel context as infrastructure

September 18, 2026 · Founder decision memo

## The bet

An agent’s conversation is a workspace, not the natural ownership boundary for everything it learns. Independent streams should share small, explicit dependencies without importing one another’s entire histories. The initial failure to solve is concrete: an API agent changes a contract while frontend and test agents continue building against its previous meaning.

**Loomplane gives shared assumptions identities, revisions, subscribers, and a record of which revision each compiled task packet contained.** The initial product exposes affected consumers when an assumption changes. The eventual product connects that signal to the actual agent run, review, and release process.

“Parallel context” is our product framing, not a claim to have invented independent agents or a recognized new technical standard. More context is not intrinsically better. Some work should stay serial; some assumptions should stay pinned; some disagreements should remain unresolved until an owner decides.

## Five different businesses we could build

| Angle                                   | Initial buyer and job                                               | Commercial path                                                      | Main reason to choose or reject                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal context workspace              | Individual developer reconnecting abandoned agent sessions          | Paid sync and convenience                                            | Easy demo, weak enterprise pull, heavy competition from IDE memory. Keep local usability; do not make this the company thesis.              |
| Context dependency infrastructure       | Agent-heavy engineering team coordinating API, UI, and test changes | Managed coordination and governance across repositories and runtimes | **Choose.** A specific failure, observable workflow, and path from individual install to platform owner. Value still unproven.              |
| Semantic merge assistant                | Release engineer resolving contradictions between agent branches    | Per repository or engineering team                                   | Attractive future feature, but reliable semantic conflict detection is a harder research problem than version drift. Do not promise it now. |
| Context provenance and release evidence | Platform/security team reconstructing what an agent was given       | Enterprise controls, retention, evidence export                      | Strong budget owner but slower procurement; current local log is insufficient. Expansion after actual usage.                                |
| Organization memory API                 | Any business agent retrieving company knowledge                     | Consumption-based memory service                                     | Large ambition but directly crowded by memory and context vendors. Too broad to distinguish this prototype.                                 |

We choose context dependencies because the first credible proof is small: publish v1, record two consumers, change to v2, identify exactly the stale consumers. The more ambitious proof is valuable rework avoided on real changes. We must establish both before presenting a platform story as inevitable.

## Entry point and buyer

Recruit 5–30 engineer software companies already using multiple agents or independent sessions for changes spanning interfaces. Favor API/SDK migrations, shared-schema work, and frontend/backend changes: their dependencies can be declared and judged. Do not start with all organizational knowledge or heavily regulated deployments.

The user is a developer or technical lead. The first budget owner is the engineering lead losing time to coordination and review. The expansion buyer is the platform team managing multiple agent vendors. A team that uses one tool with satisfactory built-in coordination is a poor initial prospect.

Positioning: **“Know which agent tasks are building on an assumption that changed.”**

The adoption unit is one shared contract and two consuming streams. Installation must not require replacing the IDE, orchestrator, task tracker, model provider, or source repository. CLI and MCP make consumption available; adapters and habits must make it happen. MCP compatibility alone is neither distribution nor a moat.

## Product staircase

| Stage                      | Capability and evidence required                                                                                                                                    | What this unlocks                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current core               | Capsules and exact transitive revision dependencies, bounded packets, drift checks, receipts, opt-in source fingerprints, export/restore                            | Reproduce the mechanism and recover portable history. Receipt completion rejects stale tracked context; source checks require explicit local filesystem access. |
| Current team prototype     | Single-server SQLite, typed HTTP SDK, local stdio MCP or stdio MCP backed by the remote API, project-scoped reader/writer credentials and revocation, token sign-in | Separate clients coordinate through one server. This is shared access, not distributed synchronization, human identity, or inherited source permissions.        |
| Workflow proof             | Exercise two actual coding-agent clients; reliably invoke checks/receipts; observe resulting review and revalidation                                                | Measure coverage and useful corrections. Protocol tests do not establish unattended client adoption or customer value.                                          |
| Managed team service       | Operated synchronization, human membership, source permissions, managed backup/recovery, monitoring, support                                                        | Prospective paid operation. Basic scoped keys and portable restore already belong to the free core.                                                             |
| Organization control plane | Authorized cross-project publication, policy, retention, regional/private deployment, release evidence                                                              | Platform budget and larger contracts, contingent on working controls and customer demand.                                                                       |

Keep transport of knowledge separate from scheduling agents. A capsule can be produced by a person, a coding agent, or a retrieved source. Retrieval systems can supply candidate context; Loomplane records what was selected and what depended on it. Discovery and dependency tracking can coexist.

## What could become defensible

The data model is copyable. The open protocol should be copyable. A graph UI, SQLite database, MCP server, token estimate, and history table are not meaningful barriers.

The potential advantage is earned through (1) dependable integrations at the point agents consume and finish work, (2) team-maintained dependencies and policies that become useful institutional infrastructure, and (3) a permissioned corpus of failure cases and evaluations that improves selection and alert quality. Do not depend on collecting proprietary code or silently training on customer data.

Portability limits coercive lock-in, deliberately. Customers should renew because operating the service and reproducing its reliability costs more than the subscription. Open artifacts can build ecosystem adoption, but a network effect is only a hypothesis until third-party producers and consumers emerge.

The existential competitive test: if a team can get the same outcome by adding a simple hook to its existing IDE or Beads workflow, integrate there or narrow the product. Do not answer with a larger graph.

## Hard limits to preserve

A manifest proves what a packet contained, not what the model read, understood, or obeyed. Revision drift is not semantic incompatibility. A refreshed packet does not prove completed code was revalidated. A pinned old revision can be intentional. Source fingerprints cover only explicitly attached files checked under a supplied root; a remote database check does not inspect the agent’s filesystem. Scoped service keys are not verified human identities. Conflict detection by explicit keys is not general contradiction detection. These distinctions belong in both the product and the sales conversation.
