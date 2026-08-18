# PRD — Isidore

**Status:** Draft
**Owner:** TBD
**Last updated:** 2026-08-18

---

## 1. Problem

Our AI-native development flow already produces structured planning artifacts in-repo: PRD/BRD documents are broken down by AI into features and todos, stored under a standard folder convention, with developers assigned.

We currently mirror that content into Azure DevOps work items. This is the bottleneck:

- Every ticket creation, field update, comment, and link is a separate API round-trip with its own payload and auth overhead.
- Token cost scales with ticket count, not with work completed. The system's cost grows fastest exactly when the team is most productive.
- The mirroring is pure translation. The source of truth is already in the repo, next to the code.
- Azure API usage is not free, and the spend is not tied to any output the team actually reads.

The plan is to remove the external ticketing system. That creates a new gap: **no consolidated, cross-project view of what is planned, in progress, and done.** Isidore fills that gap by reading what the repos already contain, rather than by maintaining a parallel copy of it.

## 2. Goals

1. Eliminate per-ticket API round-trips as the mechanism for tracking work.
2. Give the team and stakeholders a single dashboard covering all projects, with per-project drill-down.
3. Report on estimation accuracy over time so AI-generated estimates can be tuned.
4. Preserve the repo as the single source of truth. Isidore is a read model, never an authoring surface.
5. Work across git providers, not just GitHub.

## 3. Non-goals

- **Not a ticketing system.** No creating, editing, assigning, or closing work inside Isidore. Work is authored in the repo via PR.
- **Not real-time.** Data updates on merge to `develop`, a few times a day. Sub-second propagation is not a requirement.
- **Not a replacement for code review.** PR review stays in the provider.
- **No AI prose generation in the reporting path** for v1. Reports are derived from parsed data, not written by a model. This is the point of the project — reintroducing per-report LLM calls would recreate the cost problem in a new place.

## 4. Users

| User | Needs |
|---|---|
| Developer | What am I assigned today, what did I finish, what's blocked |
| Tech lead | Cross-project throughput, workload balance, stale/blocked items, rework rate |
| Product / stakeholder | Features shipped per week per project, progress against original PRD-BRD scope, without needing repo access |
| Eng manager | Estimation accuracy trend, cost per feature shipped, cycle-time bottleneck by stage |

## 5. Source data contract

### 5.1 Folder convention

Isidore depends on a team-wide folder standard. Repos that do not follow it will not be parseable.

```
<project-root>/
  docs/
    features/
      GUIDELINES.md          # schema spec — not parsed as a work item
      TEMPLATE-feature.md     # not parsed as a work item
      TEMPLATE-defect.md      # not parsed as a work item
      TEMPLATE-spike.md       # not parsed as a work item
      auth-refresh.md
      billing-export.md
      login-500-on-retry.md
```

Flat, one file per work item — **no week or type subfolder.** A feature's
`created`/`updated` dates and its dated `Daily log` lines already carry
everything a "which week did this happen" view needs; a path can't move
with a feature that spans weeks without breaking `relates_to` links and
git history. Isidore computes weekly grouping at read time instead of
depending on it being encoded in the path.

Every parseable file (i.e. every file except `GUIDELINES.md` and
`TEMPLATE-*.md`) carries required frontmatter:

```yaml
---
id: <slug>
title: <human title>
type: feature | enabler | defect | spike
status: planned | in-progress | blocked | done | cancelled
priority: low | medium | high        # defect uses `severity` instead
owners: [<handle>, ...]
estimate_hours: <number>              # spike uses `timebox_hours` instead
hours_logged: <number>                 # derived from Daily log — never hand-authored
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
relates_to: [<slug>, ...]             # optional — e.g. a defect naming the feature it broke
---
```

Todos and the Daily log use a fixed, parseable line format (owner, hours,
optional due date) rather than free text — see the canonical spec in each
onboarded repo's own `docs/features/GUIDELINES.md`, which this contract mirrors.

### 5.2 Base branch

Feature plans are authored against **`develop`**.

- `develop` is the integration branch for active work; plans are forward-looking and belong there.
- `staging` is a pre-release snapshot — by the time work lands there the plan is history.
- `main` is production truth and would lag reality by a full release cycle.

Planning artifacts arrive on `develop` **via pull request**, not direct commit. This gives a review checkpoint before a feature breakdown becomes official, clean diff history on the planning docs themselves (needed for estimation-drift reporting), and a single reliable automation trigger: merge to `develop`.

### 5.3 Daily reporting

Daily standup content is **derived, not authored**:

- *"What we did yesterday"* is computed by diffing yesterday's parsed state against today's — merged PRs, commits, and todo checkboxes that flipped to done. No one writes it, so it cannot drift from reality.
- *"What to do today"* is a query: open todos filtered by assignee, sorted by priority. Storing it as a file would create a stale copy of a live query.

Two constraints this creates:

- **Open-PR visibility.** A `develop`-only view under-reports, because in-progress work sits on unmerged branches. The worker must read open PR state, not just merged state, or days without merges will look empty.
- **Day boundary.** "Yesterday" must be defined explicitly (team-local, pinned in worker config) so a distributed team doesn't double-count or drop work at the boundary.

## 6. Functional requirements

### 6.1 Onboarding (P0)

- Log in via git provider OAuth.
- Browse and select a repository.
- Select the target folder (default `docs/features/`).
- Generate a per-repo signing secret, displayed once, for the user to store in that repo's CI secrets.
- Emit a copy-pasteable CI config snippet for the detected provider.

### 6.2 Ingest (P0)

- Accept signed snapshot payloads at a single endpoint.
- Verify HMAC signature per repo; reject unsigned or replayed requests.
- Be idempotent: keyed on `provider + repo_id + feature_id`, so re-runs and duplicate deliveries update rather than duplicate. `feature_id` is the file's `id`, stable for the item's life regardless of which week it's touched in.
- Accept **full folder snapshots**, not deltas. Snapshots are small, and a re-run self-heals bad state — worth more than the bandwidth saved.
- Store the raw payload before normalizing, so parser fixes and metric changes can be replayed without asking every repo to re-run CI.
- Reject unknown `payload_schema_version` values with a clear error rather than partially parsing.

### 6.3 Reconciliation (P1)

- Scheduled job pulls via provider API to catch snapshots missed because CI was down, a secret was rotated, or history predates onboarding.
- Compare against last stored snapshot hash; skip the write when nothing changed.
- Push is the primary path; this is the safety net.

### 6.4 Dashboard (P0)

- Cross-project summary: features completed per week, per project.
- Per-project detail view with feature and todo listing, status, assignee.
- Estimated vs actual time per feature.
- Filter by week, project, assignee, status.

### 6.5 Reports

**P0**
- Features completed per week, per project.
- Estimated vs actual per feature, and estimation drift trended over time.
- Stale/blocked todos — untouched past N days. AI-generated backlogs balloon silently; this is the main guard.
- Developer allocation — task count and estimated hours per assignee.

**P1**
- Cycle time by stage: PRD approved → features generated → todos assigned → merged. Identifies the real bottleneck, which is usually human review rather than AI generation.
- Burnup against original PRD-BRD scope, separating planned work from scope creep.
- Traceability coverage: features with no PRD link (orphans), and PRD items never broken down.
- Rework rate — features or todos reopened or regenerated, as a proxy for the AI getting the spec wrong first time.

**P2**
- Estimation drift segmented by feature type. AI estimators are systematically off in specific categories (integration work under-estimated, boilerplate over-estimated); this is the tunable signal.
- Confidence calibration — whether high-confidence estimates are actually more accurate.
- Cost per feature shipped (token/API spend attributed to features), and the cost vs cycle-time tradeoff.
- Human-touch ratio — AI-generated vs human-edited share of a feature's work.
- Defect rate tied back to originating feature.

### 6.6 Digests (P1)

- Daily and weekly digest generated **from the database**, delivered to Slack or email.
- Optional archival: write the generated digest to a dedicated reports branch or reports repo — never to `develop`, to keep feature history readable. 5 projects × 5 days is 25 commits/week of generated noise otherwise.

## 7. Success metrics

| Metric | Target |
|---|---|
| Azure DevOps API spend | Eliminated |
| API calls to read one repo's features folder | 1 outbound POST (from hundreds) |
| Time from merge to dashboard reflecting it | < 5 min |
| Projects onboarded without hand-holding | 100% via self-serve flow |
| Estimation drift, trended | Measurable and declining quarter over quarter |

## 8. Open questions

1. ~~Should estimates be structured frontmatter or free text in the feature markdown?~~ **Resolved:** structured frontmatter (§5.1) — `estimate_hours`/`timebox_hours` and derived `hours_logged`, required for 6.5 P0 reports to work at all.
2. Do we need per-project access control, or is org-wide read acceptable for v1?
3. Retention on raw snapshots — indefinite, or rolling window?
4. Do non-technical stakeholders need any write path (comments, acknowledgement), or is read-only genuinely sufficient?
