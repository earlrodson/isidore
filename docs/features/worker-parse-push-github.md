---
schema_version: 1
id: worker-parse-push-github
title: isidore-worker — parse + POST, GitHub Actions only
type: feature
status: done
priority: high
owners: [earlrodsin@gmail.com]
estimate_hours: 14
hours_logged: 12
created: 2026-08-18
updated: 2026-08-19
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
- [x] `src/core.ts` implements parse → enrich → build → sign → send as one
      function, per TECHSTACK.md §3.1's single-core-function design
- [x] `src/ci-entry.ts` is a thin wrapper calling `core.ts` directly, no
      logic duplicated between CI and any future CLI entry point
- [x] Parser follows `docs/features/GUIDELINES.md` exactly: `type` from
      frontmatter only, `hours_logged` computed from `## Daily log` (never
      read from frontmatter as authored), todos parsed via the fixed
      `- [ ] ... (@owner, est Nh, due YYYY-MM-DD)` line format
      (GUIDELINES.md rules 1–2)
- [x] Excludes `GUIDELINES.md` and `TEMPLATE-*.md` from parsing (GUIDELINES.md,
      "Report tooling notes")
- [x] Worker is stateless: never queries Isidore, makes no decisions, calls
      no LLM (TECHSTACK.md §3 design constraints)
- [x] A broken/re-run worker self-heals via the idempotent snapshot — no
      manual cleanup needed
- [x] GitHub Actions config is ~15 lines, fires on push/merge to `develop`
      (TECHSTACK.md §3.1)

## Todos
- [x] Implement `docs/features/*.md` frontmatter + section parser (@earlrodsin@gmail.com, est 5h, due 2026-08-19, done 2026-08-19)
- [x] Implement git enrichment (commits, PR state, assignees) (@earlrodsin@gmail.com, est 4h, due 2026-08-19, done 2026-08-19)
- [x] Implement HMAC sign + POST with retry (@earlrodsin@gmail.com, est 3h, due 2026-08-19, done 2026-08-19)
- [x] Write `src/ci-entry.ts` + example GitHub Actions workflow (@earlrodsin@gmail.com, est 2h, due 2026-08-19, done 2026-08-19)

## Daily log
- 2026-08-18 (@earlrodsin@gmail.com, 0h): item created
- 2026-08-19 (@earlrodsin@gmail.com, 4h): built `packages/isidore-worker`
  with `src/parser.ts` — frontmatter parsed via `yaml`, `## Todos` and
  `## Daily log` sections parsed via the fixed line formats from
  GUIDELINES.md rules 1-2, `hoursLogged` computed from Daily log lines only
  (frontmatter's authored value is never trusted). Handles word-wrapped
  continuation lines within a single todo/log entry. `isFeatureFile()`
  excludes `GUIDELINES.md`/`TEMPLATE-*.md` per the Report tooling notes.
  10 tests passing (fixtures copied from real docs/features files plus
  synthetic malformed-line and due/done-date cases).
- 2026-08-19 (@earlrodsin@gmail.com, 3h): added `src/git.ts` —
  `getHeadCommitSha()` for the payload's top-level `commit_sha` (local
  `git rev-parse HEAD`, no API call, per TECHSTACK.md §1's "full checkout"
  rationale), plus `enrichOpenPrsByFeature()` against the GitHub REST API
  (open PRs → their changed files → matched to whichever feature's
  `docs/features/<id>.md` the PR touches). This is the "open PR visibility"
  heuristic PRD.md §5.3 requires so in-progress work on unmerged branches
  isn't invisible. `fetchImpl` is injected so tests mock the network
  instead of hitting GitHub. Owners/assignees are not re-derived here —
  they already come from each feature file's own frontmatter. 6 new tests
  passing (16 total in the package).
- 2026-08-19 (@earlrodsin@gmail.com, 2h): added `src/send.ts` —
  `signPayload()` computes `sha256(secret, timestamp.nonce.rawBody)` hex
  digest, matching apps/web's `verifySignature` exactly (cross-checked in
  the test against a copy of that function); `postSnapshot()` sends it with
  the `X-Isidore-Timestamp`/`-Nonce`/`-Signature` headers, retries on
  network error or 5xx with exponential backoff, and throws immediately on
  4xx (a bad-signature/unknown-schema response would just fail identically
  again — TECHSTACK.md §7). Each retry attempt is resigned with a fresh
  nonce rather than resending the first attempt's, so a retry never
  collides with the endpoint's nonce-uniqueness constraint from a prior
  attempt's own request. 9 new tests passing (25 total in the package).
- 2026-08-19 (@earlrodsin@gmail.com, 2h): added `src/core.ts` (`buildSnapshot`
  + `runWorker`, the single parse→enrich→build→sign→send function per
  TECHSTACK.md §3.1) and `src/ci-entry.ts` (thin env-var wrapper calling
  `runWorker`, exposed as the `isidore-worker-ci` bin). Added
  `examples/push-snapshot.yml`, a 15-line GitHub Actions config firing on
  push to `develop`. Feature frontmatter without `prd_ref` (GUIDELINES.md
  allows omitting it) falls back to the placeholder `"unspecified"` since
  the frozen payload contract's `prd_ref` is non-optional — documented
  below as a decision. 4 new tests passing (29 total in the package).
  `pnpm -r typecheck` clean across all 4 workspace packages.
- 2026-08-19 (@earlrodsin@gmail.com, 1h): added `src/__tests__/ci-entry.test.ts`
  covering `ci-entry.ts`'s `main()` directly (previously untested — the
  fetch-signing pipeline it calls was covered via `core.ts`/`send.ts` tests,
  but env-var wiring and error surfacing were not): required env vars map
  onto `runWorker` params correctly (owner/repo split from
  `GITHUB_REPOSITORY`), `ISIDORE_*` overrides take precedence over derived
  defaults, and a missing required env var throws
  `requireEnv`'s descriptive error before `runWorker` is ever called.
  `runWorker` is mocked via `vi.mock("../core.js")` since its own behavior
  is already exercised in `core.test.ts`. 3 new tests passing (38 total in
  the package); `pnpm -r typecheck` clean.

## Decisions & risks
- Depends on [[payload-contract-v1]] and [[ingest-endpoint-hmac]] existing
  (or at minimum a fixture-validated contract) to test against end-to-end.
- Open-PR matching is heuristic: a PR counts as touching a feature only if
  its diff includes `docs/features/<id>.md` itself. This covers planning-doc
  PRs (PRD.md §5.2) and any PR whose author also updates the Daily log, but
  won't catch an implementation PR that never touches the feature file. Not
  currently required by the payload contract's `open_prs` field beyond
  "state of PRs relevant to the feature," but flagging as a rough edge if
  richer PR-to-feature linking is wanted later (e.g. via branch-name
  convention or PR body reference).
- Both PR list and per-PR file list fetch a single page (`per_page=100`).
  Fine at current repo scale; would need pagination if a repo ever has more
  than 100 open PRs or a single PR touches more than 100 files.
- The payload contract's `FeatureSchema.prd_ref` is `min(1)` (non-optional),
  but GUIDELINES.md explicitly allows omitting `prd_ref` when an item wasn't
  sourced from a PRD/BRD. `core.ts` bridges this by substituting the literal
  string `"unspecified"` when frontmatter has no `prd_ref`. This preserves
  "omitted `prd_ref`" as a distinguishable, non-crashing value on the wire,
  but a future report/dashboard change should not treat `"unspecified"` as a
  real PRD reference.

## Links
- PR:
- Branch:
