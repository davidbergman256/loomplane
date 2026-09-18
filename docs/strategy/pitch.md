# Pitch and demonstration

September 18, 2026. Draft language for founder use; not submitted anywhere. Current implementation status should be checked against the repository’s latest verification report before recording a demo or sending an application.

## One line

**Loomplane keeps parallel coding agents aligned when shared assumptions change.**

Application description under 50 characters: **Shared context for parallel coding agents**

## Thirty-second pitch

When one coding agent changes an API contract, other agents can keep building against the old version. Loomplane gives shared decisions a version and records which revision each task received. When the decision changes, it shows the affected tasks and can reject their completion receipt until tracked context is refreshed. We have an open-source prototype for individuals and teams sharing one server. The company we want to build operates this coordination layer across an organization’s agents, repositories, and model vendors.

## YC-style answers

**What are you making?**

We are building the dependency layer for agent context. Developers publish decisions, facts, and contracts as versioned capsules. Independent work streams subscribe to the capsules they need. Loomplane compiles a scoped packet with exact revisions and shows when it becomes stale. A CLI, typed HTTP SDK, local or remote-backed MCP, and workbench let existing coding tools use the same system.

**What do you understand that others might miss?**

Getting an agent the right context once is only half the problem. In parallel work, the right context can change while another task is using it. Our hypothesis is that selected context needs a lifecycle similar to a software dependency: an identity, revision, consumer record, and explicit response to change. We do not need to own the model or the agent scheduler to provide that lifecycle.

**Why now?**

Agent tools already run independent work and share context: see [Cursor Projects](https://cursor.com/docs/agent/projects) and [Claude Code teams](https://code.claude.com/docs/en/agent-teams). That makes cross-task coordination a practical workflow to investigate. It also means incumbents are serious competitors, not proof of an uncontested market. Our opportunity depends on teams needing explicit revision tracking across tools.

**Who are the competitors?**

Beads/Gas Town, native agent IDE coordination, Letta, memory/context providers, and the team’s existing Git/shared-file workflow. Shared memory, versioning, and graphs are not new. We are testing whether the complete revision-to-consumer-to-revalidation workflow solves a problem these teams still handle manually. See the [source-backed landscape](competition.md).

**How far along are you?**

There is an open-source single-server TypeScript/SQLite prototype with versioned capsules, transitive revision dependencies, bounded packets, stale checks, caller-reported receipts, opt-in local source fingerprints, and portable export/restore. It has a CLI, typed HTTP SDK, local or remote-backed MCP, project-scoped reader/writer keys with revocation, and token sign-in. A synthetic demonstration illustrates a contract changing under consumers. Managed synchronization, SSO, source-document permissions, and production enterprise operation are not implemented. This is not proof of customer value, measured productivity improvement, security readiness, or scale. No customers, revenue, or traction are claimed in this packet.

**How will you make money?**

Keep the usable core Apache-2.0. Charge organizations for a managed shared service, identity and source authorization, policy, retention, deployment options, support, and reliability after those capabilities exist. Initial price tests range from a $300 monthly team workspace to enterprise annual contracts. These are hypotheses, not current sales.

**How big could it become?**

The expansion is an organization-wide context coordination control plane. The [bottom-up scenario](business-model.md) reaches $104m ARR only if 5,000 small teams, 2,000 business workspaces, and 500 enterprises pay the assumed prices. That is a hurdle to validate, not an estimate of an established market.

Founder biography, team history, incorporation, ownership, commitment, and fundraising details require factual founder input. Do not invent them. This packet is not a completed application.

## A credible three-minute demo

| Time      | Show                                                                                            | Say                                                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:25 | Three independent streams: API, UI, and metering                                                | “These are separate lines of work. They need one shared agreement, not every conversation.”                                            |
| 0:25–0:55 | A capsule describing a money-response contract, with evidence and revision 1                    | “The API team publishes this once. Each consumer explicitly subscribes.”                                                               |
| 0:55–1:20 | Compile the UI packet; open its exact revision manifest; start a receipt                        | “This is the context selected for this run. The receipt is a caller’s report, not proof of model behavior.”                            |
| 1:20–1:50 | Revise the shared contract from a fixed two-decimal assumption to an explicit currency exponent | “The agreement changed while other work was in progress.”                                                                              |
| 1:50–2:15 | Stale consumers and revision comparison; run a check and attempt stale receipt completion       | “We can identify the recorded consumers and reject this completion record while their context is stale.”                               |
| 2:15–2:40 | Compile a new packet, inspect the change, start a replacement receipt                           | “The developer or agent must review and revalidate its work. Refreshing the packet alone does not verify the code.”                    |
| 2:40–3:00 | Authenticated remote client and portable export                                                 | “This is a single-server team prototype. Managed operation, enterprise identity, and inherited source permissions remain future work.” |

Optional technical follow-on: sign in with a project reader key, show that writes are denied, switch to a writer, and connect the remote-backed MCP client. Export and restore into a fresh local database. Separately run a fingerprint check against explicitly attached files; remote packet checks do not read the client filesystem.

Run it against a fresh synthetic project. If the seeded demo already begins at revision 2, explain that it is a prepared drift example or reset before recording. Show real actions and actual exit results; do not simulate agent activity. A successful demo proves the mechanism, not that it prevented a real production defect.

## Investor questions to answer next

Why will developers maintain the dependencies? How often does this failure occur? Does another service improve on a native hook? What fraction of runs actually check their packets? Who owns the budget? What survives when IDE vendors add revision tracking? Those answers must come from pilots, not a more elaborate vision slide.
