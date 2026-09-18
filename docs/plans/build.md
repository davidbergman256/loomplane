# Weft implementation plan

> For agentic workers: use superpowers:subagent-driven-development for independent portions, with lightweight integration review. The user requests rapid autonomous execution and no fancy testing.

**Goal:** Ship an open-source working parallel-context runtime and developer workbench, accompanied by an evidence-based enterprise business thesis.
**Architecture:** A transactional SQLite domain engine exposes one contract to HTTP, CLI and MCP. A React workbench makes streams, shared capsules and stale context inspectable.
**Tech stack:** Node 24+, TypeScript, SQLite, React, Vite, MCP SDK.
**Spec:** docs/specs/parallel-context.md

## Global constraints
Node 24+. Apache-2.0. No credentials or private histories in Git. No paid API required. Loopback default. Cross-project relationships rejected. Immutable revisions. Expected-version writes. Budget counts whole text, tokens explicitly estimated. Synthetic demo labeled. Enterprise readiness and performance gains must not be invented.

## Work packages and ownership
- [ ] Core (primary agent): src/core/{types,store,compiler,demo,index}.ts; immutable revisions, scoped project/stream/mount operations, SQLite transactions, deterministic packets, FTS, drift, export and events. Verify the real two-stream revision scenario with scripts/smoke.ts.
- [ ] Transport (primary agent): src/server/index.ts and src/cli/index.ts; HTTP routes in docs/specs/api.md, SSE, static build, CLI init/demo/serve/project/stream/publish/mount/compile/search/inspect/import/export/mcp. Verify JSON endpoints and startup.
- [ ] Workbench (UI agent): apps/web/** only; build against API contract, typecheck, then browser exercise create/mount/compile/revise/refresh. No mock data in live UI; demo comes from server.
- [ ] Adapters (integration agent): src/adapters/**, src/mcp/**, examples/integrations/**; JSONL adapters for Codex and Claude with explicit paths, safe generic Markdown, source provenance, tools call same Store. Verify fixture parsing and MCP handshake.
- [ ] Venture (research agent): docs/strategy/**; competitor sources, painful initial use case, open-source distribution, enterprise wedge, founder pitch, 90-day operating plan, design partner pilot and falsifiable business assumptions. No external outreach.
- [ ] Finish (primary agent): README, license, CI, synthetic demo walkthrough, Docker, review integration, create public GitHub repository and push verified source. Open running workbench and leave accurate handoff.

## Integration contract
See src/core/types.ts and docs/specs/api.md. Shared types and core are owned by the primary agent. Other agents request contract changes rather than editing core. Agents do not commit while working concurrently; primary agent commits integrated milestones. Prototype checks remain small and outcome-based.
