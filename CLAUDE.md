<!-- session-warm-start -->
<!--
  READ THIS FIRST at the start of every session.
  Then read .claude/snapshot.json (if present) for schema, routes, env map, and commands.
  Regenerate: pnpm run snapshot | pnpm run index
-->

## Session context

```yaml
project:  isidore
stack:    pnpm workspace · Next.js (apps/web) · Drizzle + Postgres (packages/db) · TypeScript
snapshot: .claude/snapshot.json
```

## Commands (do not re-derive)

```bash
dev:       pnpm --filter @isidore/web dev
lint:      pnpm -r lint
typecheck: pnpm -r typecheck
test:      pnpm -r test
index:     pnpm run index
search:    bun tools/vector-search.ts "<query>"
snapshot:  pnpm run snapshot
```

## Semantic search (use before grep)

```bash
bun tools/vector-search.ts "<query>"          # top 5 results
bun tools/vector-search.ts "<query>" --json   # machine-readable
```

**Rule:** use this before any grep, find, or Explore agent call.

<!-- /session-warm-start -->
