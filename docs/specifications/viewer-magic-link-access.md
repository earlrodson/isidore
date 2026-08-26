---
schema_version: 1
id: viewer-magic-link-access
title: Viewer login via Google-account magic link, gated to per-email repo bindings
type: feature
status: done
priority: high
owners: [ecarino@jairosoft.com]
estimate_hours: 14
hours_logged: 6
created: 2026-08-26
updated: 2026-08-26
prd_ref: docs/PRD.md#6.4
relates_to: [onboarding-oauth, dashboard-cross-project]
---

## Description
Today `/` and `/projects/[provider]/[...repoId]` are fully public — no auth
check exists on either route (PRD open question #2 accepted "org-wide read,
no per-project ACL" for v1). This feature closes that: a viewer logs in with
just their email via a passwordless magic link (sent through SMTP, no
password, no Google OAuth app registration required despite "Google
magic-link" phrasing — the login surface is an email box, not a Google
button), and only sees the projects an admin has explicitly bound their
email to. This is a second, disjoint identity system from
`onboarding-oauth.md`'s GitHub App login — that one authenticates repo
*owners* connecting a repo to Isidore; this one authenticates dashboard
*viewers* reading data about repos someone else already connected.

## Traceability & Strategic Intent
- **Outcome Alignment:** PRD §6.4 dashboard is currently readable by anyone
  with the URL — this closes that gap now that real client data (not just
  rapidfire's own) is flowing through onboarding.
- **Strategy Intent:** Multiple orgs/clients will be onboarded to the same
  Isidore instance; each client's stakeholders should only see their own
  project(s), not every onboarded repo across every client.
- **Execution Intent:** Passwordless email login (no password storage, no
  per-viewer GitHub/Google app grant) kept deliberately minimal, mirroring
  how `onboarding-oauth.md` scoped its own identity tables to "just enough."
- **Benefit Hypothesis:**
  - *By implementing:* email-based login + an admin-managed
    email→project binding table.
  - *We will improve:* the dashboard can be shown to external stakeholders
    without leaking every other client's project data.
  - *As measured by:* a viewer with no binding sees zero projects; a viewer
    with one binding sees exactly that project on `/` and can open its
    detail page; any other project detail URL 404s/redirects for them.

## Product Context
- **Customer Context:** external stakeholders (clients, PMs) who should see
  only their own project's features/todos/reports — not internal admins'
  full portfolio.
- **Operating Context:** same Next.js app, same Postgres. Adds SMTP as a new
  external dependency (env-configured, no new infra service).
- **Ecosystem Context:** fully disjoint from `onboarding-oauth.md`'s
  `users`/`sessions`/`github_installations` tables and from the ingest
  path's `repo_secrets` — a new `magic_links` / `viewer_sessions` /
  `repo_access` table set, mirroring the token-hash-not-raw-token pattern
  `sessions` already established.
- **Regulatory Context:** stores viewer email addresses and grants; no other
  PII. Magic link tokens are single-use and short-lived (15 min).

## Behavior Specifications

```gherkin
Scenario: A viewer requests a magic link
  Given an admin has granted "pm@client.com" access to project "acme/repo"
  When "pm@client.com" submits their email on /login
  Then a magic link is emailed to them, valid for 15 minutes, single-use
  And the response is identical regardless of whether that email has any
    grants or has ever been seen before (no account enumeration)

Scenario: Clicking a valid magic link logs the viewer in
  Given a magic link was issued to "pm@client.com" less than 15 minutes ago
    and has not been used yet
  When they open the link
  Then a viewer session cookie is set and they are redirected to "/"
  And the magic link cannot be used again

Scenario: An expired or already-used link is rejected
  Given a magic link is expired, or was already consumed once
  When it is opened again
  Then login fails with a generic error and no session is created

Scenario: The dashboard rollup only shows bound projects
  Given "pm@client.com" is logged in and bound only to project "acme/repo"
  And three other projects are onboarded
  When they load "/"
  Then only "acme/repo" appears in every table (projects, completions/week,
    drift, allocation)

Scenario: Direct navigation to an unbound project 404s
  Given "pm@client.com" is logged in but has no binding to "other/repo"
  When they navigate to /projects/github/other/repo
  Then they see a not-found response, not the project's data

Scenario: A logged-out visitor is redirected to login
  Given no viewer session cookie is present
  When "/" or any "/projects/..." route is requested
  Then the response redirects to "/login"

Scenario: An admin grants and revokes access
  Given the logged-in viewer's email is in ISIDORE_ADMIN_EMAILS
  When they open "/admin/access" and add "pm@client.com" → "acme/repo"
  Then a repo_access row is created and that project appears for that
    viewer on their next "/" load
  When the admin removes that binding
  Then the project stops appearing for that viewer immediately (no
    session/cache tied to stale grants)

Scenario: A non-admin cannot reach the admin page
  Given the logged-in viewer's email is not in ISIDORE_ADMIN_EMAILS
  When they request "/admin/access"
  Then they get a not-found/forbidden response, not the admin UI
```

## Acceptance criteria
- [x] AC-001 — `magic_links` table: `id`, `email`, `tokenHash` (unique),
      `expiresAt` (15 min from creation), `consumedAt` (nullable),
      `createdAt`. Raw token only ever lives in the emailed URL, never
      persisted (mirrors `sessions.tokenHash`).
- [x] AC-002 — `viewer_sessions` table: `id`, `email`, `tokenHash`
      (unique), `expiresAt` (30 days), `createdAt`. Deliberately separate
      from onboarding's `sessions` table/cookie (different identity, must
      not collide or be confusable with the GitHub-App-login session).
- [x] AC-003 — `repo_access` table: `id`, `email`, `projectId` (FK →
      `projects`, cascade delete), `createdAt`, unique on
      `(email, projectId)`.
- [x] AC-004 — `POST /api/auth/magic-link/request { email }` always
      responds identically (200, generic message) whether or not the email
      has any grants or prior history — issues + emails a link via SMTP
      only when the email is well-formed; never reveals existence.
- [x] AC-005 — `GET /api/auth/magic-link/verify?token=...` validates the
      token against `tokenHash`, checks not expired / not already
      consumed, marks it consumed, creates a `viewer_sessions` row, sets
      an httpOnly session cookie distinct from the onboarding one, and
      redirects to `/`. Invalid/expired/reused tokens redirect to
      `/login?error=invalid`.
- [x] AC-006 — `/login` page: an email input + submit, posts to AC-004's
      route, shows a generic "check your email" confirmation.
- [x] AC-007 — `/` and `/projects/[provider]/[...repoId]` require a valid
      viewer session (redirect to `/login` if absent/expired).
- [x] AC-008 — `/` filters every table (project rollup, completions/week,
      drift, allocation) down to only projects the logged-in email has a
      `repo_access` grant for. Zero grants → all tables render empty
      (existing empty-state copy), not an error.
- [x] AC-009 — `/projects/[provider]/[...repoId]` returns Next.js
      `notFound()` when the logged-in viewer has no grant for that
      specific project, even if the project exists and has data (must not
      leak existence via a 403 vs 404 distinction).
- [x] AC-010 — `/admin/access` is reachable only when the logged-in
      viewer's email is in the `ISIDORE_ADMIN_EMAILS` env var
      (comma-separated); otherwise `notFound()`. Lists all onboarded
      projects, lets an admin add/remove an email's access per project.
- [x] AC-011 — Revoking a grant takes effect on the next page load (no
      caching of grants in the session/cookie itself — every gated page
      re-reads `repo_access` from the DB).
- [x] AC-012 — `POST /api/auth/logout-viewer` clears the viewer session
      cookie (mirrors the existing onboarding `POST /api/auth/logout`,
      kept as a separate route since it's a separate cookie/identity).
- [x] AC-013 — SMTP config (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
      `SMTP_PASS`, `SMTP_FROM`) added to `.env.example`; magic-link base
      URL derived from the request's own host/proto headers (same pattern
      `ci-snippet.ts` already uses for `ISIDORE_INGEST_ENDPOINT`), never
      hardcoded.

## Todos
- [x] `magic_links`/`viewer_sessions`/`repo_access` schema + migration (@ecarino@jairosoft.com, est 1.5h, done 2026-08-26)
- [x] `packages/db/src/viewer-auth.ts`: create/consume magic link, create/read viewer session, grant/revoke/list repo access (@ecarino@jairosoft.com, est 2.5h, done 2026-08-26)
- [x] `apps/web/src/lib/mailer.ts` (nodemailer/SMTP) + `apps/web/src/lib/viewer-session.ts` (cookie helpers, separate cookie name from onboarding) (@ecarino@jairosoft.com, est 1.5h, done 2026-08-26)
- [x] `/login` page + `POST /api/auth/magic-link/request` + `GET /api/auth/magic-link/verify` + `POST /api/auth/logout-viewer` (@ecarino@jairosoft.com, est 2.5h, done 2026-08-26)
- [x] Gate `/` and `/projects/[provider]/[...repoId]` on viewer session + filter to granted projects (@ecarino@jairosoft.com, est 2h, done 2026-08-26)
- [x] `/admin/access` page + grant/revoke route, gated on `ISIDORE_ADMIN_EMAILS` (@ecarino@jairosoft.com, est 2h, done 2026-08-26)
- [x] Tests: token expiry/single-use, no-enumeration response, access filtering on `/`, 404 on unbound project detail, admin gate (@ecarino@jairosoft.com, est 2h, done 2026-08-26)

## Daily log
- 2026-08-26 (@ecarino@jairosoft.com, 0h): spec authored — no code yet.
  Design decisions locked with the user: SMTP (not Resend/Marketplace) for
  delivery, admin UI (not a raw DB script) for managing bindings, and `/`
  requires login + filters to bound projects (not left public).
- 2026-08-26 (@ecarino@jairosoft.com, 5h): Implemented AC-001 through
  AC-013. Schema: `magic_links`/`viewer_sessions`/`repo_access`
  (migration `0007_magenta_bruce_banner.sql`, generated locally —
  `drizzle-kit generate` diffs against the migrations journal and doesn't
  touch a live DB, but note apps/web/.env.local's `DATABASE_URL` is the
  real Neon prod DB per onboarding-oauth.md's documented drift risk; the
  actual migration still needs running against it before this is live).
  `packages/db/src/viewer-auth.ts` (create/consume magic link — atomic
  UPDATE...WHERE consumedAt IS NULL so a token can't be replayed under a
  race; grant/revoke/list repo access). `apps/web/src/lib/mailer.ts`
  (nodemailer SMTP transport, lazily created), `viewer-session.ts` (cookie
  helpers, cookie name `isidore_viewer_session` distinct from onboarding's
  `isidore_session`), `current-viewer.ts` (`getCurrentViewer`,
  `isAdminEmail`). Routes: `/login` (client component, generic
  "check your email" state + `?error=invalid` handling),
  `POST /api/auth/magic-link/request` (always 200, only emails when the
  address is well-formed), `GET /api/auth/magic-link/verify`,
  `POST /api/auth/logout-viewer`. Gated `/` (redirects to `/login`, then
  filters every table to `listAccessibleProjectsForEmail` — allocation
  needed a per-project re-query + JS merge-by-owner since it's aggregated
  server-side and can't be filtered client-side without leaking other
  projects' hours into a shared owner's total) and
  `/projects/[provider]/[...repoId]` (redirects if logged out, `notFound()`
  if ungranted — never a 403). `/admin/access` page + grant/revoke API
  route, gated on `ISIDORE_ADMIN_EMAILS`, following the onboarding page's
  existing plain-`<form action=... method="POST">` convention rather than
  client-side fetch. Added `nodemailer`/`@types/nodemailer` to
  `apps/web/package.json`. All typecheck green across the monorepo
  (`pnpm -r typecheck`). Web unit tests green (75 tests incl. new
  `viewer-session.test.ts`/`current-viewer.test.ts`) — the 2 pre-existing
  ingest-route DB-integration suites fail in this environment for the same
  reason as `packages/db`'s suites (no local Postgres reachable), not a
  regression. `docs/specifications/GUIDELINES.md`'s `hours_logged` field
  above is derived from this log's hour entries, not hand-set.
- 2026-08-26 (@ecarino@jairosoft.com, 1h): Closed the remaining test todo.
  Started local Postgres (`postgresql@16`, already running outside `brew
  services`), created `isidore_test`, ran `drizzle-kit migrate` against it
  (applies cleanly, including `0007_magenta_bruce_banner.sql`), then ran
  `pnpm --filter @isidore/db test` against it — all 8 `viewer-auth.test.ts`
  cases pass (token single-use/expiry/unknown-token, grant/list/revoke,
  duplicate-grant no-op, admin listing), plus the previously-unverifiable
  `queries`/`derive`/`environment` DB suites (42/42 total). Added
  `apps/web/src/app/api/auth/magic-link/request/__tests__/route.test.ts`
  (mocks `sendMagicLinkEmail` since no SMTP is configured in test; asserts
  a magic_links row is created and the email sent only for a well-formed
  address, and that the response is identical whether the email is known,
  unknown, or malformed — no enumeration). Added
  `apps/web/src/app/admin/access/__tests__/page.test.tsx` (mocks
  `getCurrentViewer`; asserts redirect-to-`/login` when logged out,
  `notFound()` for a non-admin, and that the rendered tree includes an
  admin's real grants) — required adding `esbuild.jsx: "automatic"` to
  `apps/web/vitest.config.ts` since the page is a `.tsx` Server Component
  and the default esbuild JSX transform assumed a classic runtime
  (`React is not defined` at runtime otherwise); no other test in the repo
  previously exercised a `.tsx` file so this gap was latent. One
  pre-existing, unrelated failure surfaced once Postgres was reachable:
  `api/ingest/environment`'s "advances a known feature's environment" test
  fails in isolation too (feature-environment-tracking's replay logic, not
  this feature) — out of scope here, left as-is.

## Decisions & risks
- **"Google magic-link" means email-based passwordless login, not a Google
  OAuth consent screen.** No Google Cloud app registration needed for v1 —
  confirmed with the user as SMTP-delivered magic links. If true
  Sign-in-with-Google is wanted later, that's an additive `oauth_accounts`-style
  provider, not a rework of this table set.
- **Fully disjoint from `onboarding-oauth.md`'s identity tables.** Reusing
  `users`/`sessions` would conflate "repo owner who connected a repo" with
  "stakeholder who views one" and force a shared cookie/session shape
  neither audience actually needs. Costs one more table set; buys not
  having to retrofit scoping onto an identity model designed for a
  different purpose.
- **No account-enumeration leak.** `/api/auth/magic-link/request` must
  respond identically whether the email has grants, has logged in before,
  or is unknown — otherwise the endpoint becomes a way to probe which
  client stakeholders are onboarded.
- **404, not 403, on an unbound project.** Matches the "don't leak
  existence" posture above — a 403 confirms the project exists; a 404
  doesn't.
- **Admin list is an env var, not a DB table, for v1.** Keeps the bootstrap
  problem (who can grant the first grant) trivial — whoever deploys the app
  sets `ISIDORE_ADMIN_EMAILS`. A DB-backed roles table is a reasonable
  follow-up once there's more than a couple of admins.
- **`/present` (the presenter/broadcast view) is explicitly out of scope
  here** — left ungated for now since it's a separate big-screen/demo
  surface, not the stakeholder-facing dashboard this feature targets.
  Revisit if it starts getting used for client-facing demos with sensitive
  cross-client data.

## Links
- PR:
- Branch:
