# Obsidian for Agent Conversations

*Idea and feasibility assessment — September 18, 2026*

## The idea

Build a local workspace that automatically connects AI-agent conversations by project, task similarity, and meaningful relationships. Inspired by Obsidian, it would let users explore their work through connected conversations rather than relying only on chronological chat lists and folders.

Potential scope:

- **Personal:** connect one person's work across projects and agent applications.
- **Team:** preserve shared project knowledge and make handoffs easier.
- **Enterprise:** provide permission-aware access to useful organizational knowledge derived from agent work.

The initial concept includes automatic clustering and a graph interface. It could eventually become a full agent harness, but that is not necessary to test its value.

## Honest verdict

**Worth pursuing as a focused open-source project. Plausible as a business, but automatic chat clustering alone is a weak startup proposition.**

The valuable insight is that a conversation is a poor container for ongoing work. A project spans many conversations; one conversation can cover several projects; decisions and useful discoveries get buried inside unrelated sessions.

The major risk is building an attractive map without making work meaningfully easier.

The stronger product hypothesis is:

> Open a project and immediately recover what happened, what remains unresolved, and which previous work is relevant—with evidence you can inspect.

The startup case remains unvalidated. Research established relevant existing products, not customer demand, willingness to pay, or superiority over competitors.

## What connections should represent

Project membership, task similarity, and actual dependency are different relationships.

| Relationship | User benefit |
| --- | --- |
| Conversations belong to the same project | Recover project history |
| Conversations address similar problems | Reuse approaches across projects |
| A conversation continues earlier work | Follow an investigation |
| A later decision supersedes an earlier one | Understand what currently applies |
| A conversation produced a specific artifact or change | Verify outcomes |

Example: an authentication project might include an initial design discussion, implementation, discovery of a security constraint, reversal of a decision, and reuse of the resulting pattern elsewhere.

Folders can group these items. Search can retrieve passages. The proposed system should make their progression and current relevance easier to understand.

**Similarity alone is insufficient.** Opposing recommendations can have very similar embeddings. Unrelated tasks can belong to the same project. Similar problems can belong to different clients with incompatible constraints.

## Existing competition and prior art

These capabilities were checked against project or vendor documentation during the discussion. They have not been independently benchmarked, and this is not an exhaustive market survey.

| Project | Relevant overlap |
| --- | --- |
| [CASS](https://github.com/Dicklesworthstone/coding_agent_session_search/blob/main/SKILL.md) | Cross-agent local session search, project filters, and interfaces agents can consume |
| [Entire](https://github.com/entireio/cli/blob/main/README.md) | Connects captured agent sessions to Git commits for traceability, recovery, and inspection |
| [Claude-Mem](https://github.com/thedotmack/claude-mem/blob/main/README.md) | Captures observations, summarizes them, and retrieves context for later sessions |
| [Graphiti / Zep](https://help.getzep.com/graphiti/getting-started/welcome) | Evolving knowledge graphs for agent memory, with semantic, keyword, and graph retrieval |
| [Glean](https://docs.glean.com/administration/search/faq) | Organizational search that respects source permissions |
| [Claude Code memory](https://code.claude.com/docs/en/memory) | Native persistence of knowledge across sessions |

Implications:

- Connected conversations and agent memory are established directions.
- Basic search, embeddings, and clustering are unlikely to provide durable differentiation.
- A useful opening could be an exceptionally clear, trustworthy experience for resuming work and recovering decisions across tools.
- Hands-on comparison is necessary before claiming existing products fail to deliver that experience.

## Product and interface direction

The graph is a possible interface, not sufficient proof of value.

A large global graph can become unreadable. Automatic reclustering can also disrupt users' spatial familiarity as new data arrives.

Suggested primary experience:

1. Stable project views.
2. Timelines of decisions, attempts, and unresolved work.
3. Relevant prior conversations beside the current task.
4. Small neighborhood graphs around selected tasks, decisions, or artifacts.
5. An optional broader map for exploration.

Keep the useful aspects of Obsidian: backlinks, inspectable relationships, portable data, and user ownership.

Test the human-facing value independently from agent memory. Helping someone regain orientation may be useful before the system injects any context into an agent.

## Technical architecture

```text
Session sources
    ↓
Normalized events with source references
    ↓
Search index + extracted entities and relationships
    ↓
Project views / related work / context retrieval
```

### 1. Ingestion and evidence preservation

Normalize messages and tool events while retaining:

- Source application and original session ID.
- Message identity, timestamp, and author role.
- Repository, working directory, branch, and commit where available.
- References to files, issues, pull requests, and other artifacts.
- Exact source locations for extracted claims and relationships.

Prefer supported APIs, exports, or hooks. Local log parsing may work for a prototype, but source formats can change and adapters require maintenance.

Keep original evidence separate from generated summaries so derived views can be rebuilt or corrected. Deduplicate forked conversations and repeated context: repeated copies are not independent evidence.

### 2. Retrieval granularity and storage

Index meaningful segments rather than only whole conversations. A segment might represent a debugging attempt, decision discussion, or result. Preserve surrounding context for inspection.

Combine:

- Exact-text search for identifiers, errors, and filenames.
- Embeddings for conceptual similarity.
- Metadata filters for project, repository, time, and source.
- Explicit references for direct relationships.

A reasonable initial local design is SQLite for structured records and full-text search, plus a vector index. An edge table can represent relationships; a dedicated graph database is not required to display a graph.

### 3. Incremental processing

Use a predictable background pipeline instead of a continuously roaming agent that rereads everything:

1. Detect a new or changed session.
2. Extract new segments and artifact references.
3. Retrieve a small candidate set of related items.
4. Use a model where interpretation is necessary.
5. Store inferred relationships with supporting evidence.

For 100,000 segments, exhaustive pairwise comparison means roughly five billion pairs. Candidate retrieval avoids that explosion.

Model calls for extraction and relationship classification may be a more significant cost than graph rendering. Measure this rather than assuming.

Fully local inference is a possible option, but quality, latency, and resource usage need testing on target hardware. A local UI backed by cloud extraction is not fully local processing.

### 4. Typed relationships

Candidate relationship types:

```text
belongs_to_project
discusses_artifact
continues
attempted
resolved
supersedes
similar_to
```

Distinguish direct observations, model inferences, and user confirmations. Referencing the same pull request is more directly observable than concluding that one decision supersedes another.

Show why a connection exists and allow correction. Support multiple memberships and uncertainty rather than forcing every conversation into exactly one cluster.

### 5. Time, truth, and decision state

A conversation history can contain:

> We should use Redis.
>
> The Redis approach failed under our deployment constraints.
>
> We eventually used Postgres.

A naive summary can preserve the wrong conclusion. Similarity does not establish which statement currently applies.

Distinguish proposals, attempted actions, observed outcomes, and accepted decisions. Link code-related claims to changes or test evidence where possible.

“Latest statement wins” is also insufficient: the statement may concern a different branch, an experiment, or a hypothetical. Scope and provenance matter alongside timestamps.

[Zep's temporal graph model](https://help.getzep.com/graph-overview) is relevant prior art for evolving facts and relationships.

### 6. Feeding context back into agents

More retrieved history can make an agent worse by introducing stale assumptions, rejected approaches, or irrelevant constraints.

Start with explicit retrieval, such as “find relevant previous work,” before automatic context injection.

Retrieved context should be:

- Concise and relevant to the current task.
- Scoped to the correct project and circumstances.
- Linked to original evidence.
- Treated as historical data rather than current instructions.

Evaluate task outcomes and incorrect-context failures, not the quantity of remembered information.

## Enterprise requirements

The enterprise version is more than the personal version with a larger database.

Important challenges:

- Different users have different source permissions.
- A single conversation may mix information from several access scopes.
- Generated summaries, cluster labels, and edges can disclose restricted information.
- Source deletion must invalidate derived summaries, embeddings, and relationships.
- Employees may not want all exploratory conversations searchable by coworkers or managers.

Apply permission filtering before information reaches an answering model. Hiding the source link after answer generation does not prevent disclosure.

A potentially better starting point is **private capture with selective sharing of useful project knowledge and supporting evidence**, rather than company-wide access to raw chat histories.

[Glean's source-permission handling](https://docs.glean.com/administration/search/faq) illustrates an existing enterprise baseline.

## Business hypothesis

Suggested initial customer: an engineering team using multiple agents where handoffs repeatedly require reconstructing decisions and failed attempts.

Potential buyers include engineering managers and developer-productivity leads.

Potential measurable value:

- Less time getting back up to speed.
- Less duplicated investigation.
- Fewer regressions caused by forgotten constraints.
- Easier handoffs and reduced dependence on individual memory.

“Browse your company as a graph” is harder to connect to a budget than these outcomes.

### Open-source and paid scope

Possible open-source core:

- Local importers and indexing.
- Search and evidence-backed connections.
- Personal project views.
- Portable storage and export.

Possible paid capabilities:

- Shared deployment and managed synchronization.
- Access controls and administration.
- Enterprise integrations and support.

These are monetization hypotheses, not validated demand. Enterprise features alone do not create willingness to pay.

Potential defensibility would come from reliable integrations, high-quality retrieval, trustworthy links from conversations to outcomes, and daily workflow adoption. Embeddings and clustering alone are not a strong moat. Existing vendors can pursue the same opportunity.

## Why not build the full harness first?

A full harness adds execution, terminals, tool integrations, approvals, workspace state, cancellation, recovery, and model-provider maintenance.

That work is largely unnecessary to test whether connected conversations are useful.

Start with a companion to existing tools: a local service, a small interface, and a CLI. Agent retrieval can later use an integration such as MCP. Obsidian could be one interface while the underlying data model remains independent.

This lets users try the product without switching their preferred agent.

## Proposed validation experiment

Time-box the first prototype to a few weeks as a learning exercise, not an enterprise launch commitment.

### Prototype scope

1. Support two conversation sources.
2. Import real histories, starting with the founder's own and a handful of willing users.
3. Implement project grouping, hybrid search, and a related-work panel.
4. Add evidence-backed links to decisions and artifacts.
5. Add small neighborhood graphs where they clarify relationships.

### Questions it should help answer

- Why did we reject this approach?
- Where did I solve a similar problem?
- What should I know before continuing this project?
- Was this actually fixed, or only discussed?

### Baselines

Compare against:

- Ordinary text search.
- A chronological session list.
- At least one existing session-search tool.

### Metrics

- Time to a correct answer.
- Whether cited evidence supports the answer.
- Repeat use without prompting.
- Concrete avoided investigation or duplicated work.
- Separately, agent task outcomes and failures caused by incorrect context.

Strong signal: users repeatedly recover useful information during real work and save meaningful time.

Weak signal: GitHub stars, praise for screenshots, or enjoyment of the graph without continued use.

## Recommendation

Build the small open-source version and test it against existing tools with real histories.

Keep the startup hypothesis conditional:

> Can fragmented agent conversations become reliable continuity of work that people will pay for?

If yes, there may be a business. If the primary benefit is enjoying the map, it can still be a worthwhile open-source project. Recognize which outcome the evidence supports before expanding into a full harness or enterprise platform.

## Current status

- Idea assessed and relevant competition researched.
- Architecture and validation approach proposed.
- No implementation completed as part of this assessment.
- No customer interviews, hands-on competitor benchmarks, pricing validation, or willingness-to-pay evidence collected.
