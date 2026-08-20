---
schema_version: 1
id: onboarding-oauth
title: Onboarding OAuth flow + CI snippet generator
type: feature
status: planned
priority: high
owners: [earlrodsin@gmail.com]
estimate_hours: 0
hours_logged: 0
created: 2026-08-19
updated: 2026-08-19
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
- [ ] Decide GitHub OAuth App vs GitHub App (installation-based) — see
  Decisions & risks (@earlrodsin@gmail.com, est 2h)
- [ ] Design `users`/`sessions`/`oauth_accounts` schema + migration
  (@earlrodsin@gmail.com, est 4h)
- [ ] Implement OAuth login/callback routes + session cookie handling
  (@earlrodsin@gmail.com, est 6h)
- [ ] Implement repo list + folder picker against the provider API
  (@earlrodsin@gmail.com, est 5h)
- [ ] Implement "scaffold docs/features/" offer, reusing
  `initFeaturesFolder` via the provider's contents/commit API
  (@earlrodsin@gmail.com, est 4h)
- [ ] Implement secret generation/display-once UI, wired to
  `upsertRepoSecret` (@earlrodsin@gmail.com, est 3h)
- [ ] Implement CI snippet template (GitHub Actions), keyed off provider
  (@earlrodsin@gmail.com, est 4h)
- [ ] Resolve the `isidore-worker` distribution blocker (publish to a
  registry, or another install path) so AC-006 is actually satisfiable
  (@earlrodsin@gmail.com, est 8h)
- [ ] Onboarding smoke test: connect a real throwaway repo end-to-end,
  confirm dashboard shows it within the PRD's <5min target
  (@earlrodsin@gmail.com, est 2h)

## Daily log
- 2026-08-20 (@earlrodson, 0h): Onboarded `jairosoft-com/autoallies-mobile`
  by hand-copying rapidfire's `isidore-worker.yml`. First real CI run failed
  with `ERR_PNPM_BAD_PM_VERSION` — see Decisions & risks. Fixed both
  autoallies-mobile's and rapidfire's workflow files and bumped
  `node-version` 20 → 22 while in there (Node 20 Actions runners are being
  deprecated).

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
- **OAuth App vs GitHub App — undecided, blocks AC-001/002.** A classic
  OAuth App is simpler and matches PRD §6.1's "log in via git provider
  OAuth" literally, but a GitHub App's installation flow gives per-repo
  scoping instead of broad user-token access, and is the better fit once
  a second provider (build order step 9) forces an abstraction. Leaning
  GitHub App for v1 despite more setup, to avoid a migration later — needs
  a decision before AC-001/002 can be built.
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
