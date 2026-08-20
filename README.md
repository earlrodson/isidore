# Isidore

Isidore is a read-only, cross-project dashboard for AI-native development
work. It never authors work items — it reads structured planning files
(`docs/features/*.md`) that already live in each onboarded repo, ingests a
derived snapshot from CI, and gives teams and stakeholders one place to see
what's planned, in progress, and done across every project. See `docs/PRD.md`
for the full product rationale and `docs/TECHSTACK.md` for the pipeline
architecture.

## How it fits together

```
onboarded repo (docs/features/*.md)
        │  CI push to develop
        ▼
isidore-worker  (parses features, enriches from git/GitHub, signs, POSTs)
        │  HTTPS + HMAC
        ▼
apps/web  /api/ingest  →  packages/db (raw + normalized Postgres tables)
        │
        ▼
apps/web dashboard  (cross-project rollups, per-project drill-down, reports)
```

- **`apps/web`** — Next.js app: the dashboard, the onboarding flow (GitHub
  App OAuth), and the `/api/ingest` endpoint.
- **`packages/db`** — Drizzle + Postgres schema, migrations, and query layer.
- **`packages/isidore-worker`** — the stateless worker that runs in a
  consumer repo's CI, plus the `isi` CLI (`isi init`, `isi context`).
- **`packages/shared`** — the ingest payload contract (Zod schema) shared by
  the worker and the web app.

## Prerequisites

- Node.js ≥ 20
- pnpm (workspace-managed monorepo)
- A local Postgres instance
- A GitHub App (for onboarding login) — only needed if you're testing the
  onboarding flow; the dashboard/ingest path doesn't require it

## Setup

```bash
pnpm install

# Copy and fill in env vars (see apps/web/.env.example for what each does)
cp apps/web/.env.example apps/web/.env.local

# Apply migrations against your local Postgres
pnpm --filter @isidore/db db:migrate
```

`DATABASE_URL` in `.env.local` is what the *deployed/dev-running app*
actually reads. Don't rely on a separately-guessed env file for anything
that writes to the same database the app reads from — see the
`DATABASE_URL` drift risk documented in
`docs/features/onboarding-oauth.md`.

## Running the app

```bash
pnpm --filter @isidore/web dev
```

Visit `http://localhost:3000`:

- `/` — cross-project dashboard (rollups: features done/total, stale todos,
  last snapshot received per project).
- `/projects/[provider]/[...repoId]` — per-project detail: features, todos,
  completed-per-week, estimation drift, developer allocation.
- `/onboarding` — connect a repo:
  1. Log in via the GitHub App (OAuth).
  2. Install the App on an account/org and pick repos to grant it.
  3. Per repo: scaffold `docs/features/` (opens a PR) if it doesn't exist
     yet, generate/rotate the repo's ingest secret (shown once — save it),
     and copy the generated CI snippet into
     `.github/workflows/isidore-worker.yml`. Optionally override the
     staging/production branch names the CI snippet is generated with
     before copying it, if the repo doesn't use `staging`/`main`.

## Onboarding a repo to send data

Once a repo is onboarded via `/onboarding`:

1. Add the generated workflow file, with the ingest secret filled in as the
   repo's `ISIDORE_HMAC_SECRET` Actions secret.
2. Push to the repo's base branch (`develop` by default). The workflow
   downloads the published `isidore-worker` release tarball and runs it —
   no checkout/build of Isidore's own source required.
3. The worker parses `docs/features/*.md`, enriches each feature with open
   PR state and its furthest-reached environment (develop/staging/
   production, via commit ancestry), signs the payload, and POSTs it to
   `/api/ingest`.
4. The project shows up on the dashboard within the same CI run.

## The `docs/features/` convention

Every onboarded repo needs a `docs/features/` folder, one Markdown file per
work item, each with required frontmatter (`id`, `title`, `type`, `status`,
`owners`, ...), an `## Acceptance criteria` section, a `## Todos` section,
and a `## Daily log`. Run `isi init` (from `@isidore/worker`'s CLI) to
scaffold `GUIDELINES.md` and the `TEMPLATE-*.md` files into a new repo —
onboarding's "scaffold" button does the same thing via a PR. Full spec:
`docs/features/GUIDELINES.md`.

## Development commands

```bash
pnpm -r dev         # (apps/web only) dev server
pnpm -r typecheck   # typecheck every package
pnpm -r test        # run every package's tests
pnpm -r build       # build every package
```

Package-scoped equivalents work too, e.g.
`pnpm --filter @isidore/db test`. `packages/db`'s tests need a live
Postgres reachable via `DATABASE_URL` (or they default to
`postgresql://$USER@localhost:5432/isidore_test`) — point this at a
disposable test database, not your dev/prod one, since tests truncate
tables between runs.

## Semantic search / project tooling

```bash
pnpm run index                        # build the vector index
bun tools/vector-search.ts "<query>"  # search it
pnpm run snapshot                     # regenerate .claude/snapshot.json
```

See `CLAUDE.md` for the full set of project-specific commands and
conventions used when developing Isidore itself.
