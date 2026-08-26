import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FeatureFileParseError,
  isFeatureFile,
  parseFeatureFile,
} from "../parser.js";

const fixture = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url)),
    "utf8",
  );

describe("isFeatureFile", () => {
  it("excludes GUIDELINES.md", () => {
    expect(isFeatureFile("GUIDELINES.md")).toBe(false);
    expect(isFeatureFile("docs/specifications/GUIDELINES.md")).toBe(false);
  });

  it("excludes TEMPLATE-*.md", () => {
    expect(isFeatureFile("TEMPLATE-feature.md")).toBe(false);
    expect(isFeatureFile("TEMPLATE-defect.md")).toBe(false);
  });

  it("excludes GUIDELINES.md and TEMPLATE-*.md with a leading sort-order digit", () => {
    expect(isFeatureFile("1GUIDELINES.md")).toBe(false);
    expect(isFeatureFile("docs/specifications/1GUIDELINES.md")).toBe(false);
    expect(isFeatureFile("2TEMPLATE-feature.md")).toBe(false);
    expect(isFeatureFile("6TEMPLATE-defect.md")).toBe(false);
  });

  it("includes a real item file", () => {
    expect(isFeatureFile("ingest-endpoint-hmac.md")).toBe(true);
    expect(isFeatureFile("docs/specifications/ingest-endpoint-hmac.md")).toBe(true);
  });

  it("excludes the scaffold's non-.md manifest file", () => {
    expect(isFeatureFile(".isidore-templates.json")).toBe(false);
    expect(isFeatureFile("docs/specifications/.isidore-templates.json")).toBe(false);
  });
});

describe("parseFeatureFile", () => {
  it("parses frontmatter, todos, and daily log from a done feature", () => {
    const parsed = parseFeatureFile(fixture("ingest-endpoint-hmac.md"));

    expect(parsed.frontmatter.id).toBe("ingest-endpoint-hmac");
    expect(parsed.frontmatter.type).toBe("feature");
    expect(parsed.frontmatter.status).toBe("done");
    expect(parsed.frontmatter.owners).toEqual(["earlrodsin@gmail.com"]);
    expect(parsed.frontmatter.relates_to).toEqual([
      "payload-contract-v1",
      "postgres-schema-snapshots",
    ]);

    expect(parsed.todos).toHaveLength(3);
    expect(parsed.todos[0]).toEqual({
      description: "Implement signature verification middleware",
      owner: "earlrodsin@gmail.com",
      estimateHours: 3,
      due: null,
      done: true,
      doneDate: null,
    });

    expect(parsed.dailyLog).toHaveLength(2);
    expect(parsed.dailyLog[1].hours).toBe(7);
  });

  it("derives hoursLogged from the Daily log, ignoring the authored value", () => {
    const parsed = parseFeatureFile(fixture("ingest-endpoint-hmac.md"));
    // Frontmatter says hours_logged: 7 — same value here, but derived
    // independently from the Daily log lines (0 + 7), not read from
    // frontmatter, per GUIDELINES.md rule 1.
    expect(parsed.hoursLogged).toBe(7);
  });

  it("parses a new item with no done todos yet", () => {
    const parsed = parseFeatureFile(fixture("isi-cli-init.md"));

    expect(parsed.frontmatter.status).toBe("new");
    expect(parsed.todos.every((t) => t.done === false)).toBe(true);
    expect(parsed.hoursLogged).toBe(0);
  });

  it("extracts the Description and Acceptance criteria sections", () => {
    const parsed = parseFeatureFile(fixture("isi-cli-init.md"));

    expect(parsed.description).toContain("isi init");
    expect(parsed.acceptanceCriteria).toContain(
      "byte-identical to the canonical copies",
    );
  });

  it("defaults description and acceptanceCriteria to empty strings when absent", () => {
    const content = `---
schema_version: 1
id: no-sections
title: No sections
type: feature
status: new
owners: [handle]
estimate_hours: 0
hours_logged: 0
created: 2026-01-01
updated: 2026-01-01
---

## Todos
- [ ] Do the thing (@handle, est 1h)
`;
    const parsed = parseFeatureFile(content);

    expect(parsed.description).toBe("");
    expect(parsed.acceptanceCriteria).toBe("");
  });

  it("throws on a missing frontmatter block", () => {
    expect(() => parseFeatureFile("## Description\nno frontmatter here")).toThrow(
      FeatureFileParseError,
    );
  });

  it("throws on a malformed todo line", () => {
    const content = `---
schema_version: 1
id: bad
title: Bad
type: feature
status: new
owners: [a]
created: 2026-08-18
updated: 2026-08-18
---

## Todos
- [ ] missing the owner/estimate suffix

## Daily log
- 2026-08-18 (@a, 0h): item created
`;
    expect(() => parseFeatureFile(content)).toThrow(FeatureFileParseError);
  });

  it("throws on a malformed daily log line", () => {
    const content = `---
schema_version: 1
id: bad
title: Bad
type: feature
status: new
owners: [a]
created: 2026-08-18
updated: 2026-08-18
---

## Todos
- [ ] do the thing (@a, est 1h)

## Daily log
- item created with no date or owner
`;
    expect(() => parseFeatureFile(content)).toThrow(FeatureFileParseError);
  });

  it("drops a nested annotation bullet under a todo instead of merging it", () => {
    const content = `---
schema_version: 1
id: with-annotation
title: With annotation
type: feature
status: done
owners: [a]
created: 2026-08-18
updated: 2026-08-18
---

## Todos
- [x] ship it (@a, est 2h, due 2026-08-20, done 2026-08-19)
  - AC: this is a nested note, not a continuation of the description above.
- [ ] do the next thing (@a, est 1h)

## Daily log
- 2026-08-19 (@a, 2h): shipped it
`;
    const parsed = parseFeatureFile(content);
    expect(parsed.todos).toHaveLength(2);
    expect(parsed.todos[0]).toEqual({
      description: "ship it",
      owner: "a",
      estimateHours: 2,
      due: "2026-08-20",
      done: true,
      doneDate: "2026-08-19",
    });
    expect(parsed.todos[1].description).toBe("do the next thing");
  });

  it("parses a due date and a done date on completed todos", () => {
    const content = `---
schema_version: 1
id: with-dates
title: With dates
type: feature
status: done
owners: [a]
created: 2026-08-18
updated: 2026-08-18
---

## Todos
- [x] ship it (@a, est 2h, due 2026-08-20, done 2026-08-19)

## Daily log
- 2026-08-19 (@a, 2h): shipped it
`;
    const parsed = parseFeatureFile(content);
    expect(parsed.todos[0]).toEqual({
      description: "ship it",
      owner: "a",
      estimateHours: 2,
      due: "2026-08-20",
      done: true,
      doneDate: "2026-08-19",
    });
  });
});
