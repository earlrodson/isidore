---
schema_version: 1
id: feature-environment-tracking
title: Track which environment (develop/staging/production) each feature has reached
type: feature
status: done
priority: high
owners: [earlrodsin@gmail.com, ecarino@jairosoft.com]
estimate_hours: 10
hours_logged: 16.8
created: 2026-08-20
updated: 2026-08-24
prd_ref: docs/PRD.md#5.2
relates_to: [payload-contract-v1, worker-parse-push-github, postgres-schema-snapshots, dashboard-cross-project, environment-promotion-history]
---

## Description
PRD §5.2 deliberately reads feature plans only from `develop` — staging and
main are "lagging snapshots," not planning sources, so the worker has never
had to know about them. That's still correct for *planning*, but it leaves
a real gap: nothing today tells you whether a feature marked `done` on
develop has actually been promoted anywhere. This adds a per-feature
environment signal — develop / staging / production — computed from commit
ancestry, not from re-reading `docs/specifications/` off other branches (which
would conflict with §5.2's "plans only live on develop" design).

**Reopened 2026-08-24 — AC-001/AC-002's ancestry approach is superseded.**
Real usage surfaced two problems neither AC anticipated: (1) CI only ever
triggers on `develop`, so a promotion straight to `staging`/`main` — e.g. a
hotfix cherry-picked into both — is invisible until some *unrelated* later
push to `develop` happens to re-trigger a check; and (2) even then, the
ancestry check compares commit SHAs, and `git cherry-pick` always produces a
new, unrelated SHA on the target branch, so the check reports "not shipped"
forever for a cherry-picked change even after it demonstrably has shipped.
AC-007 onward replace ancestry-inference with direct branch observation:
trigger on `staging`/`main` too, and treat "this ticket's file exists on
that branch, right now" as the signal — which survives cherry-picks,
rebases, and squash-merges natively, since it doesn't depend on commit
lineage at all. See Decisions & risks for why this doesn't reintroduce the
"stale plan data" problem §5.2 was written to avoid.

## Acceptance criteria
- [x] AC-001 — For each feature, the worker determines the furthest
  environment its most-recently-seen commit (`snapshots.commit_sha` for
  that feature) has reached, by checking commit ancestry against the
  repo's staging and production branch tips — not by re-parsing
  `docs/specifications/` on those branches.
- [x] AC-002 — Ancestry is computed via the GitHub compare API
  (`GET /repos/{owner}/{repo}/compare/{branch}...{sha}`), reusing the
  worker's existing `githubToken` (no new permissions/secrets) — same
  approach as the existing open-PR enrichment in `git.ts`.
- [x] AC-003 — Staging/production branch names are configurable per repo
  (default `staging` / `main`, falling back to `master` if `main` doesn't
  exist), since not every onboarded repo uses the same convention.
- [x] AC-004 — The ingest payload contract gains an optional
  `environment: "develop" | "staging" | "production" | null` field per
  feature (`null` when ancestry can't be determined, e.g. staging/main
  branch missing) — added as an additive, backward-compatible field so
  existing "1.0" payloads without it still validate.
- [x] AC-005 — The normalized `features` table and dashboard surface this
  per feature (e.g. a develop/staging/production badge), without changing
  how `docs/specifications/` itself is parsed or where plans are authored.
- [x] AC-006 — A repo whose staging/main branches don't exist (or aren't
  configured) degrades to `environment: null` per feature, never a hard
  ingest failure — this must not block existing onboarded repos.
- [x] AC-007 — `isidore-worker.yml` triggers on push to `develop`, the
  configured staging branch, and the configured production branch (not
  `develop` alone). The onboarding CI-snippet generator
  (`apps/web/src/lib/ci-snippet.ts`) emits all three, using whatever
  staging/production branch names the repo configured (AC-003's config
  carries over unchanged).
- [x] AC-008 — On a `staging`/`main` push, the worker does **not** run the
  normal `develop` snapshot flow (`runWorker`/`buildSnapshot`). It runs a
  new, narrower path that parses `docs/specifications/*.md` off that
  branch's checkout for `frontmatter.id` **only** — `status`, `todos`,
  `owners`, `estimate_hours`, and every other plan field from that
  branch's copy are read and immediately discarded, never forwarded,
  never written. This is what keeps §5.2's "plans only live on develop"
  rule intact under a multi-branch trigger.
- [x] AC-009 — The extracted ids are sent as a new, distinct payload shape
  (`environment_ping`, its own schema version, separate from
  `IngestPayloadSchema`) to a new `/api/ingest/environment` endpoint —
  reusing the existing per-repo HMAC/nonce verification
  (`apps/web/src/lib/ingest-auth.ts`), but never touching
  `/api/ingest`'s existing contract or the `snapshots` raw table.
- [x] AC-010 — The environment write is **monotonic per ticket**: given
  `develop(1) < staging(2) < production(3)`, an incoming ping only updates
  `features.environment` when the new rank is `>=` the currently stored
  rank. This is required because `docs/specifications/<slug>.md` stays on
  `staging` forever once merged there — an unrelated later push to
  `staging` must not silently downgrade a ticket that has already reached
  `production` back to `staging`.
- [x] AC-011 — A ping for a `feature_id` the ingest endpoint has never seen
  via a `develop` snapshot is a no-op (there's no `features` row to attach
  it to yet) — never an ingest failure, and never a row created from a
  staging/main ping alone (plan data must originate from `develop`, per
  §5.2).
- [x] AC-012 — The old ancestry-based `resolveEnvironment`/`isCommitInBranch`
  in `packages/isidore-worker/src/git.ts` and its GitHub-compare-API call
  are removed once AC-007–011 are live — this feature fully replaces that
  mechanism rather than running both in parallel.
- [x] AC-013 — Every already-onboarded repo's CI workflow (rapidfire today;
  others as they're onboarded) is updated to the new three-branch trigger
  as a rollout step — an onboarded repo still running the old
  `develop`-only workflow simply never sends environment pings, degrading
  to "environment never advances past whatever ancestry last inferred,"
  not an ingest failure. Rapidfire done: `isidore-web` is deployed to
  production with AC-007–012 live, and
  jairosoft-com/rapidfire#271 merged to `develop` — its
  `isidore-worker.yml` now triggers on `[develop, staging, main]`. Future
  onboarded repos get this automatically from `ci-snippet.ts`'s template;
  no other repo needed retrofitting as of 2026-08-24.

## Behavior Specifications

```gherkin
Scenario: A hotfix cherry-picked into both develop and staging is traced
  Given a ticket's spec file exists on develop, reachable there via a
    push that already ran the normal snapshot flow
  And the same change is separately cherry-picked into staging
  When staging is pushed, producing a distinct commit SHA from develop's
  Then the staging push triggers an environment ping (not a full snapshot)
  And the ticket's environment advances to "staging", independent of
    whether the two commits share any ancestry

Scenario: An unrelated push to staging does not downgrade a shipped ticket
  Given a ticket's environment is already "production"
  When an unrelated later push to staging re-triggers an environment ping
    that includes this ticket's id (its spec file is still present there)
  Then the ticket's environment remains "production", not "staging"

Scenario: A ping for an unknown ticket is a no-op
  Given a spec file's id has never been ingested via a develop snapshot
  When a staging/main push includes that file
  Then no features row is created from the ping alone, and no error is
    raised

Scenario: Plan fields are never sourced from staging or main
  Given a ticket's status/todos/estimate_hours differ between develop's
    copy and staging's (lagging) copy of the same spec file
  When a staging push fires an environment ping
  Then only the ticket's id is extracted from staging's copy; status,
    todos, owners, and estimate_hours in the database remain exactly
    what the last develop snapshot set them to
```

## Todos
- [x] Design schema addition: `environment` column on `features` (or a
  small `feature_environments` table if we want a history, not just
  latest) + payload schema bump to `1.1` (@earlrodsin@gmail.com, est 3h, due 2026-08-20, done 2026-08-20)
- [x] Add branch-ancestry check to `packages/isidore-worker/src/git.ts`
  (compare API call + status→environment mapping) (@earlrodsin@gmail.com, est 4h, due 2026-08-20, done 2026-08-20)
- [x] Wire staging/production branch name config (env vars with sensible
  defaults, degrade to `null` when a branch is missing)
  (@earlrodsin@gmail.com, est 2h, due 2026-08-20, done 2026-08-20)
- [x] Update `packages/db` derive/queries + dashboard to surface the field
  (@earlrodsin@gmail.com, est 3h, due 2026-08-20, done 2026-08-20)
- [x] Onboarding UI: let the user confirm/override staging+production
  branch names per repo (@earlrodsin@gmail.com, est 2h, due 2026-08-20, done 2026-08-20)
- [x] Add staging/production triggers + branch-aware CI dispatch
  (`isidore-worker.yml` template + `ci-snippet.ts`)
  (@ecarino@jairosoft.com, est 3h, due 2026-08-24, done 2026-08-24)
- [x] `environment_ping` payload schema + `/api/ingest/environment` endpoint,
  reusing existing HMAC/nonce verification (extracted into a shared
  `authenticateIngestRequest` helper so `/api/ingest` and this route don't
  duplicate it) (@ecarino@jairosoft.com, est 3h, due 2026-08-24, done 2026-08-24)
- [x] `writeEnvironmentPing`/`deriveEnvironmentPing` in `packages/db/src/environment.ts`
  — rank-based monotonic update per AC-010, plus a raw `environment_pings`
  table (mirrors `snapshots`) so `replayAll` can rebuild `features.environment`
  deterministically. Not wired to `environment_events` — that table
  belongs to the separate `environment-promotion-history` spec, still
  unimplemented (@ecarino@jairosoft.com, est 2h, due 2026-08-24, done 2026-08-24)
- [x] Remove ancestry-based `resolveEnvironment`/`isCommitInBranch` from
  `git.ts`; stop `deriveSnapshot` from touching `features.environment` at
  all so a later `develop` push can never clobber a ping-set value back to
  null (@ecarino@jairosoft.com, est 1h, due 2026-08-24, done 2026-08-24)
- [x] Roll out the updated CI workflow to already-onboarded repos
  (rapidfire first) (@ecarino@jairosoft.com, est 1h, due 2026-08-24, done 2026-08-24)

## Daily log
- 2026-08-20 (@ecarino, 0h): Created from a new requirement — "know which
  branch a feature is currently at (develop/staging/main/production)".
  Clarified two open design questions with the user before scoping:
  (1) signal is commit-ancestry against staging/main tips, not re-parsing
  docs/specifications/ off those branches (which would conflict with PRD §5.2);
  (2) granularity is per-feature, not per-repo, so the dashboard can show
  e.g. "auth-refresh is in staging, payments-v2 hasn't shipped to prod"
  on the same project.
- 2026-08-20 (@ecarino, 3h): Implemented Task 1 — schema + payload bump.
  `packages/shared/src/payload.ts`: added `EnvironmentSchema` (`develop` |
  `staging` | `production`), `environment: EnvironmentSchema.nullable()
  .optional()` on `FeatureSchema` (optional+nullable so existing "1.0"
  senders without the field still validate), and bumped
  `SUPPORTED_PAYLOAD_SCHEMA_VERSIONS` to `["1.0", "1.1"]` without touching
  `payload-contract-v1.md` itself, per that file's own frozen-contract
  note. Added `valid-with-environment.json` fixture + 2 new tests.
  `packages/db/src/schema.ts`: added a nullable `environment` text column
  to `features` (not a separate history table — no requirement yet for
  tracking environment *changes* over time, just current state; can add a
  history table later if that need shows up, per YAGNI). Generated +
  applied migration `0003_jazzy_yellow_claw.sql` (`ALTER TABLE features ADD
  COLUMN environment text`) against local dev Postgres — confirmed
  `DATABASE_URL` resolved to `localhost:5432`, not prod, before running.
  `derive.ts` now copies `feature.environment ?? null` into both the
  insert and the conflict-update branch. Added 2 new derive.ts tests
  (null-default backward compat, persists a real value). All gates green:
  `@isidore/shared` 9/9, `@isidore/db` 17/17, `@isidore/worker` 48/48,
  `@isidore/web` 40/40, typecheck clean across all four. Next: Task 2, the
  actual ancestry check in `git.ts` — this task only added the field, the
  worker doesn't populate it yet (always `null` until Task 2 lands).
- 2026-08-20 (@ecarino, 6h): Implemented Tasks 2-5, closing the feature.
  `packages/isidore-worker/src/git.ts`: added `resolveEnvironment` —
  `isCommitInBranch` compares `sha...branch` (branch ahead of/identical to
  sha means sha already reached it) via the existing compare-API plumbing,
  returning `null` on a 404 so "not shipped yet" and "can't tell" stay
  distinguishable (AC-006). `resolveEnvironment` checks production first
  (default `main`, falling back to `master` only if `main` 404s — AC-003),
  then staging (default `staging`); `null` only when neither branch
  resolves at all, otherwise unresolved-but-existing branches yield
  `"develop"`. `core.ts`'s `buildSnapshot` now resolves this once per push
  (all features in one payload share the same `commit_sha`, so one
  ancestry check covers all of them) and stamps it onto every feature;
  bumped the emitted `payload_schema_version` to `"1.1"`. `ci-entry.ts`
  reads `ISIDORE_STAGING_BRANCH`/`ISIDORE_PRODUCTION_BRANCH` (both
  optional, undefined lets `resolveEnvironment`'s own defaults apply).
  `packages/db/src/queries.ts`'s `getProjectDetail` now selects
  `environment` onto `ProjectDetailFeature` (the column already existed
  from Task 1; this was the first read path). The project detail page
  (`apps/web/.../[...repoId]/page.tsx`) shows it as `[environment]` next
  to each feature's status, `"unknown"` when null. `apps/web/src/lib/
  ci-snippet.ts`'s `buildGithubActionsWorkflow` gained optional
  `stagingBranch`/`productionBranch` params, only emitting
  `ISIDORE_STAGING_BRANCH`/`ISIDORE_PRODUCTION_BRANCH` lines when set, so
  the default snippet is unchanged for repos on the conventional names.
  `/onboarding` gained a per-repo GET form (branch-name inputs keyed by
  `configuredOwner`/`configuredRepo` query params) that regenerates that
  repo's CI snippet with the overrides baked in — no new DB table, since
  nothing needs these values at read time beyond generating the snippet
  once (YAGNI; can add persistence later if users re-visit onboarding
  expecting their last choice remembered). Added 6 new `git.ts` tests
  (production/staging/develop/null resolution, main→master fallback,
  explicit overrides), 1 `core.ts` test (environment attaches to
  features), extended both `ci-entry.test.ts` (branch env var
  passthrough) and `ci-snippet.test.ts` (2 new tests: omitted by default,
  baked in when overridden), and 1 new `queries.test.ts` test (null vs
  resolved environment via the existing `valid-with-environment.json`
  fixture). All gates green: `@isidore/shared` 9/9, `@isidore/db` 18/18,
  `@isidore/worker` 55/55, `@isidore/web` 42/42, typecheck clean across
  all four (ran `packages/db`'s tests against a scratch local
  `isidore_test` database, migrated fresh, to avoid touching dev/prod
  data per the onboarding-oauth DATABASE_URL-drift risk).
- 2026-08-24 (@ecarino@jairosoft.com, 1.5h): Reopened after a real
  cherry-pick-into-staging-and-develop scenario exposed both gaps at
  once: CI never fires on staging/main pushes at all (only `develop`),
  and even a later `develop` push's ancestry check can't recognize a
  cherry-picked commit as "the same change" on staging, since cherry-pick
  always mints a new SHA. Designed the replacement (AC-007–013):
  multi-branch trigger + presence-based ("does this ticket's id exist on
  that branch right now") signal instead of ancestry, with a strict rule
  that staging/main pushes may only ever extract `id` — never `status`/
  `todos`/`estimate_hours`/etc — to keep PRD §5.2 intact. No code written
  yet; spec only.
- 2026-08-24 (@ecarino@jairosoft.com, 5h): Implemented AC-007–012.
  `packages/shared/src/payload.ts`: added `EnvironmentPingPayloadSchema`
  + `parseEnvironmentPingPayload`, its own
  `SUPPORTED_ENVIRONMENT_PING_SCHEMA_VERSIONS` (`["1.0"]`), separate from
  `IngestPayloadSchema`'s versioning. `packages/db/src/schema.ts`: added
  `environment_pings` (raw tier, unique on
  `provider+repo_id+environment+commit_sha`, `feature_ids` as jsonb) via
  a generated migration (`0005_dizzy_steel_serpent.sql`), applied to
  local dev/test only — production still needs `pnpm db:migrate` +
  redeploy before this goes live. `packages/db/src/environment.ts`
  (new): `writeEnvironmentPing` (idempotent on content hash, mirrors
  `writeFeatureSnapshot`) + `deriveEnvironmentPing` (rank map
  `develop(1)/staging(2)/production(3)`, skips unknown feature ids
  per AC-011, updates only on `>=` rank per AC-010).
  `packages/db/src/derive.ts`: removed `environment` from
  `deriveSnapshot`'s insert/update entirely (AC-012) — a develop push
  can no longer touch it either way; `replayAll` now replays
  `environment_pings` in `receivedAt` order *after* every `snapshots`
  row, so features exist before pings try to update them.
  `packages/isidore-worker/src/git.ts`: deleted `resolveEnvironment`,
  `isCommitInBranch`, `EnvironmentBranches`, and the branch-fallback
  constants — no ancestry code left. `core.ts`: `buildSnapshot` no
  longer calls it and no longer sets `environment` on any feature.
  `send.ts`: genericized `signPayload`/`postSnapshot` over `unknown`
  payloads (signing never inspected the shape anyway) so the new ping
  path reuses them instead of forking a parallel signer.
  `environment-ping.ts` (new): `buildEnvironmentPing`/
  `runEnvironmentPing` — parses `docs/specifications/*.md` off whatever
  branch is checked out but keeps only `frontmatter.id`, posts to
  `${endpoint}/environment`. `ci-entry.ts`: branch-aware dispatch on
  `GITHUB_REF_NAME` (unset when run locally/manually, so `isi push`
  behavior is unchanged) against `ISIDORE_STAGING_BRANCH`/
  `ISIDORE_PRODUCTION_BRANCH` (defaulting to `staging`/`main`, no more
  404-probing `master` fallback — that was only needed for the ancestry
  check's existence probe, which no longer exists; an unconventional
  branch name now just needs the onboarding override, same as always).
  `apps/web/src/lib/ingest-auth.ts`: extracted `authenticateIngestRequest`
  (HMAC/timestamp/nonce) out of `/api/ingest`'s route so the new
  `/api/ingest/environment` route doesn't duplicate it — `/api/ingest`
  itself is otherwise untouched. `ci-snippet.ts`: trigger list is now
  `[develop, staging, main]` (or configured names), env var lines still
  only emitted on override. All gates green: `@isidore/shared` 11/11,
  `@isidore/db` 28/28 (new `environment.test.ts`: monotonic-update,
  unknown-id-skip, idempotent-resend, replay-rebuild), `@isidore/worker`
  58/58 (new `environment-ping.test.ts`; `ci-entry.test.ts` extended
  with dispatch tests for staging/production/override/unset-ref),
  `@isidore/web` 48/48 (new `/api/ingest/environment` route test;
  had to add `fileParallelism: false` to `apps/web/vitest.config.ts` —
  two route test files now share the live test DB, same reason
  `packages/db`'s config already had it), typecheck clean across all
  four. AC-013 (rollout to already-onboarded repos) is still open —
  code alone doesn't help rapidfire until its CI workflow and isidore's
  production deploy both pick this up.
- 2026-08-24 (@ecarino@jairosoft.com, 1h): Committed + pushed AC-007–012
  to `earlrodson/isidore` `main` (`4236dc5`), then `vercel --prod`
  redeployed `isidore-web` — build ran `pnpm db:migrate` against the real
  production DB, applying `0005_dizzy_steel_serpent.sql`
  (`environment_pings`); `/api/ingest/environment` confirmed live
  (401 on an unsigned smoke request, same as `/api/ingest`). For
  rapidfire: used an isolated `git worktree` off `origin/develop` (its
  main checkout was mid-flux from someone else's concurrent work all
  session — never touched that checkout directly) to widen
  `isidore-worker.yml`'s trigger to `[develop, staging, main]` and
  rename the push step; opened
  [jairosoft-com/rapidfire#271](https://github.com/jairosoft-com/rapidfire/pull/271)
  against `develop` rather than pushing directly, since this repo's
  history shows everything lands via PR. `gh pr create` initially failed
  with the active `earlrodson` GitHub CLI account (no access to the
  `jairosoft-com` org); switched to the `ecarinoJS` account
  (`gh auth switch`) and it went through. AC-013 stays open until #271
  merges.
- 2026-08-24 (@ecarino@jairosoft.com, 0.3h): #271's checks were still
  running (E2E in progress) when asked to merge, so used
  `gh pr merge --squash --auto` rather than forcing it — merges
  automatically once required checks pass, without bypassing branch
  protection. It merged within the same check (`79a11f2`). Confirmed
  `origin/develop`'s `isidore-worker.yml` now has the three-branch
  trigger. Closing this item — all 13 ACs done.

## Decisions & risks
- **Ancestry, not re-parsed plans, is the signal — by design.** PRD §5.2
  chose `develop` as the only planning source specifically because
  staging/main lag reality; re-reading `docs/specifications/` off those branches
  would just reintroduce the staleness problem §5.2 already rejected.
  Checking whether a feature's last-seen commit is an ancestor of
  staging/main's tip answers "has this shipped" without touching that
  decision.
- **Branch-name assumption risk.** Not every repo names its production
  branch `main` (some still use `master`, some use `production`). AC-003/
  AC-006 exist specifically so a repo with an unconventional or missing
  branch degrades gracefully instead of failing ingest for every feature.
- **Payload contract change.** `payload-contract-v1.md` is `done` and
  frozen; this needs a `1.1` addition to `SUPPORTED_PAYLOAD_SCHEMA_VERSIONS`
  with the new field optional, so already-deployed "1.0" workers don't
  break. Do not repurpose or edit `payload-contract-v1.md` itself — this
  is a new, additive version, tracked here.
- **Onboarding branch-name overrides aren't persisted anywhere.** They only
  exist to regenerate that one CI-snippet copy-paste; nothing server-side
  reads them afterward (the worker reads `ISIDORE_STAGING_BRANCH`/
  `ISIDORE_PRODUCTION_BRANCH` from the CI job's own env at push time, not
  from Isidore). If onboarding is revisited later and users expect their
  last-chosen names to still be filled in, that's a real gap — add a
  `repo_secrets`-adjacent column then, not preemptively (YAGNI).
- **Why triggering on staging/main doesn't reintroduce §5.2's staleness
  problem.** §5.2 rejected re-parsing `docs/specifications/` off
  staging/main because those branches' copies of `status`/`todos`/
  `estimate_hours` lag reality — showing them would mean the dashboard
  displays stale plan data. AC-008 sidesteps this by only ever extracting
  `frontmatter.id` from a staging/main checkout and discarding everything
  else; "this id exists on this branch" isn't a plan field, it's a
  shipped-or-not fact, so reading it off a lagging branch is exactly
  correct rather than stale.
- **Monotonicity is load-bearing, not an optimization (AC-010).** Without
  it, this design would actively regress compared to today's (broken)
  ancestry check: because a merged spec file stays on `staging` forever,
  every future unrelated `staging` push would re-report every
  already-shipped-to-production ticket as merely "staging." The rank
  comparison (`develop < staging < production`, update only on `>=`) is
  what makes "furthest environment reached" actually mean furthest.
- **Rollout is per-repo, not automatic.** Each onboarded repo owns its own
  copy of `isidore-worker.yml` (generated once at onboarding, then
  hand-maintained) — updating the template doesn't retroactively update
  repos that already copied the old one. AC-013 tracks pushing the new
  workflow to rapidfire first, then any other onboarded repo, as an
  explicit rollout step rather than assuming it propagates.
- **This changes what feeds `environment_events`
  (`docs/specifications/environment-promotion-history.md`).** That spec assumed
  `environment_events` gets one row per ticket per week, written
  alongside every `develop` snapshot from the ancestry-inferred value.
  Once this lands, the accurate write path is a real per-branch
  observation event instead — better data for that history table, but
  its derive-time write (in `deriveSnapshot`) needs to move to
  `recordEnvironmentSignal` instead. Sequence this feature before
  implementing that one, or update its Todos to reflect the new source.

## Links
- PR:
- Branch:
