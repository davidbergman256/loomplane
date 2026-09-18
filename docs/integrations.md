# Explicit file imports

Loomplane imports local Markdown, Codex JSONL, and Claude JSONL only when a
caller supplies a file path. The importer does not scan a home directory,
agent history, or repository.

Each Markdown file and accepted JSONL user or assistant message becomes an
artifact capsule. Evidence records both a stable import identity and the exact
source line or line range. A managed-state digest records the title, body,
author, tags, evidence, priority, and dependencies written by the importer.
The digest contains no source contents.

Re-import behavior is deterministic:

- An identical source record is skipped and counted in `ImportResult.skipped`.
- Changed source text revises the existing capsule with its current
  `expectedVersion`. The stable capsule ID and complete revision history are
  preserved. A successful revision is counted in `ImportResult.imported` and
  its existing ID appears in `capsuleIds`.
- If the current capsule no longer matches the last importer-managed state,
  the record is skipped and `warnings` reports an import conflict. The importer
  does not overwrite edited text, title, tags, evidence, priority,
  dependencies, status, kind, or stream ownership.
- Legacy importer capsules without a managed-state digest can be updated only
  when they are still at version 1 and retain the expected importer markers.
  Ambiguous revised legacy capsules produce a conflict.

JSONL identity is the explicit file path, selected format, and record line.
Moving records between lines is therefore treated as a change to those line
identities; the importer does not infer conversational equivalence. Records
removed from a file are not automatically retracted.

The importer continues after an individual JSONL conflict or rejected record,
so callers must inspect `imported`, `skipped`, and every warning. Imported text
is plain historical data. The importer does not execute it or invent model
insights from it.
