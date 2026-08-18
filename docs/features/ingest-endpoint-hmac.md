---
schema_version: 1
id: ingest-endpoint-hmac
title: Ingest endpoint with HMAC verification
type: feature
status: planned
priority: high
owners: [earlrodsin@gmail.com]
estimate_hours: 8
hours_logged: 0
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
- [ ] Endpoint verifies HMAC signature per repo secret; rejects on mismatch
- [ ] Rejects requests with timestamp/nonce outside replay window (TECHSTACK.md §7)
- [ ] Rejects unknown `payload_schema_version` outright, no partial parse
      (PRD.md §6.2, TECHSTACK.md §6)
- [ ] Idempotent: re-POST of the same payload overwrites the same row keyed
      on `provider + repo_id + feature_id`, never duplicates
- [ ] Raw payload persisted before normalization runs, so a normalization
      bug never loses data (TECHSTACK.md §4.2)
- [ ] Ingest path shares no dependencies with onboarding/OAuth code
      (TECHSTACK.md §7)

## Todos
- [ ] Implement signature verification middleware (@earlrodsin@gmail.com, est 3h)
- [ ] Implement replay protection (timestamp + nonce) (@earlrodsin@gmail.com, est 2h)
- [ ] Wire endpoint to snapshots write + normalization derivation (@earlrodsin@gmail.com, est 3h)

## Daily log
- 2026-08-18 (@earlrodsin@gmail.com, 0h): item created

## Decisions & risks
- Depends on [[payload-contract-v1]] and [[postgres-schema-snapshots]].

## Links
- PR:
- Branch:
