# Historical packet comparison

`Store.comparePackets(fromId, toId): PacketDiff` explains a refresh by comparing two saved packets in the same project and stream. The direction is caller-selected; reverse comparisons are allowed. Missing packets return `NOT_FOUND` (404); differing projects or streams return `PROJECT_MISMATCH` or `STREAM_MISMATCH` (400). An authenticated transport must authorize both packet IDs before comparison.

The result contains `projectId`, `streamId`, both packet IDs, `changed`, `textChanged`, `unchangedCapsules`, and `capsuleChanges`. Each capsule change has a stable capsule ID, an ordered list from `added | removed | revised | mode`, and nullable `before`/`after` snapshots containing the historical manifest item and exact stored revision. Revised and mode changes can occur together. Entries sort by capsule ID with locale-independent ordering.

`task`, `budget`, `estimatedTokens`, `manifestOrder`, `omissions`, and `conflicts` each contain `{before, after, changed}`. Manifest order preserves actual compiled order. Omission and conflict collections use canonical ordering so incidental collection order does not become a difference. Packet identity and creation timestamp alone do not set `changed`. Text changes remain explicit, including header changes that do not alter capsule selection.

“Added” and “removed” describe packet inclusion, not creation or deletion of knowledge. A smaller budget can remove a capsule from the manifest and place it in omissions. The result reports both facts without guessing the author's intent. “Revised” means a different recorded revision, not necessarily changed meaning or broken compatibility. Complete revisions expose title/body, evidence, dependency references, and change notes without inventing a semantic verdict.

The implementation reads saved packets and their referenced revisions only. It does not inspect current capsules, mounts, external files, receipt status, or freshness; it creates no events, packets, revisions, or revalidation claims. Comparing the same saved pair stays stable after later source changes. The pure helper `comparePacketSnapshots(from, to, resolveRevision)` is exported for other trusted storage adapters.

This operation complements packet checks: comparison answers what changed between two snapshots; checks answer whether a recorded packet has tracked drift now. Neither proves that a model read the context or that resulting code was revalidated. Imported packet content remains untrusted recorded data.
