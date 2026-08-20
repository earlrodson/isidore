---
schema_version: 1
id: feature-environment-tracking
title: Track which environment (develop/staging/production) each feature has reached
type: feature
status: done
priority: high
owners: [earlrodsin@gmail.com]
estimate_hours: 0
hours_logged: 9
created: 2026-08-20
updated: 2026-08-20
prd_ref: docs/PRD.md#5.2
relates_to: [payload-contract-v1, worker-parse-push-github, postgres-schema-snapshots, dashboard-cross-project]
---

## Description
PRD §5.2 deliberately reads feature plans only from `develop` — staging and
main are "lagging snapshots," not planning sources, so the worker has never
had to know about them. That's still correct for *planning*, but it leaves
a real gap: nothing today tells you whether a feature marked `done` on
develop has actually been promoted anywhere. This adds a per-feature
environment signal — develop / staging / production — computed from commit
ancestry, not from re-reading `docs/features/` off other branches (which
would conflict with §5.2's "plans only live on develop" design).

## Acceptance criteria
- [x] AC-001 — For each feature, the worker determines the furthest
  environment its most-recently-seen commit (`snapshots.commit_sha` for
  that feature) has reached, by checking commit ancestry against the
  repo's staging and production branch tips — not by re-parsing
  `docs/features/` on those branches.
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
  how `docs/features/` itself is parsed or where plans are authored.
- [x] AC-006 — A repo whose staging/main branches don't exist (or aren't
  configured) degrades to `environment: null` per feature, never a hard
  ingest failure — this must not block existing onboarded repos.

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

## Daily log
- 2026-08-20 (@ecarino, 0h): Created from a new requirement — "know which
  branch a feature is currently at (develop/staging/main/production)".
  Clarified two open design questions with the user before scoping:
  (1) signal is commit-ancestry against staging/main tips, not re-parsing
  docs/features/ off those branches (which would conflict with PRD §5.2);
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

## Decisions & risks
- **Ancestry, not re-parsed plans, is the signal — by design.** PRD §5.2
  chose `develop` as the only planning source specifically because
  staging/main lag reality; re-reading `docs/features/` off those branches
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

## Links
- PR:
- Branch:
