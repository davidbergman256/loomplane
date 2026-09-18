# Design-partner pilot kit

September 18, 2026. Reusable preparation material; nothing here has been sent. Loomplane is the current working name. The [90-day plan](pilot-plan.md) defines portfolio-level gates; this worksheet is for one team.

## Offer

A three-week, customer-controlled evaluation of one real interface change with two independent coding streams. Use local mode or one shared server with scoped credentials. Keep existing agents, repository, tests, and review process. The founder helps configure the workflow; record that effort. Agree the pilot scope and any fee explicitly—do not imply a commercial agreement already exists.

The prototype can track declared dependencies, check revisions, preserve receipts, and export/restore history. It does not supply managed synchronization, SSO, inherited document permissions, or a guarantee that agents followed the supplied context. Start with material the participants are authorized to share within that project; service keys scope projects, not individual source documents.

## Discovery interview: 20 minutes

1. Show the last change where one coding task used an assumption another task had changed. What exact artifact or decision moved?
2. When did the consumer learn about it? How was it discovered, and what work had to be redone?
3. Which agents, files, messages, tests, or coordination tools were already in use? What did they catch successfully?
4. Who could have published the dependency, and at which existing workflow step? How much additional work would that be?
5. How often has this happened in the past month? Separate remembered examples from guesses.
6. Which current project could test this without fabricating a problem? Who owns integration, deployment, and the budget?
7. What outcome would make you keep using it? What would make you remove it? Ask for a concrete threshold before showing price ideas.

## Success worksheet

Complete with the participant before installation. Blank cells are intentional fields, not claimed results.

| Field                                                             | Pilot entry |
| ----------------------------------------------------------------- | ----------- |
| Team, technical owner, budget owner                               |             |
| Dates; repository and interface change                            |             |
| Two coding clients and model versions                             |             |
| Existing coordination baseline                                    |             |
| Deployment owner; permitted data; keys and revocation owner       |             |
| Shared contract, derived capsule, source files explicitly covered |             |
| Eligible tasks; start/final checks recorded; coverage percentage  |             |
| Natural incidents / seeded demo incidents, counted separately     |             |
| Alerts reviewed / useful / harmless / missed incidents            |             |
| Human minutes: setup, capsule upkeep, alert triage, rework        |             |
| Baseline minutes; comparison method; uncertainty                  |             |
| Founder assistance minutes and prompts                            |             |
| Code review/test evidence after a revision changed                |             |
| Export/restore exercised; cleanup owner and date                  |             |
| Continuation decision; actual agreed scope/price, if any          |             |

Three-week sequence: week 1 captures the baseline and validates setup; week 2 exercises a real shared change; week 3 repeats without founder prompting and reviews the evidence. Suggested continuation criteria: at least 80% check coverage, mostly actionable flags, positive net observed effort, and the team independently choosing to repeat. Agree exact thresholds for this team in advance. A zero-incident pilot is informative but cannot establish prevention value; extend only if a relevant real change is scheduled.

Count a blocked preflight as an executed check. Do not count every flag as avoided rework, every receipt as model compliance, or founder-assisted use as independent adoption. End with continue, narrow, or stop and a written reason.

## Draft: developer or engineering lead

Subject: A small test for stale assumptions between coding agents

Hi [Name],

I saw [specific, verified detail about your team’s agent workflow]. I’m building Loomplane, an open-source tool that records which version of a shared decision each coding task received and flags affected tasks when that decision changes.

I’m looking for a team with a recent frontend/backend, API, or schema change where independent agent sessions got out of sync. Could we spend 20 minutes walking through one example? If the problem fits, we could test one real change on your machine or a server you control, using your existing tools.

The team prototype is available at [github.com/davidbergman256/loomplane](https://github.com/davidbergman256/loomplane). I want to measure coordination effort and actual corrections, including cases where your existing setup already handles this well.

[Founder name]

## Draft: tool maintainer

Subject: Testing a context-dependency adapter for [tool]

Hi [Name],

[Specific integration point] in [tool] looks relevant to an experiment I’m running. Loomplane records exact context revisions and identifies affected consumers after a shared assumption changes. It has an open CLI, HTTP SDK, and MCP interface.

I’d like to test a small optional adapter at [existing start/completion hook], then compare it with [tool]’s existing coordination. Is that the appropriate extension point? I can share a minimal reproducible stale-contract case and a proposed integration before asking for maintenance effort.

[Repository link and founder name]
