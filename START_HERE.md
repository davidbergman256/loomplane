# Loomplane: founder brief

**The company bet: shared assumptions should have dependencies, just like code.**

Independent coding agents need their own working contexts. When an API contract, schema, or engineering decision changes, the other tasks using it need to know. Loomplane records that shared context as versioned capsules, compiles exact inputs for a task, and identifies consumers whose assumptions changed.

The entry point is one shared contract and two independent tasks. The ambition is an organization-wide coordination layer across coding agents, repositories, and model vendors.

## Try it first

- [One-minute interactive concept demo](https://davidbergman256.github.io/loomplane/) — explicitly synthetic, no installation.
- [Installable previews](https://github.com/davidbergman256/loomplane/releases) — real local runtime, Node.js 24+.
- [Source and quick start](README.md) — workbench, CLI, SDK and MCP configuration.
- [Thirty-second pitch and YC-style answers](docs/strategy/pitch.md).

The original conversation-graph assessment is archived. This product is a context dependency runtime with a workbench, not a continuation of that proposal.

## What exists

The open-source runtime includes independent streams, immutable revisions, live/pinned subscriptions, bounded context packets, transitive drift, historical packet comparisons, source fingerprints, explicit imports, portable export/restore and run receipts. It has a workbench, CLI, local/remote-backed MCP, HTTP SDK, project-scoped access keys and a local/shared-server command wrapper. Durable retry keys protect supported shared-server writes from duplication after a lost response.

One atomic task-start call now connects a new independent task to selected shared context and returns its packet and receipt. This works in the terminal, SDK, MCP and workbench; it registers the handoff without launching a model.

The repository has passing CI and published packages. Internal implementation streams used Loomplane's own contract packets and receipts. That is internal use and mechanism evidence; it is not customer validation or proof that a model obeyed a packet.

## The business

Keep the useful core **Apache-2.0**, including basic access controls and data portability. Individuals and self-hosting teams should be able to succeed without paying.

The paid product would operate shared context across an organization: managed hosting and recovery, human identity, inherited source permissions, retention, policy, private/regional deployment and support. These are prospective paid capabilities. The current prototype provides project service keys, not enterprise identity or document-level authorization.

Initial price hypothesis: $300 per team workspace per month, with larger business/enterprise packages after the required capabilities and buying reasons are established. Price the organizational service rather than each ephemeral agent. The [business model](docs/strategy/business-model.md) contains explicit assumptions and bottom-up revenue arithmetic.

The first buyer to investigate is an engineering lead at a small agent-heavy software team doing API/UI or shared-schema changes. Their problem is coordination and avoidable rework. The eventual platform buyer comes after actual team usage.

## What would make this venture-scale

A repeatable path from a developer installing it for one contract to a team depending on it across projects. The potential advantage comes from reliable integrations, a useful dependency history, and trusted operation across tools. A graph, an MCP endpoint, or an open data model alone is easy to copy.

The [competitive analysis](docs/strategy/competition.md) covers native coding-tool coordination, Beads/Gas Town, memory providers, and the existing Git/shared-file workflow. The wedge must outperform what an actual team already does.

## Next founder decisions

1. Run two actual coding clients on one interface change. Measure whether packets are consumed and checks happen without constant supervision.
2. Interview teams with repeated cross-agent contract changes. Use the [pilot kit](docs/strategy/pilot-kit.md); no outreach has been sent.
3. Track useful corrections, missed changes, false alarms, and context-maintenance effort. Subtract the work of maintaining Loomplane from any time savings.
4. Seek a paid, bounded deployment only when the scope exists and the team uses it independently. Free pilots, interest and letters of intent are not recurring revenue.
5. Build enterprise controls in response to a real deployment requirement. Keep improving the free coordination loop while validating demand.

The strongest next evidence is a team choosing to keep using the product. The technical backlog is in [docs/NEXT.md](docs/NEXT.md), and the measured local limits are in [the scaling baseline](docs/scaling-baseline.md).
