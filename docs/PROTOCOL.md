# Loomplane context model, version 0.1

This is Loomplane's open data model and API contract, not a claim of an industry standard. The implementation is Apache-2.0. Consumers can use the TypeScript types, HTTP SDK, CLI, MCP, or portable JSON without adopting the workbench.

## Context is a selection, not a tree

A stream owns a line of work. It can mount capsules owned by other streams or published in project commons. A capsule has a stable ID and a sequence of immutable revisions. A derived capsule can refer to the exact revisions on which it was based.

A mount is either live (select current revision at compile time) or pinned (select a named revision). A packet is an immutable compilation of owned and mounted context for one task and budget. It contains the exact revision manifest, omitted capsules and explicit key conflicts. An agent can retrieve source revisions later without bringing every conversation into its initial working context.

```
API contract @2 ──────────┬── UI stream → packet A
                         └── SDK constraint @1 → test stream → packet B
```

If the API contract changes, both directly consuming packets and packets using its derived constraint require attention. The UI and test streams still keep separate context; the parent does not need to carry all of their histories.

## Identity and scope

IDs are opaque strings with descriptive prefixes. They are not authorization tokens. Every stream and capsule belongs to exactly one project; mounts and derivations cannot cross that boundary. Shared-server credentials authorize one project and a reader/writer role. Cross-project sharing would need a new explicit publication/authorization mechanism; it is not implemented by weakening this invariant.

## Revision semantics

- Publish creates revision 1. Revise requires `expectedVersion` and atomically adds the next revision.
- Status changes are revisions too. Retracting context does not delete its history.
- Dependencies are recorded inside each revision, not only as a mutable relationship on the current capsule.
- A later capsule revision does not alter earlier packet manifests, source evidence, or receipts.
- Author fields describe attribution supplied by the caller. A scoped service credential is not proof of human authorship.

## Packet semantics

The compiler selects active owned and mounted capsules. Priority and lexical task overlap determine order; this is deterministic selection, not a learned relevance model. Complete capsule sections fit or are omitted. UTF-8 byte length divided by three estimates tokens, including headers and evidence. It is not a provider token count and does not guarantee fit for every model.

The manifest records stable capsule ID, exact version, title, kind, mount mode and estimated section size. The packet stores its full rendered text. Exported packets act as a context lockfile; a second lock format is unnecessary.

`checkPacket` compares a recorded packet against live context and its historical dependencies. It catches revisions, retractions, unmounts, newly active context, derived-source changes, and explicit keyed conflicts. A deliberately pinned older revision can produce an informational update without becoming stale. Retraction and stale derivation still require attention. A read-only check does not modify context.

Validity here means tracked revision consistency, not that the packet is sufficient, the statements are true, or the resulting program is correct. Budget omissions remain visible. An empty or narrow packet cannot prove comprehensive context coverage.

## Use receipts

A receipt associates one caller-reported run with one exact packet. Starting or completing a receipt checks that packet, not whatever a different actor most recently compiled. Completed/abandoned receipts cannot be edited back into a running state.

If context changes during a run: inspect the difference, revalidate the affected work, abandon the old receipt if appropriate, compile a new packet, and register the revalidated run. Compiling alone does not establish that source code was reviewed. Receipt text records a claim; it is not independently attested model behavior.

## Evidence and source fingerprints

Evidence contains a label, URI and optional excerpt. An optional fingerprint records a relative file path, SHA-256 digest, byte count and Git commit. Capture and filesystem checks require an explicit CLI path/root. A changed file is a review signal, not proof of semantic incompatibility. The HTTP/MCP database check never silently reads arbitrary local files.

## Portable archives

`loomplane.project` version 1 exports one project, its streams, capsules, revision history, mounts, packets, receipts and a bounded event history. Access-key secrets or digests are never exported. Restore validates structure and all relational references before one atomic insert, rejects existing IDs, and records original event IDs while assigning new local event sequence numbers.

An archive can be copied, edited, or forged by its owner. Structural consistency is not cryptographic authenticity. Imported text and metadata remain untrusted data. The application event log is not tamper-proof.

## Evolution

The 0.1 implementation is pre-stable. Incompatible archive changes must increment the format version; durable storage changes require explicit migrations. New transports must use the same domain operations and isolation rules. The authoritative current request/response shapes are in [the API contract](specs/api.md) and [TypeScript domain types](../src/core/types.ts).
