---
schema_version: 1
id: p0-reports
title: P0 reports — completion/week, estimation drift, developer allocation
type: feature
status: done
priority: high
owners: [earlrodsin@gmail.com]
estimate_hours: 17
hours_logged: 17
created: 2026-08-19
updated: 2026-08-19
prd_ref: docs/PRD.md#6.5
---

## Description
TECHSTACK.md §8 build order step 6, the last piece before onboarding. The
write path already derives everything these need — `estimates`, `actuals`,
and `status_events` are append-only, one row per feature per week
(`packages/db/src/derive.ts`) — so this is a read-side gap only: new query
functions in `packages/db/src/queries.ts` plus dashboard views, no schema or
ingest changes. Covers the three PRD §6.5 P0 reports not yet built (stale
todos already ships in `dashboard-cross-project`).

## Acceptance criteria
- [x] Per-project, per-week count of features whose `status_events` row
      turned `done` that week (a feature only counts once, the week it first
      flips to done — not every week it stays done).
- [x] Estimation drift (`actuals.hours_logged - estimates.estimate_hours`)
      trended by week, per project and rolled up cross-project.
- [x] Developer allocation: open todo count and summed `estimate_hours` per
      assignee, across all projects, filterable by project.
- [x] All three are queries/views over the normalized tables — no re-parsing
      `snapshots.raw` (TECHSTACK.md §4.2).

## Todos
- [x] `listFeaturesCompletedPerWeek(db, { provider?, repoId? })` in
      `packages/db/src/queries.ts`, sourced from `status_events` (@earlrodsin, est 3h, done 2026-08-19)
- [x] `listEstimationDrift(db, { provider?, repoId? })` joining `estimates` +
      `actuals` by `featureId` + `week` (@earlrodsin, est 3h, done 2026-08-19)
- [x] `listDeveloperAllocation(db, { provider?, repoId? })` grouping `todos`
      by `ownerId` where `done = false` (@earlrodsin, est 2h, done 2026-08-19)
- [x] Dashboard: add a reports section to `apps/web/src/app/page.tsx`
      (cross-project) rendering the three above (@earlrodsin, est 4h, done 2026-08-19)
- [x] Dashboard: per-project drill-down of the same three, scoped to one repo
      (@earlrodsin, est 2h, done 2026-08-19)
- [x] Vitest coverage for each new query function against fixture rows
      (@earlrodsin, est 3h, done 2026-08-19)

## Daily log
- 2026-08-19 (@earlrodsin, 17h): implemented the three P0 report queries plus
  cross-project and per-project dashboard sections, format helper for
  hours/drift rounding, and a global.css layer; 81 tests passing repo-wide.

## Decisions & risks
- Feature-completed-per-week counts first `done` transition only, per
  `status_events`; a feature reopened and redone later is not double-counted
  unless we later decide rework rate (PRD.md §6.5 P1) needs the reopen event
  too — that's a separate report, not this one.
- Estimation drift uses whatever `week` the estimate/actual rows share; if a
  feature's estimate changes mid-flight the drift series reflects that week's
  snapshot, not the original estimate — matches PRD.md §5.1 (estimates are
  point-in-time frontmatter, not immutable).
- Shipped as plain HTML tables, not Recharts as originally scoped — the app
  had zero styling/charting before this feature, so pulling in a chart
  library for one trend line was scope creep for a first pass. Added
  `apps/web/src/app/globals.css` (basic layout/table styling) and
  `apps/web/src/lib/format.ts` (1-decimal rounding, `+`-prefixed drift)
  instead, per follow-up request. Revisit Recharts once there's an actual
  multi-point trend chart worth visualizing.

## Links
- PR:
- Branch:
