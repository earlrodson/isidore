---
schema_version: 1
id: worker-parse-push-github
title: isidore-worker — parse + POST, GitHub Actions only
type: feature
status: planned
priority: high
owners: [earlrodsin@gmail.com]
estimate_hours: 14
hours_logged: 0
created: 2026-08-18
updated: 2026-08-18
# target_date: YYYY-MM-DD
prd_ref: docs/PRD.md#6.2
relates_to: [payload-contract-v1, ingest-endpoint-hmac]
---

## Description
Build the `isidore-worker` core pipeline (TECHSTACK.md §3): checkout and
parse `docs/features/*.md` → enrich from git → build versioned snapshot →
HMAC sign and POST with retry. GitHub Actions only for v1 (TECHSTACK.md §5).
Build order step 4 (TECHSTACK.md §8).

## Acceptance criteria
- [ ] `src/core.ts` implements parse → enrich → build → sign → send as one
      function, per TECHSTACK.md §3.1's single-core-function design
- [ ] `src/ci-entry.ts` is a thin wrapper calling `core.ts` directly, no
      logic duplicated between CI and any future CLI entry point
- [ ] Parser follows `docs/features/GUIDELINES.md` exactly: `type` from
      frontmatter only, `hours_logged` computed from `## Daily log` (never
      read from frontmatter as authored), todos parsed via the fixed
      `- [ ] ... (@owner, est Nh, due YYYY-MM-DD)` line format
      (GUIDELINES.md rules 1–2)
- [ ] Excludes `GUIDELINES.md` and `TEMPLATE-*.md` from parsing (GUIDELINES.md,
      "Report tooling notes")
- [ ] Worker is stateless: never queries Isidore, makes no decisions, calls
      no LLM (TECHSTACK.md §3 design constraints)
- [ ] A broken/re-run worker self-heals via the idempotent snapshot — no
      manual cleanup needed
- [ ] GitHub Actions config is ~15 lines, fires on push/merge to `develop`
      (TECHSTACK.md §3.1)

## Todos
- [ ] Implement `docs/features/*.md` frontmatter + section parser (@earlrodsin@gmail.com, est 5h)
- [ ] Implement git enrichment (commits, PR state, assignees) (@earlrodsin@gmail.com, est 4h)
- [ ] Implement HMAC sign + POST with retry (@earlrodsin@gmail.com, est 3h)
- [ ] Write `src/ci-entry.ts` + example GitHub Actions workflow (@earlrodsin@gmail.com, est 2h)

## Daily log
- 2026-08-18 (@earlrodsin@gmail.com, 0h): item created

## Decisions & risks
- Depends on [[payload-contract-v1]] and [[ingest-endpoint-hmac]] existing
  (or at minimum a fixture-validated contract) to test against end-to-end.

## Links
- PR:
- Branch:
