# Working on Loomplane

Loomplane coordinates shared context across independently scoped coding-agent streams. Read docs/specs/parallel-context.md and docs/specs/api.md for the model and transport contract.

- Use Node 24+. SQLite is built in; do not introduce a required cloud backend.
- Keep capsules and their revisions distinct. Revisions and packets are immutable.
- Scope all relationships to a project. Expected-version checks protect concurrent writers.
- A pin is an explicit version choice; a live subscription follows updates. Do not silently change those semantics.
- Preserve evidence and label inferred or self-reported records. Never claim receipts prove model compliance.
- Full context text, including headers and sources, counts toward the estimated budget.
- Do not commit private histories, databases, credentials, or machine-specific paths. Use synthetic fixtures.
- Avoid speculative enterprise scaffolding: implement the local coordination loop well, document the commercial boundary honestly.
- Run typecheck, focused smoke scenarios and build for functional changes. Keep checks lightweight and meaningful.
- Independent development can use parallel agents with disjoint file ownership and one shared API contract. Coordinate changes to src/core/types.ts with the primary implementer.
