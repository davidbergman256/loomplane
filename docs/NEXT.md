# Next substantive milestones

The 0.1 preview is a working local/shared-server context runtime. The following are prioritized product bets, not claims of completed functionality. Keep the active work tied to outcomes rather than code volume.

## 1. Zero-setup concept demo and distribution

Make the changed-contract scenario understandable in one minute. Provide a public, explicitly synthetic interactive demonstration and an installation path that does not require reading infrastructure docs. Use the real protocol semantics; distinguish a browser demonstration from a live multi-agent execution. Fix actual GitHub CI failures before further feature work.

## 2. Better context coverage and adoption

Measure the proportion of real tasks that record packets and invoke completion checks. Existing hooks are opt-in; they do not automatically capture everything. Add useful explicit workflow integrations and source-aware refresh suggestions, not an indiscriminate home-directory scanner. Importing a changed source file should not silently keep outdated content because its line URI is unchanged.

## 3. Explainability under change

Add a concise packet-to-packet diff and a stronger revalidation workflow. Help the developer decide whether a source change matters. A changed revision is not necessarily a semantic incompatibility. A refreshed packet is not proof that the work was rechecked.

## 4. Operational foundation

Add bounded pagination, idempotency for retryable network writes, snapshot consistency across processes, explicit schema migrations and portable version compatibility. Measure realistic local workloads before claiming scale. Replace recursive graph traversal with bounded iterative traversal as larger graphs are supported. Basic safety, backup and scoped credentials stay open source.

## 5. Enterprise validation

Use the pilot kit with real agent-heavy teams. External outreach has not been sent. Seek evidence of repeated avoided stale-assumption work and willingness to pay for shared operation. Managed hosting, SSO, source ACL inheritance, regional deployment and compliance-grade evidence remain future paid capabilities, not implemented checkbox claims.

## Current verification limits

- Behavioral smoke scenarios cover implemented invariants; no formal security certification or long-running production soak.
- Browser workflows were exercised at desktop and narrow widths, including reader/writer access.
- Dockerfile exists, but no Docker runtime was available on the build host.
- No customer traction, pricing validation, model-quality benchmark or independently observed revalidation outcome is claimed.
