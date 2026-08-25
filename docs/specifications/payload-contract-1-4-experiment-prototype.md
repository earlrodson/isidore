---
schema_version: 1
id: payload-contract-1-4-experiment-prototype
title: Widen FeatureTypeSchema for rapidfire's experiment/prototype split (1.4)
type: feature
status: done
priority: medium
owners: [ecarino@jairosoft.com]
estimate_hours: 2
hours_logged: 2
created: 2026-08-25
updated: 2026-08-25
relates_to: [payload-contract-1-2-type-severity]
---

## Description
rapidfire's `docs/specifications/GUIDELINES.md` on `develop` dropped `spike`
and split it into `experiment` and `prototype` (also giving `enabler` its
own template, distinct from `feature`). Isidore's `FeatureTypeSchema`
(`packages/shared/src/payload.ts`) still only accepted
`feature | enabler | defect | spike` — the next rapidfire push carrying an
`experiment` or `prototype` file (e.g.
`crypto-payment-gateway-experiment.md`) would have failed
`parseIngestPayload` validation and dropped the whole snapshot, not just
that one feature.

## Acceptance criteria
- [x] AC-001 — `FeatureTypeSchema` (`packages/shared/src/payload.ts`) gains
  `experiment` and `prototype`; `spike` stays supported (widening, not a
  replacement — other tracked repos still author `spike`).
- [x] AC-002 — `SUPPORTED_PAYLOAD_SCHEMA_VERSIONS` gains `"1.4"`.
- [x] AC-003 — `packages/isidore-worker`'s `FeatureType` union
  (`parser.ts`) widens to match; `core.ts`'s `buildSnapshot` emits
  `payload_schema_version: "1.4"`.
- [x] AC-004 — `docs/specifications/GUIDELINES.md` documents the widened
  `type` enum and points at this file's contract version; `TEMPLATE-
  experiment.md`/`TEMPLATE-prototype.md` added alongside the existing
  `TEMPLATE-spike.md`.
- [x] AC-005 — No `packages/db` migration needed: `features.type` is
  already a plain nullable `text` column (no Postgres-level enum
  constraint), so it accepts the new string values as-is.

## Todos
- [x] Bump `packages/shared` schema + fixture + tests (@ecarino@jairosoft.com, est 1h, due 2026-08-25, done 2026-08-25)
- [x] Widen worker's `FeatureType`, bump `core.ts` emitted version, add a
  worker test (@ecarino@jairosoft.com, est 0.5h, due 2026-08-25, done 2026-08-25)
- [x] Update `GUIDELINES.md` + add the two new templates (@ecarino@jairosoft.com, est 0.5h, due 2026-08-25, done 2026-08-25)

## Daily log
- 2026-08-25 (@ecarino, 2h): Pulled rapidfire's `develop` (already at
  `origin/develop`, no new commits) and diffed its
  `docs/specifications/GUIDELINES.md` + templates against isidore's own.
  Found the `spike` → `experiment`/`prototype` split via
  `crypto-payment-gateway-experiment.md` (`type: experiment`) and confirmed
  it would fail isidore's `FeatureTypeSchema` enum as of `1.3`. Chose the
  additive widening (keep `spike`, add the two new values, bump to `1.4`)
  over an in-place enum edit or dropping `spike` outright, per the
  precedent set by `1.2`'s type/severity bump. Verified `features.type` is
  unconstrained `text` in Postgres, so no `packages/db` migration was
  needed — only the shared schema, worker, and docs.

## Decisions & risks
- **Additive-only, per the `1.2` precedent.** `spike` keeps working for any
  repo still authoring it; `payload-contract-v1.md` and the `1.2` doc stay
  untouched.
- **Did not adopt rapidfire's per-type document structure (numbered
  `## 1. Traceability...` sections, `POLICY-*` blocks).** Isidore's parser
  only requires `## Description`/`## Acceptance criteria`/`## Todos`/
  `## Daily log` headings to exist somewhere in the file — rapidfire's
  richer authoring structure parses fine as-is (extra headings are just
  ignored), so no parser change was needed there. Isidore's own
  `TEMPLATE-experiment.md`/`TEMPLATE-prototype.md` stay in its existing
  simpler house style rather than copying rapidfire's verbose one; both are
  valid producers of the same wire schema.
- **Did not split `TEMPLATE-feature.md` into a separate `TEMPLATE-
  enabler.md`** the way rapidfire did — isidore's own convention still
  treats `enabler` as a `feature`-shaped item with a different `type`
  value. Nothing forces isidore to mirror every structural choice a
  tracked repo makes; only the wire-schema values (`type`'s enum) needed
  parity, since those are what the ingest payload actually carries.
