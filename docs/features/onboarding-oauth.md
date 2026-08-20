---
schema_version: 1
id: onboarding-oauth
title: Onboarding OAuth flow + CI snippet generator
type: feature
status: in-progress
priority: high
owners: [earlrodsin@gmail.com]
estimate_hours: 0
hours_logged: 26
created: 2026-08-19
updated: 2026-08-20
prd_ref: docs/PRD.md#6.1
---

## Description
TECHSTACK.md §8 build order step 7 — the last piece before this stops being
a hand-run pipeline. Everything rapidfire needed to get ingesting today
(generating and seeding a repo secret, hand-writing a GitHub Actions
workflow, wiring two repo secrets) was done manually via psql and the gh
CLI. This feature turns that into a self-serve flow: log in via git
provider OAuth, pick a repo + folder, get a secret and a copy-pasteable CI
snippet. No manual DB access, no hand-written workflow YAML, ever again.

## Acceptance criteria
- [ ] AC-001 — Log in via GitHub OAuth (PRD §6.1). Session persists across
  requests; no dependency on the ingest path (TECHSTACK.md §7 — onboarding
  and ingest share no code).
- [ ] AC-002 — Browse and select from the authenticated user's accessible
  repositories (PRD §6.1).
- [ ] AC-003 — Select the target folder, defaulting to `docs/features/`
  (PRD §6.1). If the folder doesn't exist yet in the selected repo, offer to
  scaffold it (reuses `isidore-worker`'s existing `initFeaturesFolder` /
  `isi init` logic rather than duplicating it).
- [ ] AC-004 — Generate a per-repo HMAC signing secret and upsert it into
  `repo_secrets`, displayed exactly once in the UI — never retrievable
  again, matching the existing `packages/db/scripts/seed-repo-secret.mjs`
  behavior (this feature replaces that script's manual invocation).
- [ ] AC-005 — Emit a copy-pasteable CI config snippet for the detected
  provider (GitHub Actions for v1), pre-filled with the repo's own
  `ISIDORE_INGEST_ENDPOINT` and a placeholder for the secret the user just
  saw.
- [ ] AC-006 — The generated snippet must not require the onboarded repo to
  check out and build `isidore` from source (see Decisions & risks — this
  is blocked on `isidore-worker` being a real installable/runnable
  artifact, not the current workspace-only package).
- [ ] AC-007 — Re-onboarding an already-connected repo rotates the secret
  (old CI runs start failing immediately) rather than silently creating a
  second row — `repo_secrets` is already unique on `(provider, repo_id)`.
- [ ] AC-008 — Onboarding never writes to `projects`/`features` directly;
  the first successful ingest still owns creating/upserting the project row
  (`derive.ts`'s existing `onConflictDoUpdate`), so onboarding's DB
  footprint is limited to `repo_secrets` (+ new session/OAuth tables).

## Todos
- [x] Decide GitHub OAuth App vs GitHub App (installation-based) — see
  Decisions & risks (@earlrodsin@gmail.com, est 2h, due 2026-08-20, done 2026-08-20)
- [x] Design `users`/`sessions`/`oauth_accounts` schema + migration
  (@earlrodsin@gmail.com, est 4h, due 2026-08-20, done 2026-08-20)
- [x] Implement OAuth login/callback routes + session cookie handling
  (@earlrodsin@gmail.com, est 6h, due 2026-08-20, done 2026-08-20)
- [x] Implement repo list + folder picker against the provider API
  (@earlrodsin@gmail.com, est 5h, due 2026-08-20, done 2026-08-20)
- [x] Implement "scaffold docs/features/" offer, reusing
  `initFeaturesFolder` via the provider's contents/commit API
  (@earlrodsin@gmail.com, est 4h, due 2026-08-20, done 2026-08-20)
- [x] Implement secret generation/display-once UI, wired to
  `upsertRepoSecret` (@earlrodsin@gmail.com, est 3h, due 2026-08-20, done 2026-08-20)
- [x] Implement CI snippet template (GitHub Actions), keyed off provider
  (@earlrodsin@gmail.com, est 4h, due 2026-08-20, done 2026-08-20)
- [x] Resolve the `isidore-worker` distribution blocker (publish to a
  registry, or another install path) so AC-006 is actually satisfiable
  (@earlrodsin@gmail.com, est 8h, due 2026-08-20, done 2026-08-20)
- [ ] Onboarding smoke test: connect a real throwaway repo end-to-end,
  confirm dashboard shows it within the PRD's <5min target
  (@earlrodsin@gmail.com, est 2h)

## Daily log
- 2026-08-20 (@earlrodson, 0h): Onboarded `jairosoft-com/autoallies-mobile`
  by hand-copying rapidfire's `isidore-worker.yml`. First real CI run failed
  with `ERR_PNPM_BAD_PM_VERSION` — see Decisions & risks. Fixed both
  autoallies-mobile's and rapidfire's workflow files and bumped
  `node-version` 20 → 22 while in there (Node 20 Actions runners are being
  deprecated). After that fix, the re-triggered run still failed, now with
  a 401 `{ error: "unknown repo" }` from the ingest endpoint — traced to
  `seed-repo-secret.mjs` (and my own ad hoc `psql` check) reading
  `apps/web/.env`'s `DATABASE_URL` (local dev Postgres), while the
  deployed ingest route on Vercel reads `apps/web/.env.local`'s
  `DATABASE_URL` (the real Neon prod DB) — two different databases, and
  the repo secret only existed in the local one. Inserted the matching
  `repo_secrets` row into the prod DB directly; re-run succeeded.
- 2026-08-20 (@ecarino, 6h): Decided GitHub App (installation-based) over
  a classic OAuth App. Added `users`/`oauth_accounts`/`sessions`/
  `github_installations` to `packages/db/src/schema.ts`, generated +
  applied migration `0002_melted_forge.sql` against local dev Postgres
  (confirmed `DATABASE_URL` resolved to `localhost:5432`, not prod, per
  the drift risk noted above), and added `packages/db/src/auth.ts`
  (`upsertUserFromOAuth`, session CRUD, installation upsert/list) exported
  from `index.ts`. Implemented AC-001: `apps/web/src/lib/github-app.ts`
  (authorize URL, code exchange, `/user` fetch, installation repo listing)
  and `apps/web/src/lib/session.ts` (token generation/hashing, httpOnly
  cookie helpers), wired into `GET /api/auth/github/login`, `GET
  /api/auth/github/callback` (state-cookie CSRF check), and `POST
  /api/auth/logout`, plus `apps/web/src/lib/current-user.ts` for reading
  the session in other routes. Added `GITHUB_APP_CLIENT_ID/SECRET/SLUG` to
  `.env.example`. `pnpm --filter @isidore/db typecheck/test` and `pnpm
  --filter @isidore/web typecheck/test` all green (29/29 web tests, new
  coverage for session token hashing and authorize-URL building). AC-002
  (repo/folder picker UI) and AC-004/005 (secret UI, CI snippet) still
  open — `listInstallationRepos` exists in `github-app.ts` but has no
  route/page wired to it yet.
- 2026-08-20 (@ecarino, 7h): Implemented AC-002/003 — multi-account
  installation flow and the repo/folder picker. Added `GET
  /api/auth/github/install` (requires an active session, redirects to
  `github.com/apps/<slug>/installations/new` with a CSRF state cookie —
  callable repeatedly to connect additional accounts/orgs, per today's
  earlier discussion) and `GET /api/auth/github/install/callback`, which
  validates state, then cross-checks the returned `installation_id`
  against `GET /user/installations` before persisting via
  `upsertGithubInstallation` — never trusts the query string alone.
  `packages/db/src/auth.ts` gained `getOAuthAccessToken`. Added
  `listUserInstallations`, `featuresFolderExists`,
  `scaffoldFeaturesFolderAsPullRequest` (creates a branch, commits each
  file via the contents API, opens a PR — deliberately a PR, not a direct
  commit, per the risk noted below) to `apps/web/src/lib/github-app.ts`.
  Reused the worker's canonical templates for the scaffold by adding
  `readCanonicalTemplateFiles` to `packages/isidore-worker/src/scaffold.ts`
  (same bundled `resources/`, no separate copy to drift), exported it, and
  added `@isidore/worker` as an apps/web workspace dependency. Built
  `/onboarding` (Server Component: lists installations grouped by account,
  repos per installation, a folder-scaffold form per repo) and `POST
  /api/onboarding/scaffold`. All typecheck/test gates green:
  `@isidore/worker` 48/48, `@isidore/web` 34/34, `@isidore/db` 15/15.
  AC-004/005/006/007 (secret UI, CI snippet, worker distribution) still
  open.
- 2026-08-20 (@ecarino, 3h): Implemented AC-004/007 — secret
  generation/rotation UI. Added `generateRepoSecret` (`apps/web/src/lib/
  repo-secret.ts`, same `randomBytes(32).toString("hex")` entropy as
  `seed-repo-secret.mjs`) and `POST /api/onboarding/secret`, session-gated,
  which upserts via `upsertRepoSecret` through the running app's own
  `getDb()` connection — directly addressing the DATABASE_URL-drift risk
  noted below, since the secret is now always written to whichever DB the
  deployed app itself resolves, never a script pointed at a guessed env
  file. The secret is rendered once in the POST response body itself (not
  a redirect/query param, which would leak it into browser history and
  server logs) with a plain-text warning that re-submitting rotates it
  (matches AC-007: `repo_secrets` unique on `(provider, repo_id)`, so
  `onConflictDoUpdate` overwrites rather than duplicating). Wired a
  "Generate/rotate ingest secret" button per repo on `/onboarding`, next to
  the existing scaffold form. Added `apps/web/src/lib/__tests__/
  repo-secret.test.ts`. All gates green: `@isidore/web` 36/36,
  typecheck clean. AC-005/006 (CI snippet, worker distribution) still open.
- 2026-08-20 (@ecarino, 2h): Implemented AC-005 — CI snippet generator.
  Added `buildGithubActionsWorkflow` (`apps/web/src/lib/ci-snippet.ts`),
  rendered per repo on `/onboarding` in a collapsed `<details>` block, with
  `ISIDORE_INGEST_ENDPOINT` derived from the request's own `host`/
  `x-forwarded-proto` headers (so it's always the deployed app's real
  origin, never hand-typed) and `ISIDORE_HMAC_SECRET` left as a
  `${{ secrets.ISIDORE_HMAC_SECRET }}` placeholder per AC-005. AC-006 is
  still open — the snippet's checkout-and-build-from-source step is the
  same documented workaround, explicitly labeled as temporary (`TODO
  (AC-006)` comment in the generated YAML), carrying both fixes from the
  autoallies-mobile incident above (`package_json_file` pinned to
  isidore's own package.json, Node 22). The source repo to check out is
  `ISIDORE_SOURCE_REPO` (env, defaults to `earlrodson/isidore`) rather than
  hardcoded, since it's this deployment's own fork/origin, not a fact about
  isidore itself. Added `apps/web/src/lib/__tests__/ci-snippet.test.ts` (4
  tests). All gates green: `@isidore/web` 40/40, `@isidore/db` 15/15,
  `@isidore/worker` 48/48, typecheck clean across all three. Remaining
  before this feature can close: resolve the isidore-worker distribution
  blocker (AC-006's real fix) and run the onboarding smoke test.
- 2026-08-20 (@ecarino, 5h): Resolved the isidore-worker distribution
  blocker (AC-006) — settled on prebuilt-tarball-via-GitHub-Release over
  both a registry publish and a git-ref/orphan-branch install (discussed
  and compared trade-offs; tarball wins on no fabricated git history,
  immutable per-version releases vs. a moving branch, and native
  `npm install <tarball-url>` support across npm/pnpm/bun with no
  clone/build step). Added `packages/isidore-worker/scripts/
  prepare-release.mjs`: esbuild-bundles `cli.ts`/`ci-entry.ts` with
  `@isidore/shared` inlined (`external: ["zod","yaml"]` only — the two real
  npm deps), assembles a standalone `package.json` with no `workspace:*`
  reference, then `npm pack`s it. Verified end-to-end in a scratch dir
  (outside the pnpm workspace) via `npm install git+file://...` and via
  `npx --yes --package=<tarball> isidore-worker-ci` — both installed
  cleanly and the worker made it to a real (intentionally-failing, fake
  token) GitHub API call, proving the bundle is genuinely self-contained.
  That verification surfaced a real pre-existing bug in both `cli.ts` and
  `ci-entry.ts`: their `import.meta.url === pathToFileURL(process.argv[1])`
  entry-point guards silently no-op (exit 0, nothing runs) when invoked via
  an npm/pnpm bin symlink (`node_modules/.bin/isi`,
  `node_modules/.bin/isidore-worker-ci`) rather than a direct file path —
  the guard never matched in the monorepo before because it was always
  invoked as `node packages/isidore-worker/dist/ci-entry.js` directly.
  Fixed both with `realpathSync(process.argv[1])`. Updated
  `apps/web/src/lib/ci-snippet.ts`'s generated workflow to drop the
  checkout-and-build-from-source step entirely, replacing it with
  `gh release download --repo ${ISIDORE_SOURCE_REPO} --pattern
  'isidore-worker-*.tgz'` (needs a new `ISIDORE_SOURCE_TOKEN` secret — a
  PAT with `contents:read` on the isidore repo, since GitHub Release
  assets on a private repo aren't downloadable via the job's own
  same-repo-scoped `GITHUB_TOKEN`) followed by `npx --yes
  --package="$TARBALL" isidore-worker-ci`. This is fully code-complete;
  the one remaining manual step is a one-time `gh release create` against
  the real isidore repo to actually publish a tarball — deliberately not
  run in this session (visible, shared-state action on the real remote;
  needs explicit go-ahead first). All gates green: `@isidore/worker`
  48/48, `@isidore/web` 40/40 (updated `ci-snippet.test.ts` for the new
  workflow shape; also fixed a latent test bug where its `afterEach`
  reset `ISIDORE_SOURCE_REPO` to the literal string `"undefined"` instead
  of deleting it when unset). AC-006 is code-complete; only the smoke test
  and the actual first release remain before this feature can close.
- 2026-08-20 (@ecarino, 1h): Published the first isidore-worker release —
  https://github.com/earlrodson/isidore/releases/tag/isidore-worker-v0.1.0
  (tag `isidore-worker-v0.1.0`, asset `isidore-worker-0.1.0.tgz`, built via
  `pnpm --filter @isidore/worker release:prepare`). Discovered
  `earlrodson/isidore` is a **public** repo, which makes the
  `ISIDORE_SOURCE_TOKEN` PAT the previous entry called for unnecessary —
  `gh release download` (and the GitHub API generally) allows reading
  public-repo releases with any valid token, including the job's own
  same-repo-scoped `github.token`. Simplified
  `apps/web/src/lib/ci-snippet.ts` accordingly: the download step now uses
  `GH_TOKEN: \${{ github.token }}` (auto-provided, zero new secrets),
  with a comment noting a PAT would be needed if the repo ever goes
  private. Verified the real published release end-to-end exactly as the
  generated snippet does it — `gh release download` with no auth
  configured beyond the default token, then `npx --yes --package=<tarball>
  isidore-worker-ci`, which ran real logic and only failed on the expected
  local preconditions (fake token, no `docs/features` dir), confirming the
  live release is genuinely consumable. All gates re-verified green after
  the snippet simplification: `@isidore/web` 40/40, typecheck clean.
  AC-006 is now fully satisfied; only the onboarding smoke test remains.

## Decisions & risks
- **The two-repo-checkout workaround (AC-006) has a second failure mode
  beyond distribution: consumer/isidore toolchain version collisions.**
  `pnpm/action-setup`'s "Setup pnpm" step has no `working-directory`, so it
  reads `packageManager` from `$GITHUB_WORKSPACE/package.json` — the
  *consumer* repo's root package.json, not `isidore-worker`'s, even though
  the step exists only to build `isidore-worker`. autoallies-mobile pins
  `"packageManager": "pnpm@10.12.3"`; the generated workflow hardcodes
  `version: 9` for building isidore-worker, and the two collided
  (`ERR_PNPM_BAD_PM_VERSION`), failing the whole job. rapidfire's copy of
  the same workflow never hit this only because rapidfire's package.json
  happens to have no `packageManager` field — the bug was latent there,
  not absent. Fixed for both by adding
  `package_json_file: .isidore-worker-src/package.json` to the pnpm-setup
  step, so it validates against isidore's own (fieldless) package.json
  instead of the consumer's. This is a second, independent argument for
  publishing `@isidore/worker` to a registry (same fix as AC-006's primary
  blocker): a real published package install has no reason to touch or
  care about the consumer's own `packageManager`/engines pins at all,
  whereas building-from-source-in-consumer-CI inherently mixes the two
  toolchains and will keep producing this class of bug for every future
  onboarder with a pinned pnpm/node version. Any hand-written or
  OAuth-generated CI snippet under AC-005 must carry this fix (or, better,
  not need it) before it's safe to hand to a new onboarder.
- **Two `DATABASE_URL`s exist for this app, and nothing stops a secret
  from being seeded into the wrong one.** `apps/web/.env` points at local
  dev Postgres; `apps/web/.env.local` points at the real Neon prod DB the
  deployed ingest route actually reads. `seed-repo-secret.mjs` hardcodes
  reading `apps/web/.env`, so running it (or any ad hoc `psql`/script
  check) against "the" DATABASE_URL silently operates on dev data — the
  repo secret gets created, `getRepoSecret` finds it locally, everything
  looks seeded, and the first real CI run still 401s with "unknown repo"
  because prod never got the row. No error surfaces until an actual
  ingest request hits the deployed endpoint. AC-004's "generate a secret,
  upsert it into `repo_secrets`" must upsert through the *running app's*
  own DB connection (e.g. an authenticated onboarding API route), not a
  standalone script pointed at a locally-guessed env file — that's the
  only way "seeded" and "what production reads" can't drift apart. If
  `seed-repo-secret.mjs` stays around as a manual fallback, it should at
  minimum print which `DATABASE_URL` it resolved and require an explicit
  `--prod` flag to touch anything other than local.
- **Decided: GitHub App (installation-based), not a classic OAuth App.**
  A GitHub App gives per-repo installation scoping instead of broad
  user-token access to every repo the user can see, and avoids a later
  migration once a second provider (build order step 9) forces a
  provider abstraction. Mechanically: GitHub Apps support "Request user
  authorization (OAuth) during installation," so login (AC-001) still
  uses a standard authorize/callback code exchange against the App's own
  OAuth client id/secret — the only difference from a classic OAuth App
  is that repo access (AC-002) comes from `GET
  /user/installations/{id}/repositories` after the user installs the App
  and picks repos on GitHub's own installation UI, rather than us
  building a repo browser against `/user/repos`. This means AC-002 is
  "list what this installation was granted, let the user pick one to
  onboard," not "browse all of the user's GitHub repos." Needs a new
  `github_installations` table (user_id, installation_id, account_login)
  alongside `users`/`sessions`/`oauth_accounts`.
- **No `users`/`sessions` tables exist today** — this is genuinely
  greenfield; nothing in `packages/db/src/schema.ts` handles identity yet.
  Whatever schema is chosen here is the first auth surface in the app and
  should stay minimal (PRD open question #2 — org-wide read is acceptable
  for v1, no per-project ACL) rather than over-building roles/permissions
  ahead of need.
- **AC-006 is the real blocker, discovered the hard way.** Getting
  rapidfire ingesting today required manually checking out `isidore`
  inside rapidfire's CI job and building `isidore-worker` from source,
  because the package is `"private": true` and depends on
  `@isidore/shared` via `workspace:*` — neither resolves for an external
  consumer via a package manager (confirmed: `bunx` 404s against the
  unpublished package, and a git-subdirectory dependency isn't supported
  by bun). A generated CI snippet can replicate that same two-repo-checkout
  workaround, but that's a bad first-run experience for every future
  onboarder. The clean fix is publishing `@isidore/worker` (registry
  publish + Changesets to rewrite `workspace:*` at publish time, since
  isidore has no Changesets setup yet) — tracked as its own todo above
  rather than silently baking the workaround into the generated snippet.
- **Secret display-once has no recovery path by design** — matches
  `seed-repo-secret.mjs`'s existing behavior. If a user loses it, onboarding
  must support "rotate," not "reveal" (AC-007).
- **Scaffolding `docs/features/` on someone else's repo means writing to
  it** — via the provider's API (a commit), not a local file write like
  `isi init` does today. This needs OAuth scope wide enough to create a
  branch/commit/PR, which has security implications beyond read-only repo
  browsing and should probably land as a PR the user still merges
  themselves, not a direct commit.

## Links
- PR:
- Branch:
