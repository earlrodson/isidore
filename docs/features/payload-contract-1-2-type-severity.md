---
schema_version: 1
id: payload-contract-1-2-type-severity
title: Forward type/severity/relates_to through the ingest payload (1.2)
type: feature
status: done
priority: medium
owners: [ecarino@jairosoft.com]
estimate_hours: 6
hours_logged: 6
created: 2026-08-22
updated: 2026-08-22
relates_to: [payload-contract-v1]
---

## Description
`packages/isidore-worker/src/parser.ts` already parsed `type`
(`feature`/`enabler`/`defect`/`spike`), `severity`, and `relates_to` out of
`docs/features/<slug>.md` frontmatter, but the ingest payload contract
never forwarded them — the worker read a defect or spike file just fine
and then silently dropped what made it one before sending. This closes
that gap without touching the frozen `payload-contract-v1.md` (per that
file's own note), the same way the `1.1` `environment` field was added as
an additive bump rather than an edit to the frozen doc.

## Acceptance criteria
- [x] AC-001 — `FeatureSchema` (`packages/shared/src/payload.ts`) gains
  optional `type`, `severity`, and `relates_to` fields; `1.0`/`1.1`
  payloads without them still validate.
- [x] AC-002 — `SUPPORTED_PAYLOAD_SCHEMA_VERSIONS` gains `"1.2"`.
- [x] AC-003 — `core.ts`'s `buildSnapshot` forwards
  `frontmatter.type`/`severity`/`relates_to` onto each feature and emits
  `payload_schema_version: "1.2"`.
- [x] AC-004 — `features` table gains nullable `type`, `severity`,
  `relates_to` columns; `derive.ts` persists them; `queries.ts`'s
  `ProjectDetailFeature` surfaces them.
- [x] AC-005 — Project detail page shows a defect/spike's type and
  severity next to its title, and its `relates_to` list when non-empty.
- [x] AC-006 — A pre-1.2 payload (no `type`/`severity`/`relates_to`)
  degrades to `null` on every new column — never a hard ingest failure.

## Todos
- [x] Bump `packages/shared` schema + fixture + tests (@ecarino@jairosoft.com, est 1h, due 2026-08-22, done 2026-08-22)
- [x] Forward fields in `core.ts` + worker tests (@ecarino@jairosoft.com, est 1h, due 2026-08-22, done 2026-08-22)
- [x] Add `features` columns + migration, update `derive.ts`/`queries.ts` +
  tests (@ecarino@jairosoft.com, est 2h, due 2026-08-22, done 2026-08-22)
- [x] Surface on the project detail page (@ecarino@jairosoft.com, est 1h, due 2026-08-22, done 2026-08-22)
- [x] Backfill `docs/features/GUIDELINES.md` + `TEMPLATE-defect.md` +
  `TEMPLATE-spike.md` so the schema this bump exposes has authoring docs
  (@ecarino@jairosoft.com, est 1h, due 2026-08-22, done 2026-08-22)

## Daily log
- 2026-08-22 (@ecarino, 6h): Evaluated rapidfire's `docs/specifications/`
  convention (GUIDELINES.md + type-specific templates) against isidore's
  own `docs/features/`. Found `parser.ts` already implemented the richer
  schema (`type`/`severity`/`relates_to`) but isidore's own docs lacked
  the matching templates, and the payload contract/db/dashboard never
  forwarded those fields past the parser. Scaffolded the missing
  `GUIDELINES.md`, `TEMPLATE-defect.md`, `TEMPLATE-spike.md`, then closed
  the transport gap: `packages/shared` schema bump to `1.2` (2 new tests +
  1 new fixture), `core.ts` forwarding (1 new worker test), `packages/db`
  schema/derive/queries (migration `0004_flaky_exodus.sql`, 3 new tests),
  and the project detail page. Also fixed a pre-existing, unrelated
  `listProjectSummaries` test failure (confirmed via `git stash` to fail
  identically without this change): `doneFeature` inherited
  `feature.todos` from the `valid.json` fixture, whose `due: "2026-08-20"`
  was in the future when the test was written but is now in the past
  relative to today (2026-08-22), so the "done" project picked up a
  spuriously stale todo. Gave `doneFeature` an explicit `todos: []` since
  the test's intent was never about that project's todos. All gates
  green: `@isidore/shared` 13/13, `@isidore/worker` 56/56, `@isidore/db`
  21/21, `@isidore/web` 42/42, typecheck clean across all four.

## Decisions & risks
- **Additive-only, per the frozen-contract precedent.** Same reasoning as
  `1.1`'s `environment` field: `payload-contract-v1.md` stays untouched;
  this is tracked as its own item and the new fields are optional so
  already-deployed `1.0`/`1.1` senders keep working.
- **Fixed the pre-existing date-bomb test, in scope once found.** It
  wasn't caused by this change, but leaving a red test in the suite would
  have made the next unrelated change's `pnpm -r test` output ambiguous —
  cheaper to fix the one-line cause (`doneFeature` needed its own
  `todos: []`) than to carry a known-red baseline forward.

## Links
- PR:
- Branch:
