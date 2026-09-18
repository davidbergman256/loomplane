# Open source and revenue hypotheses

September 18, 2026. Prices and volumes below are experiments and arithmetic, not a published offer, market sizing, forecast, or customer evidence. No paid service is available in the prototype.

## The permanent bargain

The Apache-2.0 core should be enough for a normal developer or small team to succeed: local storage, CLI, local/remote-backed MCP, workbench, typed SDK, versioned capsules, transitive dependencies, compilation, source fingerprints, drift checks, receipts, import/restore/export, single-server self-hosting, and basic project-scoped reader/writer credentials with revocation. Do not charge for access to a user’s own history, cap useful local projects, or withhold basic correctness fixes. Standard formats and protocol clients stay open.

Prospective commercial value is running this reliably across an organization: managed synchronization, enterprise identity, source-aware authorization, credential lifecycle administration, policy, retention operations, managed backup and recovery, regional or private deployment, support, and contractual service levels. These must be built and demonstrated before they are sold as capabilities. Basic keys and portable restore are already free. Paid packaging is for operated capabilities and organizational controls; the current project-key boundary is not source authorization or proof of production hardening.

Do not quietly relicense released core versions or manufacture friction to force upgrades. Publish a feature boundary when a commercial implementation exists. Keep an exit path through documented export formats. Apache-2.0 allows competing hosted offerings; accept that risk and compete on operation and integration quality.

## Packaging tests

| Offer hypothesis | Initial price test                                                                          | Conditions and reason to pay                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core             | Free                                                                                        | Local use and self-host; no per-agent charge.                                                                                                                                                             |
| Team Cloud       | $300/workspace/month including 10 human maintainers; $20/additional active maintainer/month | Only after managed synchronization, human access administration, and recovery operations exist. Includes a disclosed fair-use allowance; meter infrastructure internally before inventing usage overages. |
| Business         | $1,500/workspace/month including 50 maintainers                                             | Hypothesized managed policy, identity integration, longer retention, support. Test willingness to pay before building the whole bundle.                                                                   |
| Enterprise       | $30,000–$100,000 annual contract hypothesis                                                 | Deployment, controls, and service requirements vary. Scope and price operational costs explicitly. No current SOC 2, SSO, private-cloud, or SLA claim.                                                    |

Prefer a workspace/platform fee to pricing by agent count: users should not be punished for parallelism, ephemeral workers, or switching models. Human-maintainer expansion is a testable proxy for organizational value. If customers cannot understand it, test a flat organization fee before adding a complicated consumption tariff. Model inference is not bundled.

## Bottom-up revenue arithmetic

These are separate steady-state installed-base scenarios, not cumulative cohorts or deadlines. Customer counts are assumed active paying organizations; no existing customers are implied.

| Scenario                       | Assumptions                                                   |           Annual recurring revenue |
| ------------------------------ | ------------------------------------------------------------- | ---------------------------------: |
| Early commercial proof         | 50 Team at $300/month + 10 Business at $1,500/month           | $180,000 + $180,000 = **$360,000** |
| Substantial developer business | 500 Team + 100 Business + 20 Enterprise at $50,000/year       |  $1.8m + $1.8m + $1.0m = **$4.6m** |
| Venture-scale hurdle           | 5,000 Team + 2,000 Business + 500 Enterprise at $100,000/year |     $18m + $36m + $50m = **$104m** |

The final row is a requirement for the ambition, not proof that 7,500 organizations will buy. It requires a repeatable channel, many procurement cycles, international support, expansion, and enterprise value substantially beyond the current prototype. No percentage of an invented total market is needed.

Acquisition sensitivity: at an assumed 3% activation-to-paid rate, acquiring 500 Team accounts needs about 16,667 activated organizations. At 1%, it needs 50,000. Downloads and stars are not activated organizations. At 90% assumed annual logo retention, a 500-account base loses 50 accounts annually before growth; this is why retention matters more than a launch spike.

Unit economics test, not observed cost: a $300/month workspace with $30/month infrastructure and $40/month recurring support cost contributes $230/month before acquisition and R&D, or 76.7%. A $1,000 acquisition cost would take about 4.35 months to recover. If support costs $200/month instead, contribution falls to $70, or 23.3%, and recovery takes 14.3 months. Measure actual support minutes and storage/compute costs during pilots; a low-inference product can still be expensive to operate.

Value check: assuming $100/hour loaded engineering cost, saving five net team hours/month yields $500/month of time value. This is only a discovery hypothesis; subtract capsule maintenance, integration, and alert triage. Enterprise pricing needs broader workflow and operational value, not a claim that every stale flag saved an hour.

## What earns the first invoice

A customer identifies recurring coordination pain, uses Loomplane without founder supervision, and accepts a defined paid scope that exists. A paid design-partner engagement can cover a bounded deployment and evaluation; label services and one-time fees separately from subscription ARR. A nonbinding letter of intent, free pilot, or verbal price interest is not revenue.
