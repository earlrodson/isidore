---
schema_version: 1
id: environment-promotion-history
title: Per-ticket environment promotion history (when each ticket reached staging/production)
type: feature
status: new
priority: medium
owners: [ecarino@jairosoft.com]
estimate_hours: 6
hours_logged: 0
created: 2026-08-24
updated: 2026-08-24
# 2026-08-24: feature-environment-tracking's AC-007-012 are now
# implemented — deriveSnapshot no longer touches features.environment at
# all; packages/db/src/environment.ts's writeEnvironmentPing/
# deriveEnvironmentPing (not deriveSnapshot) is the real write path now,
# backed by a raw `environment_pings` table. Update this spec's ACs/todos
# below to build environment_events off deriveEnvironmentPing, not
# deriveSnapshot, before implementing.
prd_ref: docs/PRD.md#5.2
relates_to: [feature-environment-tracking, postgres-schema-snapshots, p0-reports]
---

## Description
`feature-environment-tracking` (done) gives every ticket a *current*
`environment` snapshot (`develop | staging | production | null`), recomputed
fresh on every push and overwritten in place on `features.environment`. It
answers "where is this ticket now," not "when did it get there." This
feature adds an append-only history of environment observations per ticket
per week — mirroring how `status_events` already tracks `status` over
time — so a per-ticket "time to ship" and a per-week promotion count become
answerable without re-deriving anything from git.

## Traceability & Strategic Intent
- **Outcome Alignment:** P0 reporting completeness (PRD.md §6.5) — cycle
  time from merge to production is currently invisible past "is it done."
- **Strategy Intent:** Teams already trust `status_events`/`estimates`/
  `actuals` as the append-only source for weekly reports; environment
  promotion should work the same way rather than requiring a bespoke query
  against git history per report.
- **Execution Intent:** Every snapshot already carries `environment`
  (payload `1.1`+); the gap is purely on the write/derive/query side —
  no worker or payload change needed.
- **Benefit Hypothesis:**
  - *By implementing:* an `environment_events` table + derive step + query,
    exactly parallel to `status_events`.
  - *We will improve:* visibility into shipping lead time per ticket and
    per-week staging/production promotion counts.
  - *As measured by:* a "days from merge to production" figure per ticket,
    and a promotions-per-week count usable the same way
    `listFeaturesCompletedPerWeek` is today.

## Product Context
- **Customer Context:** whoever's already reading the per-project detail
  page and the completion-per-week report — this is an additive column/report,
  not a new audience.
- **Operating Context:** same ingest → derive pipeline as every other
  normalized table; no new infra, no new payload field, no worker change.
- **Ecosystem Context:** purely additive to `packages/db` — `deriveSnapshot`
  and `replayAll` gain one more table to write/truncate; existing replay
  semantics (deterministic re-derive from stored `snapshots`) must keep
  holding.
- **Regulatory Context:** none — same data already flows through the
  system today via `features.environment`, this just retains history of it.

## Behavior Specifications

```gherkin
Scenario: A ticket's first-ever staging push is recorded
  Given a ticket has never appeared in an environment_events row
  When a snapshot arrives with environment "staging" for that ticket
  Then an environment_events row is written for that ticket's week with
    environment "staging"

Scenario: The same week's re-push overwrites, not duplicates
  Given a ticket already has an environment_events row for week 2026-W34
  When a second snapshot for the same ISO week arrives with a different
    environment value
  Then the existing row for that (featureId, week) is updated in place,
    not inserted as a second row

Scenario: An undetermined environment is not recorded
  Given a snapshot's resolved environment is null (neither staging nor
    production branch could be resolved)
  When that snapshot is derived
  Then no environment_events row is written for that ticket/week

Scenario: "First reached production" is stable even if a later push regresses
  Given a ticket reached "production" in week 2026-W30
  And a later revert makes week 2026-W32's push resolve to "develop" again
  When a report asks when the ticket first reached production
  Then it still reports 2026-W30, not null and not 2026-W32

Scenario: Reaching production without an explicit staging observation still
  counts as having reached staging
  Given a ticket's environment jumps directly from "develop" to
    "production" in one push (staging and production promoted the same day)
  When a report asks when the ticket first reached staging
  Then it reports that same push's week, since production implies staging
    was cleared even though no row explicitly recorded "staging"

Scenario: Replay rebuilds history identically
  Given environment_events has been populated from live ingest traffic
  When `replayAll` truncates and re-derives every normalized table from
    stored `snapshots` rows
  Then environment_events ends up in the exact same state as before the
    replay
```

## Acceptance criteria
- [ ] `environment_events` table added (`packages/db/src/schema.ts`):
      `id`, `featureId` (FK → `features.id`, cascade delete), `week`,
      `environment` (text, not null), `recordedAt` — unique on
      `(featureId, week)`, exactly parallel to `statusEvents`.
- [ ] `environment_events` is written from inside
      `packages/db/src/environment.ts`'s `deriveEnvironmentPing` (not
      `deriveSnapshot` — that path no longer touches `environment` at all
      as of feature-environment-tracking's AC-012), immediately after it
      updates `features.environment` for a given `(featureId, week)`.
      Skip the write when `deriveEnvironmentPing` skipped the update too
      (unknown feature id, or the incoming rank didn't outrank the
      current one) — this table should only ever reflect environments
      the feature actually reached, not every ping received.
- [ ] `replayAll` truncates `environment_events` alongside the other
      normalized tables and rebuilds it deterministically.
- [ ] A migration is generated via `pnpm db:generate` (no manual SQL) and
      committed alongside the schema change.
- [ ] New query `getFeatureEnvironmentHistory(db, featureId)` returns the
      first week each of `develop`/`staging`/`production` was reached (or
      implied-reached per the rank rule below), using
      `develop(1) < staging(2) < production(3)` so "first reached staging"
      is `MIN(recordedAt) WHERE rank(environment) >= rank('staging')`, not
      an exact-match lookup — this is what makes the "skipped staging"
      scenario above resolve correctly.
- [ ] New query `listEnvironmentPromotionsPerWeek(db, scope?)` — same shape
      and `ProjectScope` filter as `listFeaturesCompletedPerWeek`, one row
      per `(provider, repoId, week, environment)` counting tickets that
      *first* reached that stage in that week.
- [ ] Per-project detail page (`apps/web/src/app/projects/[provider]/[...repoId]/page.tsx`)
      shows each ticket's first-reached staging/production dates alongside
      the existing current-environment bracket, when available.
- [ ] Unit tests cover: same-week overwrite, null-environment skip, the
      regression-doesn't-erase-first-reached case, the
      skip-straight-to-production-implies-staging case, and a replay
      producing identical results to live derivation.

## Todos
- [ ] Add `environment_events` schema + migration (@ecarino@jairosoft.com, est 1h)
- [ ] Wire `deriveSnapshot`/`replayAll` (@ecarino@jairosoft.com, est 1h)
- [ ] `getFeatureEnvironmentHistory` + `listEnvironmentPromotionsPerWeek` queries (@ecarino@jairosoft.com, est 2h)
- [ ] Dashboard: surface first-reached dates on per-project detail (@ecarino@jairosoft.com, est 1h)
- [ ] Tests for overwrite/null-skip/regression/rank-implies/replay cases (@ecarino@jairosoft.com, est 1h)

## Daily log
- 2026-08-24 (@ecarino@jairosoft.com, 0h): spec authored — no code yet.

## Decisions & risks
- **Rank-based "reached," not exact-match.** A push can promote develop
  straight to production in one step (e.g. hotfix branches merged same
  day). Treating "reached staging" as "reached staging or anything further"
  avoids reporting a false negative for tickets that legitimately skipped
  an explicit staging observation.
- **First-reached is monotonic even if the live signal isn't.** git-derived
  `environment` can regress on revert; the history table intentionally
  never "un-records" an earlier promotion — `MIN(recordedAt)` naturally
  gives this for free without special-casing reverts.
- **No worker/payload change.** `environment` has been on the wire since
  payload `1.1`; this is purely additive on the derive/query side, so no
  version bump is needed here (contrast with the `1.3` bump the status
  enum rename required).

## Links
- PR:
- Branch:
