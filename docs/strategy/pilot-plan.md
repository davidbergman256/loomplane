# First 90 days

September 18, 2026. Targets below are decision gates, not achieved results. No outreach has been sent as part of this build.

## Days 1–14: find the failure before broadening the product

Recruit through the founder’s developer network, agent-tool communities, and maintainers of related open-source projects. Publish the repository and a 90-second synthetic demo showing a changed contract and stale consumers. Share a concrete failure report and working recipe; avoid generic “future of agents” launch copy.

Target 15 qualified conversations and five candidate teams. Ask each to walk through its last cross-task assumption failure, with a real artifact if it can be shared: who changed what, who found out, how late, how much rework, and what existing tools missed. Ask to observe a current workflow. Do not count agreement with a pitch as evidence of pain.

Qualification: at least two independent coding streams, a shared contract that changes, a person who owns integration, and willingness to measure effort. If fewer than five of 15 qualified teams can identify a recent relevant incident, reconsider the segment before building cloud infrastructure.

## Days 15–35: instrument the smallest repeated loop

Run three to five local or customer-controlled pilots, one real repository and one interface change each, using the [pilot kit](pilot-kit.md). Shared pilots can use the current single-server API, scoped keys, remote-backed MCP, and token sign-in. Get explicit agreement on data handled; accept sanitized examples, and do not require full transcript uploads. The founder can assist installation but should log every assistance minute.

Each pilot should exercise two streams, shared and derived capsules, compilation, a revision, transitive drift, and a new packet after review. Exercise the existing CLI/SDK/MCP paths in the two actual coding clients participants use. A saved configuration or available MCP tool is not proof that the agent called it. Capture actual calls and missed calls.

Use the current caller-reported receipt mechanism as instrumentation. It can reject completion against stale tracked context; it cannot prove the model used the packet or that resulting code is correct. A real integration should tie a packet to an agent run and code revision, while labeling claims and independently observed events separately.

## Days 36–60: establish net value

Run matched changes or alternate comparable tasks with and without Loomplane. Baseline: the team’s competent existing setup, including shared files, messages, tests, and native coordination. Preserve agent/model version, task complexity, and human review conditions where feasible. Avoid creating artificial failures solely to make Loomplane look useful.

Measure both seeded, reproducible cases and naturally occurring incidents; report them separately. With five small pilots, estimates will be noisy. Publish counts and time ranges; do not present a statistically established productivity gain.

| Metric                 | Definition                                                                                      | Initial decision threshold                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Activation             | Two streams consume one shared capsule, then detect a revision change                           | Median under 15 minutes on clean setup, without founder typing commands |
| Workflow coverage      | Eligible tasks with recorded start and final completion/abandonment checks / all eligible tasks | At least 80%; correctly blocked checks count as covered                 |
| Useful alert precision | Reviewed flags requiring context or output action / reviewed flags                              | At least 70%; report benign pins and harmless edits separately          |
| Net effort             | Human coordination/rework time saved minus authoring, triage, and setup amortization            | Positive in at least three of five pilots, based on logged observations |
| Recurring use          | Teams completing the loop on three separate weeks                                               | At least three of five, with founder prompts counted                    |
| Commercial signal      | Budget owner agrees to a concrete paid continuation with delivered scope                        | At least two; separate paid contracts from nonbinding interest          |

These thresholds are management choices. Do not move them after seeing results without documenting why. Core precision should also be tested mechanically: exact revision changes must always produce the expected tracked drift; a good product metric cannot excuse a broken invariant.

## Days 61–90: decide whether to build the service

If the loop repeats, quote paid continuation and build only the minimum shared service customers require. Basic keys and portable restore are a team foundation. Match actual deployment, identity, source-permission, and recovery requirements before expanding beyond the agreed pilot data. If demand is only for local convenience, retain the OSS tool and reconsider the venture thesis instead of dressing it up as enterprise adoption.

Distribution deliverables: two excellent client recipes, one repeatable integration example with an existing orchestrator or issue tracker, a public failure-case suite, one customer-approved case study if available, and a short demo that uses the real product. Obtain approval for publishing customer data or endorsements. Seek upstream integrations through contributions; none are promised or completed here.

## Falsification and risk register

| Risk                                         | Test or warning sign                                  | Response                                                                                                                       |
| -------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Teams have little dependency pain            | Incidents are rare or mostly ordinary coding mistakes | Narrow to migrations and interface changes; stop the venture bet if still weak.                                                |
| Manual authoring defeats value               | Setup and capsule maintenance exceed avoided rework   | Capture source-backed contracts at existing review points; do not add an extraction model until evidence warrants it.          |
| Alerts become noise                          | Every wording change causes interruption              | Add explicit change classification and review acknowledgement; keep raw revision drift visible.                                |
| Missing dependencies create false confidence | Important assumptions were never declared             | Show coverage as unknown, inspect missed incidents, and avoid a “safe to ship” badge.                                          |
| Native agent tools absorb the workflow       | Pilots return to built-in features                    | Compete on cross-runtime needs only if users actually have them; integrate or retreat.                                         |
| Shared context spreads poisoned instructions | Imported material is treated as privileged direction  | Preserve source/trust labels; authorize publication; treat retrieved material as data. Enterprise controls remain future work. |
| Source data changes silently                 | Capsule is current but linked file is obsolete        | Exercise the shipped opt-in fingerprints and local checks; measure coverage. Unattached sources remain outside the guarantee.  |
| Managed operations are uneconomic            | Support time dominates the subscription               | Simplify onboarding, revise scope/pricing, or keep deployment customer-operated.                                               |

At day 90 choose one: pursue team cloud on measured recurring demand; narrow the wedge to a higher-pain workflow; or keep a useful open-source project without claiming a venture business. The ambitious outcome requires earning the right to expand.
