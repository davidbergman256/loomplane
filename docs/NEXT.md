# Next substantive milestones

The 0.1 preview is a working local/shared-server context runtime. The following are prioritized product bets, not claims of completed functionality. Keep the active work tied to outcomes rather than code volume.

## 1. Zero-setup concept demo and distribution

The static concept demo now implements the changed-contract scenario, and the repository has passed its first GitHub CI run. Publish and verify the Pages build, attach an installable preview, and watch for actual onboarding failures. The demo is synthetic and does not execute coding agents.

## 2. Better context coverage and adoption

Measure the proportion of real tasks that record packets and invoke completion checks. The explicit command runner supplies packet files and checks freshness before recording completion; it does not force a model to read those files. Hooks remain opt-in. Source re-import now updates managed records while preserving local edits as conflicts. Next, exercise two real coding clients and measure actual packet/check coverage.

## 3. Explainability under change

Historical packet diffs and bounded packet history are implemented in the core, transports and workbench. Next, strengthen the review/revalidation workflow around those comparisons. Help the developer decide whether a source change matters. A changed revision is not necessarily a semantic incompatibility. A refreshed packet is not proof that the work was rechecked.

## 4. Operational foundation

Packet history uses bounded insertion-order pagination, and composite reads now hold a coherent SQLite snapshot across concurrent clients. Extend pagination to other growing lists; add idempotency for retryable network writes, explicit schema migrations and portable version compatibility. Measure realistic local workloads before claiming scale. Replace recursive graph traversal with bounded iterative traversal as larger graphs are supported. Basic safety, backup and scoped credentials stay open source.

## 5. Enterprise validation

Use the pilot kit with real agent-heavy teams. External outreach has not been sent. Seek evidence of repeated avoided stale-assumption work and willingness to pay for shared operation. Managed hosting, SSO, source ACL inheritance, regional deployment and compliance-grade evidence remain future paid capabilities, not implemented checkbox claims.

## Current verification limits

- Behavioral smoke scenarios cover implemented invariants; no formal security certification or long-running production soak.
- Browser workflows were exercised at desktop and narrow widths, including reader/writer access.
- Dockerfile exists, but no Docker runtime was available on the build host.
- No customer traction, pricing validation, model-quality benchmark or independently observed revalidation outcome is claimed.
