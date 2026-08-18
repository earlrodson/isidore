---
schema_version: 1
id: postgres-schema-snapshots
title: Postgres schema — raw snapshots + normalized tables
type: feature
status: planned
priority: high
owners: [earlrodsin@gmail.com]
estimate_hours: 10
hours_logged: 0
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
- [ ] `snapshots` table stores the raw payload as `jsonb` plus its content
      hash, keyed for idempotent overwrite on `provider + repo_id +
      feature_id`
- [ ] Normalized tables exist per TECHSTACK.md §4.2 and are populated by a
      deterministic derivation step, not written to directly by ingest
- [ ] Replaying stored `snapshots` rows regenerates the normalized tables
      identically (needed for parser-bug/metric-change replay per §4.2)
- [ ] Reconcile-friendly: comparing a fresh pull's hash against the stored
      hash correctly skips the write when nothing changed

## Todos
- [ ] Write migration for `snapshots` table (@earlrodsin@gmail.com, est 2h)
- [ ] Write migrations for normalized tables (@earlrodsin@gmail.com, est 3h)
- [ ] Write snapshot → normalized-table derivation function + tests (@earlrodsin@gmail.com, est 5h)

## Daily log
- 2026-08-18 (@earlrodsin@gmail.com, 0h): item created

## Decisions & risks
- Depends on [[payload-contract-v1]] being frozen — schema shape here should
  not be finalized until that item is `done`.

## Links
- PR:
- Branch:
