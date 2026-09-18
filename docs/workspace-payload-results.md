# Compact workspace payload comparison

The compact workspace response reduced a synthetic 500-capsule, 30-stream project from **1,831,459 to 589,898 JSON bytes (67.8% smaller)**. The browser receives capsule objects once and fetches complete packet text and manifests only when a packet is opened. Existing snapshot clients retain their original response shape.

This measures uncompressed JSON size, not production bandwidth, browser performance or server capacity. The core currently projects an existing coherent full snapshot, so the change does not eliminate its database reads or establish a CPU improvement.

## Same-state comparison

The benchmark reads both formats from the same synthetic database after packet creation, without mutations between reads. Fixture dimensions and sampling limitations match the [original baseline](scaling-baseline.md). The original baseline remains a historical measurement of v0.1; the table below compares two methods in the new build.

| Fixture                  | Full snapshot bytes | Compact workspace bytes | Reduction | Full stringify median | Compact stringify median |
| ------------------------ | ------------------: | ----------------------: | --------: | --------------------: | -----------------------: |
| 100 capsules, 10 streams |             446,070 |                 139,291 |     68.8% |              0.365 ms |                 0.123 ms |
| 500 capsules, 30 streams |           1,831,459 |                 589,898 |     67.8% |              1.340 ms |                 0.457 ms |

Three sequential samples per operation; no discarded warmups. These tiny local timings are illustrative. Store-call medians were 6.090/5.960 ms (full/compact, small) and 24.078/20.373 ms (medium). Cache/order effects and normal variation are not controlled. In particular, the compact method calls the same snapshot implementation before projection: these timings are not evidence of fewer database operations.

Measured 2026-09-18 at 17:13:29 UTC using Node.js v24.14.0, macOS ARM64, Apple M5, 10 logical CPUs and 24,576 MiB reported memory. The benchmark froze the compiled core before running; its SHA-256 fingerprint was `473bd7f988636c4e90b0543846bac39ea03a93361f2e13ea96a8ef8869dded9f`. No existing project data or user histories were used.

## Reproduce

```sh
npm ci
npm run build
npm run benchmark -- --samples 3 --output benchmark.json
```

The `snapshot` and `workspace` entries in each result report exact byte counts and individual samples. The harness includes the workspace operation when the built core supports it, so it also remains usable against the frozen older baseline.

## Compatibility and remaining costs

- `GET /api/workspace` is additive. `GET /api/snapshot`, `Store.snapshot`, and `getStreamState` preserve their full response contracts.
- Packet summaries contain counts and identity, never fake empty text/manifests. Full immutable packets remain available through their detail endpoint.
- Project-scoped authorization applies to both formats. Reader credentials can inspect the compact view only for their project.
- Every current capsule is still included. This is not pagination or incremental synchronization, and large capsule bodies can still make a large response.
- Server-side read work and transient full-snapshot allocation remain. Query reuse, bounded graph traversal and list pagination require separate work and measurements.
