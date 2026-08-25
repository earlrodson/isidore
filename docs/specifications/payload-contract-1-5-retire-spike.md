---
schema_version: 1
id: payload-contract-1-5-retire-spike
title: Retire spike, add TEMPLATE-enabler.md, sync the isi-init scaffold bundle (1.5)
type: feature
status: done
priority: medium
owners: [ecarino@jairosoft.com]
estimate_hours: 2
hours_logged: 2
created: 2026-08-25
updated: 2026-08-25
relates_to: [payload-contract-1-4-experiment-prototype, isi-cli-init]
---

## Description
Follow-up to `payload-contract-1-4-experiment-prototype`: rapidfire's
`docs/specifications/` convention gave `enabler` its own template distinct
from `feature`, and no tracked repo (including isidore itself) ever
authored a `type: spike` file — `spike` was carried purely as unused enum
weight since the `1.2` bump. Also discovered while doing this: the `isi
init` scaffold bundle (`packages/isidore-worker/resources/`) never
received the `1.4` `experiment`/`prototype` templates — only the top-level
`docs/specifications/` got them, so any repo running `isi init` since `1.4`
shipped would have scaffolded a stale 3-template set.

## Acceptance criteria
- [x] AC-001 — `FeatureTypeSchema` (`packages/shared/src/payload.ts`) drops
  `spike`, adds nothing new (the `experiment`/`prototype` split already
  covers its use case); `SUPPORTED_PAYLOAD_SCHEMA_VERSIONS` gains `"1.5"`.
- [x] AC-002 — `packages/isidore-worker`'s `FeatureType` union drops
  `spike`; `FeatureFrontmatter.timebox_hours` and its `core.ts` fallback
  (`estimate_hours ?? timebox_hours`) are removed — no other type ever used
  it. `core.ts` emits `payload_schema_version: "1.5"`.
- [x] AC-003 — `docs/specifications/TEMPLATE-enabler.md` added (isidore's
  house style, not rapidfire's verbose numbered-section one — same
  reasoning as `1.4`'s Decisions note); `TEMPLATE-spike.md` removed.
  `GUIDELINES.md` updated: enum, template list, and the now-dead
  `timebox_hours` frontmatter-override section removed.
- [x] AC-004 — `packages/isidore-worker/resources/` (the `isi init`
  scaffold bundle) synced to the same 5-template set
  (`TEMPLATE-{feature,enabler,defect,experiment,prototype}.md` +
  `GUIDELINES.md`), byte-identical to the `docs/specifications/` canonical
  copies per `isi-cli-init.md`'s own byte-identical requirement.
  `scaffold.test.ts`'s hardcoded file-list expectations updated to match.
- [x] AC-005 — `docs/PRD.md`'s example folder listing and type enum
  updated to match (was still showing the pre-`1.2` `feature/defect/spike`
  set).

## Todos
- [x] Bump `packages/shared` schema (@ecarino@jairosoft.com, est 0.5h, due 2026-08-25, done 2026-08-25)
- [x] Drop `spike`/`timebox_hours` from the worker, bump emitted version (@ecarino@jairosoft.com, est 0.5h, due 2026-08-25, done 2026-08-25)
- [x] Add `TEMPLATE-enabler.md`, remove `TEMPLATE-spike.md`, update `GUIDELINES.md` (@ecarino@jairosoft.com, est 0.5h, due 2026-08-25, done 2026-08-25)
- [x] Sync `packages/isidore-worker/resources/` scaffold bundle + `scaffold.test.ts` (@ecarino@jairosoft.com, est 0.5h, due 2026-08-25, done 2026-08-25)

## Daily log
- 2026-08-25 (@ecarino, 2h): User asked whether isidore had adopted
  rapidfire's newest `docs/specifications/` templates; diffing the two
  repos' `TEMPLATE-*.md` sets surfaced the `TEMPLATE-enabler.md` gap.
  Decided (per user) to add it and fully retire `spike` rather than keep
  widening the enum forever, since nothing ever produced a `spike` file.
  While updating `GUIDELINES.md` and the templates, found the `isi init`
  scaffold bundle under `packages/isidore-worker/resources/` was already
  stale from the `1.4` bump (missing experiment/prototype) — fixed that in
  the same pass rather than leaving a second, newer drift behind. Left
  `isi-cli-init.md`'s own historical AC/daily-log text untouched since it's
  a `done` item describing what shipped at the time — rewriting closed
  history would violate `GUIDELINES.md` rule 3's append-only Daily log
  convention.

## Decisions & risks
- **Outright removal, not another widening.** Unlike `1.4`, no live
  producer (rapidfire or otherwise) has ever sent `type: spike`, so this
  isn't a backward-compat risk the way keeping `spike` was in `1.4`.
- **`isi-cli-init.md` intentionally not edited.** Its `done` status and
  daily log describe the 3-template scaffold as it shipped in
  2026-08-19 — accurate at the time. This item is the record of record for
  the later drift and its fix instead of retroactively editing that one.
