# Local single-server baseline

At **500 synthetic capsules and 30 streams**, the shipped core's median snapshot read took **21.885 ms** and produced **1,831,459 bytes** of compact JSON. Impact inspection took **22.707 ms**. A scoped compile containing 23 capsules took **0.475 ms**. These are small, sequential local measurements—not production throughput or capacity claims.

The immediate scaling question is the cost and size of whole-workspace reads. This run does not establish a concurrency limit, a safe public deployment size, enterprise readiness, or an asymptotic complexity bound.

## What was measured

- **Code:** committed v0.1 source at [`9cfd206`](https://github.com/davidbergman256/loomplane/tree/9cfd206), compiled to JavaScript before the run. The active checkout was changing, so this report used an isolated build of that commit, not whichever files happened to be rebuilt in the active `dist` directory.
- **Runtime fingerprint:** SHA-256 over sorted built core `.js` filenames and contents: `2a8c2fe528701d1d1fcc1ca12da26198ec0bbf3c9c4582c37a86baac7d4966c8`.
- **Measured:** 2026-09-18, 17:02:14 UTC.
- **Environment:** Node.js v24.14.0; macOS (`darwin`), ARM64; Apple M5; 10 logical CPUs; 24,576 MiB total memory reported by the OS. No hostname or private filesystem paths are recorded.
- **Storage:** one newly created temporary SQLite database per scenario, using the core's existing WAL configuration. It was populated immediately before measurement and deleted afterwards.
- **Sampling:** three sequential samples per operation, in the order compile → packet check → snapshot → impact → export. There were no discarded warmups. Fixture creation already exercised compilation and packet checks; the OS page cache was not cleared. These are warm, tiny local workloads.
- **Timing:** `performance.now()` around the synchronous store call. `JSON.stringify` is measured separately; UTF-8 byte counting is outside both timings. Compile includes its transaction, packet persistence, and audit event. The harness does not measure HTTP, authentication, SSE, network transfer, browser parsing/rendering, or model execution.
- **Bounds:** each scenario runs in a child process. Ten seconds without progress or 30 seconds total terminates that process and reports incomplete results. Neither scenario reached a bound.

The compiled runtime is copied and fingerprinted before workers start, preventing concurrent source edits or later builds from changing the measured core mid-run. Installed dependencies are reused rather than copied. This is an opt-in measurement utility, not a CI test.

## Reproduce

From a checkout with dependencies installed, using Node.js 24+:

```sh
npm ci
npm run build
node scripts/benchmark.ts --output benchmark.json
```

The script imports the **built `dist/core`**, not the current TypeScript core source. Build immediately before measuring changes. The new JSON report includes its runtime fingerprint, environment, raw samples, serialized sizes, fixture dimensions, and completion status.

Optional bounded controls:

```sh
node scripts/benchmark.ts --case small --samples 1
node scripts/benchmark.ts --case medium --samples 3 --output benchmark.json
node scripts/benchmark.ts --built-core /path/to/an/isolated/build/dist/core
```

`--samples` accepts 1–5. `--case` accepts `small`, `medium`, or `all` (the default). An incomplete or failed scenario sets a nonzero exit status and retains whatever measurements completed. Temporary databases and the copied runtime are removed after the run. No existing project database is opened and no real content is imported.

To reproduce the historical numbers, build commit `9cfd206` in an isolated checkout and pass that checkout's built core to the current harness. A later build should be treated as a comparison, not as the same baseline.

## Synthetic data shape

Each project has independent streams with roughly evenly distributed owned capsules, plus project-level shared capsules. Every stream follows eight distinct external capsules in live mode. The fixture creates short chains `root → derived claim → derived artifact`; dependencies reference revision 1 explicitly.

| Dimension                                   |         Small |        Medium |
| ------------------------------------------- | ------------: | ------------: |
| Projects                                    |             1 |             1 |
| Capsules                                    |           100 |           500 |
| Streams                                     |            10 |            30 |
| Project-level shared capsules               |            10 |            50 |
| Dependency edges                            |            20 |           100 |
| Maximum dependency depth                    |             2 |             2 |
| Live mounts                                 |            80 |           240 |
| Initial compiled packets                    |            10 |            30 |
| Completed synthetic receipts                |             3 |             3 |
| Immutable revisions after one source change |           101 |           501 |
| Capsule body size before revision           | 402–403 bytes | 402–404 bytes |
| Evidence references / tags per capsule      |         1 / 3 |         1 / 3 |
| Estimated token budget per packet           |         8,000 |         8,000 |

After seeding, one shared root is revised to v2. Every stream directly mounts that root, and the root has **two derived descendants**. The two-hop path is exercised even though this fixture deliberately does not test a large fan-out graph or deep recursion. All streams are stale after the revision.

The measured compile targets the first stream: **17 manifest items** in the small case and **23** in the medium case. Neither compile omits a capsule. Its estimated token counts are 3,890 and 5,216 respectively; those are compiler estimates, not provider billing counts. Compile is scoped to that stream, so its workload does not increase fivefold merely because the project has five times as many capsules.

Packet checks inspect the first historical packet. Each returns `ok: false`, one direct revision change, two dependency-drift records, and zero conflicts. Impact finds two dependent capsules, every stream, and three historical receipts. Snapshot and export run after the three measured compiles, so they include **13 / 33 packets**. Snapshot returns 50 recent events; export contains all **211 / 811** fixture events. Read operations left the audit sequence unchanged in both cases.

## Measured timings and serialized sizes

All time values are **milliseconds**. JSON sizes are uncompressed UTF-8 bytes from compact serialization. Three samples are too few for a credible p95 or p99; none is reported.

| Operation                  | Small median | Small min–max | Small JSON bytes | Medium median | Medium min–max | Medium JSON bytes |
| -------------------------- | -----------: | ------------: | ---------------: | ------------: | -------------: | ----------------: |
| Compile and persist packet |        0.462 |   0.374–0.518 |           14,371 |         0.475 |    0.425–0.782 |            19,199 |
| Check historical packet    |        0.447 |   0.423–0.477 |              844 |         0.498 |    0.493–0.545 |               844 |
| Project snapshot           |        5.506 |   4.793–5.893 |          446,070 |        21.885 |  20.344–22.450 |         1,831,459 |
| Changed-root impact        |        7.240 |   7.093–7.532 |            9,261 |        22.707 |  22.318–25.478 |            15,444 |
| Portable project export    |        1.374 |   1.328–1.851 |          442,195 |         6.716 |    6.661–7.145 |         1,808,248 |

JSON serialization adds the following median time; it is **not included** in the table above:

| Operation      | Small stringify median | Medium stringify median |
| -------------- | ---------------------: | ----------------------: |
| Compile result |                  0.008 |                   0.010 |
| Packet check   |                  0.001 |                   0.001 |
| Snapshot       |                  0.289 |                   1.266 |
| Impact         |                  0.016 |                   0.026 |
| Export         |                  0.294 |                   1.282 |

Raw operation samples, in acquisition order:

```text
Small:
  compile     [0.374, 0.518, 0.462]
  packetCheck [0.477, 0.447, 0.423]
  snapshot    [5.506, 4.793, 5.893]
  impact      [7.532, 7.093, 7.240]
  export      [1.851, 1.328, 1.374]

Medium:
  compile     [0.475, 0.782, 0.425]
  packetCheck [0.545, 0.498, 0.493]
  snapshot    [20.344, 22.450, 21.885]
  impact      [25.478, 22.318, 22.707]
  export      [6.661, 7.145, 6.716]
```

Fixture creation took **41.938 ms / 137.036 ms**. Whole child-process wall time, including startup, fixture creation, measurements, and shutdown, was **158.978 ms / 381.005 ms**. These setup values are not separately controlled ingestion benchmarks.

After closing SQLite, database files were **733,184 bytes / 2,711,552 bytes** and the WAL/SHM files were absent. Immediately before close, the WAL files were **4,152,992 / 4,185,952 bytes** and SHM was 32,768 bytes in each case. WAL allocation/checkpoint behavior means the final database size is not the peak storage footprint.

## What the evidence suggests next

The timing comparisons below are **bottleneck candidates inferred from the code and this small run**, not conclusions from a CPU or query profiler.

1. **Avoid full-workspace payloads for small UI updates.** The 500-capsule snapshot is already about 1.75 MiB. The shipped [`snapshot`](https://github.com/davidbergman256/loomplane/blob/9cfd206/src/core/store.ts#L992) embeds all capsules, per-stream owned/mounted capsule objects, and latest packets. A page of summaries plus lazy details could reduce transfer and browser work. This experiment did not measure network or rendering savings.
2. **Profile repeated per-stream reads before choosing a database migration.** [`getStreamState`](https://github.com/davidbergman256/loomplane/blob/9cfd206/src/core/store.ts#L818) builds candidates and then asks [`packetDrift`](https://github.com/davidbergman256/loomplane/blob/9cfd206/src/core/store.ts#L737) to build them again. [`checkPacket`](https://github.com/davidbergman256/loomplane/blob/9cfd206/src/core/store.ts#L797) also obtains candidates for both drift and conflicts. Transaction-local reuse or batched revision lookups are concrete profiling targets. Preserve the existing consistent read snapshot and historical revision semantics.
3. **Measure impact under larger history and fan-out separately.** [`impact`](https://github.com/davidbergman256/loomplane/blob/9cfd206/src/core/store.ts#L926) scans current capsules, visits every stream's state, and checks relevant historical receipts. Its roughly 22.7 ms medium median produces only about 15 KiB of JSON, suggesting material work before serialization. This does not identify which loop dominates. A follow-up should hold stream count fixed while varying dependent descendants and receipt history.
4. **Establish a bounded concurrent HTTP scenario before any capacity claim.** The synchronous SQLite core runs these calls sequentially. A fast individual compile does not establish request throughput or queueing latency while another request builds a snapshot. The next useful measurement should record end-to-end latency and event-loop delay under a small, explicitly capped client mix.

This report supports prioritizing snapshot shape and repeated graph/read work. It does not justify a production SLA, a concurrency claim, multi-node architecture, or a claim that SQLite has reached its limit.
