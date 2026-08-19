---
schema_version: 1
id: isi-cli-init
title: isi CLI — init command to scaffold docs/features/ in a new repo
type: feature
status: planned
priority: high
owners: [earlrodsin@gmail.com]
estimate_hours: 5
hours_logged: 0
created: 2026-08-18
updated: 2026-08-18
# target_date: YYYY-MM-DD
prd_ref: docs/PRD.md#6.1
relates_to: [worker-parse-push-github]
---

## Description
Add `isi init` alongside `isi push` (TECHSTACK.md §3.1) so onboarding a new
repo scaffolds `docs/features/{GUIDELINES.md,TEMPLATE-feature.md,
TEMPLATE-defect.md,TEMPLATE-spike.md}` from copies bundled in the
`isidore-worker` package, instead of requiring a human to hand-copy them.
Closes the gap in onboarding (PRD.md §6.1), which currently assumes the
folder convention already exists. Priority: immediately after
[[worker-parse-push-github]] core, ahead of the dashboard — onboarding
can't be self-serve without it.

## Acceptance criteria
- [ ] `isi init` creates `docs/features/` with `GUIDELINES.md` and all three
      `TEMPLATE-*.md` files, byte-identical to the canonical copies bundled
      in the `isidore-worker` package
- [ ] Refuses to overwrite an existing `docs/features/GUIDELINES.md` without
      an explicit `--force` (or equivalent) flag, to avoid clobbering a
      repo's in-progress items or local guideline edits
- [ ] `isi init` is documented in the same CLI help/table as `isi push` in
      TECHSTACK.md §3.1
- [ ] A version or checksum marker lets a future `isi init --update` detect
      that a repo's `GUIDELINES.md` has drifted from the bundled canonical
      copy (see Decisions & risks)

## Todos
- [ ] Bundle canonical `GUIDELINES.md` + templates as package resources in `isidore-worker` (@earlrodsin@gmail.com, est 1h)
- [ ] Implement `isi init` scaffold command + overwrite guard (@earlrodsin@gmail.com, est 3h)
- [ ] Add TECHSTACK.md §3.1 CLI table row for `isi init` (@earlrodsin@gmail.com, est 1h)

## Daily log
- 2026-08-18 (@earlrodsin@gmail.com, 0h): item created

## Decisions & risks
- GUIDELINES.md now has two homes once this ships: the bundled copy in
  `isidore-worker` and each repo's live copy. Without an `isi init --update`
  path (or version check), the canonical spec can fork across projects the
  same way we just fixed cross-doc drift in this repo's own docs. Scoping
  `--update` is deferred past v1 scaffold — track as a follow-up spike if it
  isn't obviously simple once `init` exists.

## Links
- PR:
- Branch:
