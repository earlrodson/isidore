---
schema_version: 1
id: isi-context-command
title: isi CLI — context command to dump open docs/features/ items for any agent
type: feature
status: done
priority: medium
owners: [ecarino@jairosoft.com]
estimate_hours: 3
hours_logged: 3
created: 2026-08-20
updated: 2026-08-20
relates_to: [isi-cli-init]
---

## Description
Onboarded repos accumulate `docs/features/*.md` items, but asking an
assistant to "implement our remaining tasks" had no reliable way to find
them — it isn't bound to any convention pointing at `docs/features/`, and
guessed at TODO comments, issues, or the wrong folder instead. `isi context`
closes that gap with a plain stdout command, not a Claude-specific
integration: it prints every open item (status `planned`/`in-progress`/
`blocked` with at least one unchecked todo) as a self-contained markdown
block, so it composes with any CLI coding agent via a pipe.

## Acceptance criteria
- [x] `isi context` prints every open `docs/features/*.md` item's title,
      type/status/priority, description, acceptance criteria, and only its
      unchecked todos
- [x] Closed items (`done`/`cancelled`, or no remaining todos) are excluded
      from the default output
- [x] `isi context --id <slug>` scopes to a single item regardless of the
      default open-item filter, and exits non-zero with a clear message if
      the id doesn't exist
- [x] Reuses the existing `parser.ts`/`loadFeatureFiles` — no second parser
      for the same file format
- [x] Documented in TECHSTACK.md §3.1's CLI table alongside `isi init`

## Todos
- [x] Extend `ParsedFeatureFile` with `description`/`acceptanceCriteria` raw sections (@ecarino@jairosoft.com, est 0.5h, due 2026-08-20, done 2026-08-20)
- [x] Implement `context.ts` (`buildContext`) + `isi context [--id]` CLI wrapper (@ecarino@jairosoft.com, est 1.5h, due 2026-08-20, done 2026-08-20)
- [x] Add parser + context tests, update TECHSTACK.md (@ecarino@jairosoft.com, est 1h, due 2026-08-20, done 2026-08-20)

## Daily log
- 2026-08-20 (@ecarino@jairosoft.com, 3h): Implemented `context.ts` and the
  `isi context` CLI command; extended `parseFeatureFile` to capture
  Description/Acceptance criteria sections; added `context.test.ts` and two
  new `parser.test.ts` cases; updated TECHSTACK.md §3.1. `pnpm --filter
  @isidore/worker typecheck/test/build` all clean (46 tests passing);
  smoke-tested the built CLI against isidore's own `docs/features/`.

## Decisions & risks
- Deliberately not Claude-specific: output is plain markdown to stdout, no
  assumption about which agent consumes it. The intended usage is a pipe,
  e.g. `isi context | claude -p "implement the remaining todos above"`.
- `--id` bypasses the open-status/remaining-todos filter by design (you may
  want the full context for a `done` item too), but still only renders
  *unchecked* todos in the Todos section — a fully-done item just shows
  "No remaining todos — all complete." rather than an empty section.

## Links
- PR:
- Branch:
