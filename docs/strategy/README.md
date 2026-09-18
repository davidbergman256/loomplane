# Loomplane founder packet

Decision date: September 18, 2026. This is a strategy and experiment plan, not evidence of traction or a forecast.

**Build the dependency layer for parallel agent context.** Start by showing which active coding tasks consumed an assumption that subsequently changed. Expand into the organization’s control plane for publishing, consuming, authorizing, and revalidating context across agent vendors.

Read in order:

1. [Thesis and product choices](thesis.md): alternative businesses, chosen wedge, expansion, and defensibility.
2. [Competitive landscape](competition.md): current primary-source research and the claims we cannot make.
3. [Open source and economics](business-model.md): permanent free core, prospective commercial boundary, pricing tests, and explicit revenue arithmetic.
4. [First 90 days](pilot-plan.md): recruitment, pilot protocol, distribution, measurements, and stop conditions.
5. [Pitch and demo](pitch.md): usable application copy, a concrete demonstration, and honest limits.
6. [Design-partner kit](pilot-kit.md): interview, success worksheet, and unsent outreach drafts.
7. [Naming decision](naming.md): current evidence and launch implications.

Current scope is an open-source **single-server team prototype**: local and remote clients, transitive revision dependencies, source fingerprints, receipts, portable export/restore, a typed HTTP SDK, project-scoped reader/writer keys with revocation, and token sign-in. Managed synchronization, SSO, source-permission inheritance, and enterprise readiness remain future work.

The old chat-graph framing is superseded. A graph can visualize dependencies; it is not the customer’s reason to buy. The crucial distinction is between **what context exists**, **what a task’s packet contained**, and **whether its work was revalidated after that context changed**. The initial slice handles the first two through capsules and packet manifests and detects drift. Caller-reported receipts add a completion check; they do not independently establish revalidation or model behavior.
