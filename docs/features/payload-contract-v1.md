---
schema_version: 1
id: payload-contract-v1
title: Freeze v1 ingest payload contract
type: feature
status: planned
priority: high
owners: [earlrodsin@gmail.com]
estimate_hours: 6
hours_logged: 0
created: 2026-08-18
updated: 2026-08-18
# target_date: YYYY-MM-DD
prd_ref: docs/PRD.md#6.2
# relates_to: [other-slug]
---

## Description
Pin down the JSON snapshot payload the worker POSTs to the ingest endpoint
(TECHSTACK.md §6) before either the worker or the API is built. Both
codebases depend on this shape, so it must be frozen first per the build
order (TECHSTACK.md §8, step 1).

## Acceptance criteria
- [ ] Payload shape matches TECHSTACK.md §6 exactly: `payload_schema_version`,
      `provider`, `repo_id`, `project`, `week`, `base_branch`, `commit_sha`,
      `generated_at`, `timezone`, `features[]` (with `todos[]`, `open_prs[]`)
- [ ] JSON Schema (or Zod/TypeScript equivalent) published in the shared
      `packages/shared` package, importable by both worker and API
- [ ] Validation rejects unknown `payload_schema_version` outright, per
      TECHSTACK.md §6 rules
- [ ] Idempotency key documented in the schema's own comments: `provider +
      repo_id + feature_id`

## Todos
- [ ] Draft shared TypeScript types + JSON Schema from TECHSTACK.md §6 (@earlrodsin@gmail.com, est 4h)
- [ ] Add fixture payloads (valid + each rejection case) for both worker and API tests (@earlrodsin@gmail.com, est 2h)

## Daily log
- 2026-08-18 (@earlrodsin@gmail.com, 0h): item created

## Decisions & risks
- Risk: changing this after the worker/API are both built is expensive —
  this file should stay `in-progress` until the schema is genuinely frozen,
  not just drafted.

## Links
- PR:
- Branch:
