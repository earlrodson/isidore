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
    expect(isFeatureFile("docs/features/GUIDELINES.md")).toBe(false);
  });

  it("excludes TEMPLATE-*.md", () => {
    expect(isFeatureFile("TEMPLATE-feature.md")).toBe(false);
    expect(isFeatureFile("TEMPLATE-defect.md")).toBe(false);
  });

  it("includes a real item file", () => {
    expect(isFeatureFile("ingest-endpoint-hmac.md")).toBe(true);
    expect(isFeatureFile("docs/features/ingest-endpoint-hmac.md")).toBe(true);
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

  it("parses a planned item with no done todos yet", () => {
    const parsed = parseFeatureFile(fixture("isi-cli-init.md"));

    expect(parsed.frontmatter.status).toBe("planned");
    expect(parsed.todos.every((t) => t.done === false)).toBe(true);
    expect(parsed.hoursLogged).toBe(0);
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
status: planned
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
status: planned
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
