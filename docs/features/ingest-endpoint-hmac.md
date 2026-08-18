---
schema_version: 1
id: ingest-endpoint-hmac
title: Ingest endpoint with HMAC verification
type: feature
status: done
priority: high
owners: [earlrodsin@gmail.com]
estimate_hours: 8
hours_logged: 7
created: 2026-08-18
updated: 2026-08-18
# target_date: YYYY-MM-DD
prd_ref: docs/PRD.md#6.2
relates_to: [payload-contract-v1, postgres-schema-snapshots]
---

## Description
Single endpoint that accepts signed snapshot payloads, verifies the per-repo
HMAC signature, rejects unsigned/replayed/unknown-schema requests, and
writes the raw payload to `snapshots` before normalizing. Build order step 3
(TECHSTACK.md §8).

## Acceptance criteria
- [x] Endpoint verifies HMAC signature per repo secret; rejects on mismatch
- [x] Rejects requests with timestamp/nonce outside replay window (TECHSTACK.md §7)
- [x] Rejects unknown `payload_schema_version` outright, no partial parse
      (PRD.md §6.2, TECHSTACK.md §6)
- [x] Idempotent: re-POST of the same payload overwrites the same row keyed
      on `provider + repo_id + feature_id`, never duplicates
- [x] Raw payload persisted before normalization runs, so a normalization
      bug never loses data (TECHSTACK.md §4.2)
- [x] Ingest path shares no dependencies with onboarding/OAuth code
      (TECHSTACK.md §7)

## Todos
- [x] Implement signature verification middleware (@earlrodsin@gmail.com, est 3h)
- [x] Implement replay protection (timestamp + nonce) (@earlrodsin@gmail.com, est 2h)
- [x] Wire endpoint to snapshots write + normalization derivation (@earlrodsin@gmail.com, est 3h)

## Daily log
- 2026-08-18 (@earlrodsin@gmail.com, 0h): item created
- 2026-08-18 (@earlrodsin@gmail.com, 7h): scaffolded apps/web (Next.js 16, App
  Router) with `POST /api/ingest`. Added `repo_secrets` and `ingest_nonces`
  tables to packages/db (kept separate from any future onboarding/OAuth code
  per TECHSTACK.md §7). Signing scheme: `sha256(secret, timestamp.nonce.rawBody)`
  in `X-Isidore-Signature`, with `X-Isidore-Timestamp`/`X-Isidore-Nonce`
  headers — this is the contract the worker (step 4) must implement.
  300s replay window; nonce dedup via a unique DB constraint. Unknown
  `payload_schema_version` and bad signatures are rejected before any write.
  14 tests passing (7 unit on the HMAC/replay helpers, 7 integration against
  real Postgres covering sign/verify, idempotent re-POST, replay, and unknown
  schema rejection).

## Decisions & risks
- Depends on [[payload-contract-v1]] and [[postgres-schema-snapshots]].
- Per-repo secrets are stored in their own `repo_secrets` table rather than
  on `projects`, and seeded directly (no onboarding UI exists yet — that's
  step 7). This keeps the ingest path's only dependency on secret storage a
  plain keyed lookup, satisfying the "shares no dependencies with
  onboarding/OAuth" acceptance criterion ahead of onboarding being built.
- Signing input is `timestamp.nonce.rawBody`, verified against the exact raw
  request body (not the re-serialized JSON), so signatures aren't sensitive
  to key ordering or whitespace differences a worker might introduce.

## Links
- PR:
- Branch:
