---
schema_version: 1
id: multi-account-login
title: Multi-account login & account switcher
type: feature
status: new
priority: medium
owners: [ecarino@jairosoft.com]
estimate_hours: 0
hours_logged: 0
created: 2026-08-29
updated: 2026-08-29
relates_to: [onboarding-oauth]
---

## Description
Today `isidore_session` is a single httpOnly cookie holding one session
token, which resolves to exactly one `users` row via `getCurrentUser()`
(`apps/web/src/lib/current-user.ts`, `apps/web/src/lib/session.ts`). Logging
in again with a different GitHub account replaces that cookie/session
outright — there is no way to hold two account identities (e.g.
`x@gmail.com` and `y@gmail.com`) logged in at once and switch between them
without a full logout/login cycle each time. This is distinct from the
GitHub App **installation** picker already built in `onboarding-oauth`
(`/api/auth/github/install`), which lets one logged-in user connect
additional GitHub orgs/accounts for *repo access* — that feature does not
change *who is logged in*, only which repos the current single identity can
see. This feature adds actual multi-identity session support: add a second
(third, ...) account without logging out the first, and switch the active
one from the UI, similar to Google's browser account switcher.

## Traceability & Strategic Intent
- **Outcome Alignment:** Reduce friction for users who manage multiple
  GitHub identities (e.g. personal + work) against Isidore.
- **Strategy Intent:** Power users / maintainers who split projects across
  more than one GitHub account and don't want to repeatedly log out/in.
- **Execution Intent:** Extend the existing bearer-token session model
  (`sessions` table, SHA-256-hashed opaque token, httpOnly cookie) to
  support more than one concurrently-valid identity per browser.
- **Benefit Hypothesis:**
  - *By implementing:* an "add account" + switcher flow on top of the
    existing GitHub OAuth login.
  - *We will improve:* time-to-switch-context for multi-account users and
    remove the current logout-then-login-again workaround.
  - *As measured by:* zero required logouts to move between two already-
    logged-in accounts; qualitative confirmation from the primary user.

## Product Context
- **Customer Context:** The app's own owner-facing sign-in (GitHub OAuth via
  `/api/auth/github/login`, not the separate viewer magic-link system at
  `/login` — see Decisions & risks) currently has no dedicated UI page and
  no user menu anywhere in `apps/web/src/components`. This feature likely
  needs to introduce both.
- **Operating Context:** `packages/db/src/schema.ts` `users` / `sessions` /
  `oauth_accounts` tables (see `onboarding-oauth` spec for exact columns).
  No schema currently models "multiple active sessions for one browser" —
  `sessions` has no device/label/active-flag metadata.
- **Ecosystem Context:** GitHub OAuth (App-based, per `onboarding-oauth`'s
  decision) is the only identity provider today.
- **Regulatory Context:** None identified yet — flag if switching accounts
  has any implication for viewer-granted data visibility.

## Behavior Specifications

```gherkin
Scenario: Add a second account without losing the first
  Given I am logged in as x@gmail.com
  When I choose "Add another account" and complete GitHub OAuth as y@gmail.com
  Then both x@gmail.com and y@gmail.com are available as logged-in identities
  And my active identity remains x@gmail.com until I explicitly switch

Scenario: Switch active account
  Given I am logged in as both x@gmail.com and y@gmail.com
  And x@gmail.com is currently active
  When I select y@gmail.com from the account switcher
  Then the dashboard, onboarding, and repo lists reflect y@gmail.com's access
  And x@gmail.com's session remains valid (no re-login needed to switch back)

Scenario: Remove one of several logged-in accounts
  Given I am logged in as both x@gmail.com and y@gmail.com
  When I log out of y@gmail.com specifically
  Then only y@gmail.com's session is invalidated
  And x@gmail.com remains logged in and becomes (or stays) active
```

## Acceptance criteria
- [ ] AC-001 — A logged-in user can start GitHub OAuth again to add a second
  account without invalidating their current session.
- [ ] AC-002 — Two or more accounts can be simultaneously valid for one
  browser; each has its own `sessions` row and is independently expirable.
- [ ] AC-003 — Exactly one account is "active" at a time; all existing
  `getCurrentUser()` call sites resolve the active identity with no other
  code changes required at each call site.
- [ ] AC-004 — A visible account-switcher UI lists all logged-in accounts
  (avatar/login) and switching is a single click with no OAuth round-trip.
- [ ] AC-005 — Logging out targets one account at a time; logging out the
  active account falls back to another still-logged-in account if one
  exists, otherwise clears fully (matches today's single-session logout).
- [ ] AC-006 — Switching accounts does not require re-selecting GitHub App
  installations already connected under each identity (installations stay
  tied to their own `users` row per `onboarding-oauth`).

## Todos
- [ ] Decide session-storage mechanism for multiple concurrent identities:
  multiple cookies (one per session token) vs. one cookie holding an
  ordered list/active pointer vs. a new `active_sessions` table
  (@ecarino@jairosoft.com, est 2h)
- [ ] Design `sessions` schema changes needed, if any (e.g. no changes if
  going the multiple-cookies route) (@ecarino@jairosoft.com, est 2h)
- [ ] Implement "add another account" entry point (reuse
  `/api/auth/github/login` flow without clearing the existing cookie)
  (@ecarino@jairosoft.com, est 4h)
- [ ] Implement account-switch endpoint/action (@ecarino@jairosoft.com, est 3h)
- [ ] Implement per-account logout (@ecarino@jairosoft.com, est 2h)
- [ ] Build account-switcher UI component (new — no existing user
  menu/header to extend) (@ecarino@jairosoft.com, est 5h)
- [ ] Update `getCurrentUser()` / `current-user.ts` to resolve the active
  identity from the new storage mechanism (@ecarino@jairosoft.com, est 3h)

## Daily log
- 2026-08-29 (@ecarino, 0h): Spec created. Confirmed via exploration that
  no multi-session support exists today — `isidore_session` cookie maps
  1:1 to a `sessions` row to a `users` row, with no switcher UI or
  multi-identity concept anywhere in the app. Confirmed this is distinct
  from the GitHub App installation-picker already shipped in
  `onboarding-oauth` (`/api/auth/github/install`), which adds repo access
  for the *current* single identity, not additional logged-in identities.

## Decisions & risks
- **Not yet decided: session storage mechanism for multiple identities**
  (see Todos). Multiple cookies is the lowest-risk option (no schema
  change, each cookie independently expires/clears) but needs a stable
  naming/ordering scheme and a way to track which is "active." A single
  cookie holding a JSON list is more flexible but changes the cookie's
  trust model (still just an opaque list of hashed-token-backed session
  ids, so no new secret exposure, but needs careful size/parsing handling).
- **Two separate login systems already exist in this codebase and must not
  be conflated**: the app's real owner-facing sign-in is GitHub OAuth
  (route-driven, no dedicated page, per `onboarding-oauth`), while the
  page actually located at `/login` is a *different* magic-link system for
  dashboard **viewers** (`apps/web/src/app/login/page.tsx`,
  `packages/db/src/viewer-auth.ts`). This feature is scoped to the owner
  GitHub-OAuth identity only; whether viewer magic-link sessions need
  similar multi-account handling is an open question, not assumed in
  scope here.
- **No dedicated `/login` page or user-menu UI exists for the GitHub OAuth
  flow today.** This feature likely needs to introduce a real login
  page and a header/user-menu component from scratch, not just extend
  something that already exists — scope estimate above assumes new UI is
  in scope, not carved out.

## Links
- PR:
- Branch:
