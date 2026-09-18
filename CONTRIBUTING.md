# Contributing to Loomplane

Loomplane is an early open-source project. The best contributions make a real parallel-agent workflow easier to understand and safer to resume.

## Development

Use Node 24+, `npm ci`, then `npm run dev` and `npm run dev:web` in separate terminals. Load the synthetic demo from the workbench or `npm run loomplane -- demo`. Keep private conversations, credentials, databases, and generated packets out of commits.

- `src/core`: domain model, transactions, versioning and compilation.
- `src/server`: local HTTP transport and SSE.
- `src/cli`: command-line interface.
- `src/mcp`: agent protocol integration.
- `src/adapters`: explicit imports from local source files.
- `src/runner`: explicit command execution with packet files and freshness checks.
- `apps/web`: human workbench.
- `apps/demo`: standalone synthetic concept demonstration published to GitHub Pages.
- `docs/specs`: architectural and API contracts.

Use the same domain methods across transports. A route should not invent different scoping or mutation behavior. Derived context must retain provenance. Never describe an inferred or caller-reported record as verified fact.

## Verification

Run type checking, the small behavioral smoke scenario, and the build. For transport or import changes, run the integration smoke script. Add checks when they protect a meaningful invariant, rather than testing implementation details. UI changes should be tried in a browser at desktop and narrow widths.

## Pull requests

Describe the user-visible problem, the resulting behavior, and what you exercised. Explain changes to formats or compatibility. Use synthetic examples that another contributor can run. Avoid adding a model dependency to deterministic core operations.

Contributions are under the repository's Apache-2.0 license. There is no CLA at this stage.
