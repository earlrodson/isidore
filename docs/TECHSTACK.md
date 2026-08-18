# TECHSTACK — Isidore

**Status:** Draft
**Last updated:** 2026-08-18

---

## 1. Architecture in one line

Workers run inside each project repo's CI, parse the features folder from a local checkout, and **push** a signed snapshot to Isidore. The main app never crawls repos as its primary path.

This inversion is the core design decision. The worker has a full checkout, so it reads files from the filesystem rather than the provider's Contents API — no rate limits, no pagination, no per-file HTTP call. Reading one repo's features folder goes from potentially hundreds of API calls to one outbound POST.

## 2. Components

| Component | Runs where | Responsibility |
|---|---|---|
| `isidore-worker` | Project repo CI | Parse, enrich, package, sign, POST |
| Isidore API | Hosted | Verify, normalize, store, serve |
| Isidore web | Hosted | Dashboard, onboarding, drill-down |
| Reconcile job | Hosted, scheduled | API-pull safety net and backfill |

## 3. Worker

**Stack:** TypeScript, distributed as a single npm package and a Docker image. Invoked by a ~15-line CI config.

**Design constraints:**
- Stateless. Never queries Isidore, never makes decisions, never calls an LLM.
- Reads, packages, signs, sends. That's all.
- A broken worker cannot corrupt state — re-run it and the idempotent snapshot repairs itself.

**Pipeline:** checkout and parse → enrich from git (commits, PR state, assignees) → build versioned snapshot → HMAC sign and POST with retry.

**Why not Convex in the worker:** adding a Convex client to CI is strictly worse than one `curl` — same single outbound call, but now there's an SDK dependency and version to keep in sync across every repo.

### 3.1 Trigger model — one core function, two entry points

The parse-build-sign-send pipeline lives in a single function. CI and the CLI are both thin wrappers around it, so there is nothing to keep in sync between "what CI does" and "what a human runs manually."

```
isidore-worker/
├── src/core.ts        # parse + build + sign + send — the only logic
├── src/cli.ts          # isi push / isi push --dry-run / isi push --week
└── src/ci-entry.ts     # thin wrapper CI invokes, calls core.ts directly
```

**Automatic trigger.** CI fires on push/merge to `develop`. This is the primary path — no human action, snapshot flows the moment a PR lands.

```yaml
on:
  push:
    branches: [develop]
```

**Manual override — the `isi` CLI.** Same core function, invoked directly. Needed for cases the push trigger can't cover:

| Case | Command |
|---|---|
| Backfill history on a newly onboarded repo | `isi push --week 2026-W30` |
| Force re-send after CI outage or parser fix | `isi push --repo project-1 --week current` |
| Preview payload before it goes live | `isi push --dry-run` |
| Snapshot a long-lived feature branch early | `isi push --branch feature/x` |

Both triggers are safe to run concurrently because ingest is idempotent (keyed on `provider + repo_id + feature_id`) — a manual push and an automatic CI push simply overwrite the same row. The ingest endpoint has no notion of which trigger fired; that's what makes adding a second trigger free.

## 4. Main app

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node + TypeScript | Shares parsing/validation types with the worker via a common package |
| Framework | Next.js | API routes and dashboard in one deployment |
| Database | Postgres (managed — Neon or Supabase) | See 4.1 |
| Auth | Provider OAuth for onboarding only | Isolated from the ingest hot path |
| Charts | Recharts | Sufficient for the report set; no BI tool needed at this scale |
| Hosting | Vercel (app) + managed Postgres | No infra to operate |

### 4.1 Why Postgres and not Convex

Convex was considered. The verdict is Postgres, for two reasons:

1. **Realtime solves a problem we don't have.** Data changes on merge to `develop` — a few times a day. Nobody watches the dashboard waiting for a feature to flip to done in under a second. Convex's headline feature would be paid for and unused.
2. **The reports are analytical.** Estimation drift over time, group-by-project-by-week, joins across features/todos/assignees, cohort comparisons. This is where SQL wins and document-style query models get awkward. Reporting *is* the product, so the query model is not a detail.

**The exception:** if avoiding all infra ownership outweighs query ergonomics, Convex is defensible — HTTP actions cover ingest, scheduled functions cover reconcile, auth is integrated. Go in knowing the analytical queries will be more work and you will likely hand-denormalize report tables anyway. Managed Postgres gets both no-infra *and* SQL, which is why it wins.

### 4.2 Storage model

Two tiers, deliberately:

- **`snapshots`** — every incoming payload stored raw as `jsonb`, with its hash. Costs almost nothing.
- **Normalized tables** — `projects`, `features`, `todos`, `assignees`, `estimates`, `actuals`, `status_events`, derived from snapshots.

The raw tier is what makes the system maintainable. When the estimation-drift calculation changes or a parser bug surfaces, you replay stored snapshots instead of asking every repo to re-run CI. It also makes reconciliation cheap: compare a fresh pull's hash against the last stored one and skip the write when nothing changed.

Design each report as a query or materialized view over the normalized tables — not as an ad-hoc markdown parser. Every report in the PRD then becomes a different view over one schema rather than a one-off parser per report.

## 5. Multi-provider support

Because the worker parses and normalizes, the main app never learns anything provider-specific. Provider differences collapse to three small things:

| Concern | GitHub | GitLab | Bitbucket | Azure Repos |
|---|---|---|---|---|
| CI runner | Actions | GitLab CI | Pipelines | Azure Pipelines |
| Config path | `.github/workflows/` | `.gitlab-ci.yml` | `bitbucket-pipelines.yml` | `azure-pipelines.yml` |
| OAuth (onboarding) | GitHub OAuth App | GitLab OAuth | Atlassian OAuth | Microsoft Entra |

The parsing logic is identical everywhere — one package, four thin YAML wrappers.

## 6. Ingest payload contract

The single most important interface in the system: both codebases depend on it, and it is the thing to pin down before writing either side.

```json
{
  "payload_schema_version": "1.0",
  "provider": "github",
  "repo_id": "your-org/project-1",
  "project": "project-1",
  "week": "2026-W34",
  "base_branch": "develop",
  "commit_sha": "a1b2c3d",
  "generated_at": "2026-08-18T09:00:00+08:00",
  "timezone": "Asia/Manila",
  "features": [
    {
      "feature_id": "auth-refresh",
      "title": "Refresh token rotation",
      "prd_ref": "docs/PRD.md#4.2",
      "status": "in-progress",
      "owners": ["dev-a"],
      "estimate_hours": 8,
      "hours_logged": 5.5,
      "todos": [
        { "todo_id": "t1", "title": "Rotate on use", "done": true, "owner": "dev-a", "estimate_hours": 2, "due": null },
        { "todo_id": "t2", "title": "Revoke on reuse", "done": false, "owner": "dev-a", "estimate_hours": 3, "due": "2026-08-20" }
      ],
      "open_prs": [{ "number": 412, "state": "open", "updated_at": "2026-08-18T02:11:00Z" }]
    }
  ]
}
```

**Rules:**
- `payload_schema_version` on every payload — distinct from a feature file's own frontmatter `schema_version` (`docs/features/GUIDELINES.md`) — so the wire format can evolve without breaking workers that haven't been updated.
- Idempotency key is `provider + repo_id + feature_id` — one row per feature ever; a later push overwrites, it never forks a new row per week.
- Full snapshot per push, not a delta.
- `timezone` is carried explicitly so "yesterday" is unambiguous.
- Unknown `payload_schema_version` is rejected outright, never partially parsed.

**Dependency:** `estimate_hours` and `hours_logged` must be structured frontmatter in the feature markdown (the latter derived from `## Daily log`, per `docs/features/GUIDELINES.md`, never hand-authored). If estimates stay free text, the P0 estimation reports cannot be built. This is the one authoring-convention change the team must commit to.

## 7. Security

- Per-repo HMAC secret, generated at onboarding, stored in that repo's CI secrets. Verified on every ingest request.
- Timestamp + nonce in the signed payload for replay protection.
- OAuth tokens are used only during onboarding and for the reconcile job — never on the ingest path, so a provider OAuth change cannot break ingest.
- Onboarding and ingest are separate code paths that share no dependencies.

## 8. Build order

1. **Payload contract** (section 6) — frozen first; everything depends on it.
2. Postgres schema + raw snapshot table.
3. Ingest endpoint with HMAC verification.
4. Worker: parse + POST, GitHub Actions only.
5. Dashboard: cross-project summary + per-project detail.
6. P0 reports (completion, estimation drift, stale todos, allocation).
7. Onboarding OAuth flow + CI snippet generator.
8. Reconcile cron.
9. Second provider (proves the abstraction holds).
10. Digests, then P1 reports.

Steps 1–6 are a working system for one provider. Everything after is expansion.
