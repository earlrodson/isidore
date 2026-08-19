---
schema_version: 1
id: dashboard-cross-project
title: Dashboard — cross-project summary + per-project detail
type: feature
status: done
priority: high
owners: [earlrodsin@gmail.com]
estimate_hours: 10
hours_logged: 8
created: 2026-08-19
updated: 2026-08-19
prd_ref: docs/PRD.md#5
relates_to: [postgres-schema-snapshots, payload-contract-v1]
---

## Description
Build order step 5 (TECHSTACK.md §8): a read-only dashboard in `apps/web`
over the normalized tables (`projects`, `features`, `todos`, `estimates`,
`actuals`, `status_events` in `packages/db`) — a cross-project summary view
and a per-project detail view. This is the first user-facing surface of the
system; everything before it (payload contract, ingest, worker) only exists
to fill these tables. No new ingest/write logic — purely queries + UI over
data `apps/web/src/app/api/ingest/route.ts` already writes.

## Acceptance criteria
- [x] Cross-project summary page lists every onboarded project (from
      `projects`) with: feature completion (`done` / total features),
      stale-todo count (open todos with `due` in the past), and most recent
      snapshot `received_at`
- [x] Per-project detail page (one route per project, keyed on
      `provider + repo_id`) lists that project's features with status,
      `estimate_hours` vs `hours_logged`, todos (open/done), and `open_prs`
- [x] Every number on both pages is a query over the normalized tables
      (`packages/db`) — never a re-parse of `snapshots.raw` jsonb in the UI
      layer, per TECHSTACK.md §4.2's "reports are queries/views over
      normalized tables, not ad-hoc parsers" rule
- [x] A project with zero features (onboarded but no snapshot pushed yet)
      renders an explicit empty state, not a crash or a blank table
- [x] Both pages load with no client-side data fetching waterfall — data
      fetched server-side (Next.js Server Components / route handlers),
      consistent with `apps/web`'s existing App Router structure

## Todos
- [x] Write query functions in `packages/db` (or a new `apps/web` data
      layer) for: project list + completion/staleness rollup, per-project
      feature+todo detail (@earlrodsin@gmail.com, est 3h, due 2026-08-21, done 2026-08-19)
- [x] Build cross-project summary page (@earlrodsin@gmail.com, est 3h, due 2026-08-22, done 2026-08-19)
- [x] Build per-project detail page (@earlrodsin@gmail.com, est 3h, due 2026-08-24, done 2026-08-19)
- [x] Tests: query layer (real Postgres or seeded fixtures) + empty-state
      rendering (@earlrodsin@gmail.com, est 1h, due 2026-08-24, done 2026-08-19)

## Daily log
- 2026-08-19 (@earlrodsin@gmail.com, 0h): item created
- 2026-08-19 (@earlrodsin@gmail.com, 8h): added `packages/db/src/queries.ts`
  (`listProjectSummaries` — feature completion, stale-todo count, and last
  snapshot `received_at` per project, each a separate grouped query merged in
  JS to avoid join fan-out; `getProjectDetail` — features + todos + open PRs
  keyed on `provider + repo_id`, returning `null` only when the project was
  never onboarded, distinct from zero features). Added
  `apps/web/src/app/page.tsx` (cross-project summary table) and
  `apps/web/src/app/projects/[provider]/[...repoId]/page.tsx` (per-project
  detail; catch-all segment since `repo_id` values like `org/repo` contain a
  slash). Both are Server Components (`dynamic = "force-dynamic"`, no client
  fetching). Added `apps/web/src/lib/db.ts`, a memoized `getDb()` so repeated
  Server Component renders share one pool. 5 new tests in
  `packages/db/src/__tests__/queries.test.ts` (rollup counts, stale-todo
  filter, null-vs-empty-features distinction) — required adding
  `fileParallelism: false` to `packages/db/vitest.config.ts` since test files
  share one live Postgres DB truncated in `beforeEach`, and running two test
  files concurrently raced truncate against the other file's inserts (this
  surfaced as an existing `derive.test.ts` test failing only once a second
  test file existed). Manually verified both pages end-to-end against a
  locally seeded dev DB via `pnpm --filter @isidore/web dev`: summary page
  correctly showed completion ratios and stale counts, detail page rendered
  features/todos/PRs, and an unknown `provider+repo_id` correctly 404s.
  `pnpm -r typecheck` and `pnpm -r test` clean (74 tests total).

## Decisions & risks
- No auth in front of these pages yet — onboarding OAuth (TECHSTACK.md §8
  step 7) isn't built. Acceptable for now since there's only one
  internally-run instance and no external users, but flag before this ships
  anywhere multi-tenant.
- "Stale todo" definition (open + `due` in the past) is the same heuristic
  GUIDELINES.md uses for "today's overdue work" — reuse rather than invent a
  second definition, since the P0 "stale todos" report (TECHSTACK.md §8 step
  6) will need the exact same query.
- Deliberately no charts/Recharts in this pass — TECHSTACK.md §4 lists
  Recharts for "the report set," which is step 6, not this scaffolding step.
  Tables only for v1.

## Links
- PR:
- Branch:
