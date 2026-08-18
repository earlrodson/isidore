---
schema_version: 1
id: postgres-schema-snapshots
title: Postgres schema — raw snapshots + normalized tables
type: feature
status: done
priority: high
owners: [earlrodsin@gmail.com]
estimate_hours: 10
hours_logged: 9
created: 2026-08-18
updated: 2026-08-18
# target_date: YYYY-MM-DD
prd_ref: docs/PRD.md#6.2
relates_to: [payload-contract-v1]
---

## Description
Stand up the two-tier storage model from TECHSTACK.md §4.2: a raw `snapshots`
jsonb table plus normalized tables (`projects`, `features`, `todos`,
`assignees`, `estimates`, `actuals`, `status_events`) derived from it. Build
order step 2 (TECHSTACK.md §8) — depends on the payload contract being
frozen first.

## Acceptance criteria
- [x] `snapshots` table stores the raw payload as `jsonb` plus its content
      hash, keyed for idempotent overwrite on `provider + repo_id +
      feature_id`
- [x] Normalized tables exist per TECHSTACK.md §4.2 and are populated by a
      deterministic derivation step, not written to directly by ingest
- [x] Replaying stored `snapshots` rows regenerates the normalized tables
      identically (needed for parser-bug/metric-change replay per §4.2)
- [x] Reconcile-friendly: comparing a fresh pull's hash against the stored
      hash correctly skips the write when nothing changed

## Todos
- [x] Write migration for `snapshots` table (@earlrodsin@gmail.com, est 2h)
- [x] Write migrations for normalized tables (@earlrodsin@gmail.com, est 3h)
- [x] Write snapshot → normalized-table derivation function + tests (@earlrodsin@gmail.com, est 5h)

## Daily log
- 2026-08-18 (@earlrodsin@gmail.com, 0h): item created
- 2026-08-18 (@earlrodsin@gmail.com, 9h): built packages/db with Drizzle ORM
  — snapshots table (unique on provider+repo_id+feature_id), normalized
  tables (projects, features, assignees, feature_assignees, todos, estimates,
  actuals, status_events), deterministic derive/replayAll, hash-skip write
  path. 5 integration tests passing against local Postgres (isidore_test).

## Decisions & risks
- Depends on [[payload-contract-v1]] being frozen — schema shape here should
  not be finalized until that item is `done`. Resolved: payload-contract-v1
  is done, schema built against its final shape.
- estimates/actuals/status_events are append-only keyed on (feature_id,
  week), not (feature_id, snapshot content) — trend history only accumulates
  from ingestion time forward, since `snapshots` itself keeps only the latest
  row per feature per TECHSTACK.md §6 ("never forks a new row per week").
  Full historical replay only reconstructs current-state tables exactly, not
  pre-onboarding trend history — acceptable per the contract as written.

## Links
- PR:
- Branch:
