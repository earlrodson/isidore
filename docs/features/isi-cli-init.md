---
schema_version: 1
id: isi-cli-init
title: isi CLI — init command to scaffold docs/features/ in a new repo
type: feature
status: done
priority: high
owners: [earlrodsin@gmail.com]
estimate_hours: 5
hours_logged: 5
created: 2026-08-18
updated: 2026-08-19
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
- [x] `isi init` creates `docs/features/` with `GUIDELINES.md` and all three
      `TEMPLATE-*.md` files, byte-identical to the canonical copies bundled
      in the `isidore-worker` package
- [x] Refuses to overwrite an existing `docs/features/GUIDELINES.md` without
      an explicit `--force` (or equivalent) flag, to avoid clobbering a
      repo's in-progress items or local guideline edits
- [x] `isi init` is documented in the same CLI help/table as `isi push` in
      TECHSTACK.md §3.1
- [x] A version or checksum marker lets a future `isi init --update` detect
      that a repo's `GUIDELINES.md` has drifted from the bundled canonical
      copy (see Decisions & risks)

## Todos
- [x] Bundle canonical `GUIDELINES.md` + templates as package resources in `isidore-worker` (@earlrodsin@gmail.com, est 1h, due 2026-08-19, done 2026-08-19)
- [x] Implement `isi init` scaffold command + overwrite guard (@earlrodsin@gmail.com, est 3h, due 2026-08-19, done 2026-08-19)
- [x] Add TECHSTACK.md §3.1 CLI table row for `isi init` (@earlrodsin@gmail.com, est 1h, due 2026-08-19, done 2026-08-19)

## Daily log
- 2026-08-18 (@earlrodsin@gmail.com, 0h): item created
- 2026-08-19 (@earlrodsin@gmail.com, 5h): added `packages/isidore-worker/resources/`
  (byte-identical copies of `GUIDELINES.md` + all three `TEMPLATE-*.md`),
  `src/scaffold.ts` (`initFeaturesFolder()` — copies the bundled files into
  a repo's `docs/features/`, refuses to overwrite an existing
  `GUIDELINES.md` unless `force: true`, and writes a sha256
  `.isidore-templates.json` checksum manifest alongside them so a future
  `isi init --update` can detect drift without touching the byte-identical
  templates themselves), and `src/cli.ts` (thin `isi init [--force]` wrapper,
  exposed as the `isi` bin). Updated TECHSTACK.md §3.1's CLI table with the
  `isi init` row. 6 new tests passing (35 total in the package);
  `pnpm -r typecheck` clean. Found and fixed a real bug while smoke-testing
  the built CLI end-to-end: this repo's path contains a space, so
  `` `file://${process.argv[1]}` `` (used by both `cli.ts` and the earlier
  `ci-entry.ts`) never matched `import.meta.url` (which percent-encodes the
  space) — the entrypoint guard silently no-op'd. Fixed both to compare
  against `pathToFileURL(process.argv[1]).href` instead.

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
