---
schema_version: 1
id: all-todos-done-status-stale
title: Fixture — every todo done but status never advanced
type: feature
status: implementing
priority: high
owners: [earlrodsin@gmail.com]
estimate_hours: 4
hours_logged: 4
created: 2026-08-01
updated: 2026-08-02
---

## Description
Fixture for `isi lint`: every Todo below is checked `[x]` but `status` is
still `implementing`, which is exactly the drift the check exists to catch.

## Acceptance criteria
- [x] n/a — fixture only

## Todos
- [x] First todo (@earlrodsin@gmail.com, est 2h, due 2026-08-01, done 2026-08-01)
- [x] Second todo (@earlrodsin@gmail.com, est 2h, due 2026-08-02, done 2026-08-02)

## Daily log
- 2026-08-02 (@earlrodsin@gmail.com, 4h): fixture created
