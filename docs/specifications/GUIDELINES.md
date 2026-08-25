# Specification tracking guardrails

**Current schema version: `1`** — bump only when this contract itself
changes (a field added/removed/renamed), never per edit to an item file.

One file per work item at `docs/specifications/<slug>.md`. No week- or
type-based nesting — items are keyed by identity, not by calendar or
category. `<slug>` matches `id` below, kebab-case, and stays stable for the
life of the item (reclassifying `type` later must not require moving/
renaming the file).

Copy the matching template to start a new item:
- `TEMPLATE-feature.md` — for `feature`
- `TEMPLATE-enabler.md` — for `enabler`
- `TEMPLATE-defect.md` — for `defect`
- `TEMPLATE-experiment.md` — for `experiment`
- `TEMPLATE-prototype.md` — for `prototype`

## Repository contract

1. **Type — frontmatter is authoritative.** `type` decides what an item is.
   Filenames are identity (`<slug>`) only — never infer or change `type` from
   a filename, suffix, or folder location, and reclassifying `type` must
   never require moving or renaming the file.
2. **Traceability — optional link to the originating PRD.** `prd_ref` (see
   Frontmatter rule 9 below) names the PRD/BRD section an item was broken
   down from, in `<path>#<section>` format. Omit it when the item wasn't
   sourced from a formal doc — that omission is itself meaningful, since it's
   how a report finds undocumented work.

## Frontmatter (required keys, exact names)

```yaml
---
schema_version: 1                     # must match "Current schema version" above
id: <slug>
title: <human title>
type: feature | enabler | defect | experiment | prototype
status: new | analyzing | ready | implementing | validating | deploying | releasing | done | removed | blocked
priority: low | medium | high        # defect uses `severity` instead — see below
ado_id: <ADO work item id>            # omit the key entirely if there is none
prd_ref: <path>#<section>             # e.g. docs/PRD.md#3 — omit if not sourced from a PRD/BRD
owners: [<handle>, ...]
estimate_hours: <number>
hours_logged: <number>                 # derived — see rule 1, never hand-edited
created: <YYYY-MM-DD>
target_date: <YYYY-MM-DD>             # optional
updated: <YYYY-MM-DD>                 # bump on every edit
---
```

`defect` frontmatter replaces `priority` with:
```yaml
severity: low | medium | high | critical
```

Any type may optionally add:
```yaml
relates_to: [<slug>, ...]             # e.g. a defect naming the feature it broke
```
`relates_to` is one-directional — set it only on the file making the
reference (typically a `defect` pointing at the `feature`/`enabler` it was
found against). Don't mirror it back onto the referenced file; a report
script computes the reverse join by scanning every file's `relates_to`.

## Rules for AI (and humans) editing these files

1. **`hours_logged` is derived, not authored.** Recompute it as the sum of the
   hours in every `## Daily log` line. Never increment or type a new value by
   hand — that's how it drifts from reality.
2. **Todos use a fixed, parseable line format** so tooling can count
   done/total, sum estimates, and filter by day:
   - Open: `- [ ] <description> (@<owner>, est <N>h, due <YYYY-MM-DD>)`
   - Done: `- [x] <description> (@<owner>, est <N>h, due <YYYY-MM-DD>, done <YYYY-MM-DD>)`
   - `due` is optional — omit it entirely for unscheduled backlog items. A
     todo with no `due` is not "today's work," just queued work.
   - No other shapes — always include `@owner` and `est <N>h` at minimum.
3. **Daily log is append-only**, one line per entry, appended at the bottom in
   chronological order:
   `- <YYYY-MM-DD> (@<owner>, <N>h): <one-line summary>`
   Never rewrite or delete a past entry. To correct one, add a new entry that
   says so. This is also how "what did I do yesterday" gets answered — filter
   every file's Daily log for that date.
4. **`status` moves forward only**: `new → analyzing → ready → implementing →
   validating → deploying → releasing → done`. `blocked` is reachable from
   any in-flight stage and returns to the stage it left from once
   unblocked; `removed` is reachable from any state. Don't silently move a
   `done` item backward — if it's reopened, say why under Decisions & risks.
5. **`updated` bumps to today's date on every edit.**
6. **`ado_id` is optional.** Omit the key entirely when there's no linked
   Azure DevOps work item — don't write `null` or `""`.
7. **Section order is fixed per type** (see the matching template) and
   headings are not renamed or reordered — future tooling parses by heading.
8. **`schema_version` must equal the current version declared at the top of
   this file.** Never invent a different value per file. A reporting tool
   that sees an unrecognized version should reject the file with a clear
   error rather than partially parse it.
9. **`prd_ref` is optional.** Omit the key entirely when the item wasn't
   broken down from a formal PRD/BRD doc. When present, format is
   `<path>#<section>`, pointing at the source document and section that
   this item implements — this is what lets a report flag PRD sections that
   were never broken down, or items with no PRD behind them.

## Answering "yesterday / today" from this format

- **Yesterday**: scan every `docs/specifications/*.md`, collect `## Daily log`
  lines dated yesterday for the relevant `@owner`.
- **Today**: collect open (`- [ ]`) todos across in-flight/`blocked`
  items where `due` is today or earlier (overdue), for the relevant
  `@owner`. Todos with no `due` are backlog, not "today."

## Report tooling notes

The Isidore worker reads these files on every push and forwards `type`,
`severity`, and `relates_to` through to the dashboard (ingest payload
contract `1.5`) — a `defect`, `experiment`, or `prototype` file shows up
there as such, not just as an undifferentiated `feature`. It, and any
other tool reading these files, should:
- Glob `docs/specifications/*.md` **excluding** `GUIDELINES.md` and
  `TEMPLATE-*.md` by filename — those two carry placeholder frontmatter,
  not real items.
- Treat `relates_to` as one-directional and compute the reverse join itself
  (e.g. "defects filed against this feature" = every file whose `relates_to`
  contains this file's `id`).
- Reject any file whose `schema_version` doesn't match a version the tool
  understands, rather than partially parsing it.
- Use `prd_ref` to compute traceability: items with no `prd_ref` (undocumented
  work) and PRD sections with no item referencing them (never broken down).

## Cross-project rollup

Every project that adopts this convention uses the identical schema above at
`docs/specifications/*.md` in its own repo — tracking stays versioned next to
the code it describes, not centralized. A separate reporting script (outside
any one project) can glob `~/repos/*/docs/specifications/*.md`, parse
frontmatter, and merge across repos, since the project name is recoverable
from the repo path itself and every file's field names line up exactly.
Nothing above needs to change to support that; the script is the only new
piece.
