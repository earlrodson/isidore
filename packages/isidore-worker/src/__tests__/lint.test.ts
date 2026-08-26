import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findStatusDrift, formatStatusDrift } from "../lint.js";

const fixture = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url)),
    "utf8",
  );

describe("findStatusDrift", () => {
  it("flags an item where every todo is done but status is still in-flight", () => {
    const drifted = findStatusDrift({
      featuresDir: "unused",
      loadFeatures: () => [
        {
          filename: "all-todos-done-status-stale.md",
          content: fixture("all-todos-done-status-stale.md"),
        },
      ],
    });

    expect(drifted).toEqual([
      {
        id: "all-todos-done-status-stale",
        title: "Fixture — every todo done but status never advanced",
        status: "implementing",
        filename: "all-todos-done-status-stale.md",
      },
    ]);
  });

  it("does not flag an item with open todos", () => {
    const drifted = findStatusDrift({
      featuresDir: "unused",
      loadFeatures: () => [
        { filename: "isi-cli-init.md", content: fixture("isi-cli-init.md") },
      ],
    });

    expect(drifted).toEqual([]);
  });

  it("does not flag a done item", () => {
    const drifted = findStatusDrift({
      featuresDir: "unused",
      loadFeatures: () => [
        { filename: "ingest-endpoint-hmac.md", content: fixture("ingest-endpoint-hmac.md") },
      ],
    });

    expect(drifted).toEqual([]);
  });

  it("does not flag an item with no todos at all", () => {
    const content = [
      "---",
      "schema_version: 1",
      "id: no-todos-yet",
      "title: No todos yet",
      "type: feature",
      "status: implementing",
      "owners: [earlrodsin@gmail.com]",
      "created: 2026-08-01",
      "updated: 2026-08-01",
      "---",
      "",
      "## Todos",
      "",
      "## Daily log",
    ].join("\n");

    const drifted = findStatusDrift({
      featuresDir: "unused",
      loadFeatures: () => [{ filename: "no-todos.md", content }],
    });

    expect(drifted).toEqual([]);
  });
});

describe("formatStatusDrift", () => {
  it("reports a clean result when nothing drifted", () => {
    expect(formatStatusDrift([])).toBe("isi lint: no status drift found.");
  });

  it("lists each drifted item with its filename and status", () => {
    const output = formatStatusDrift([
      { id: "foo", title: "Foo", status: "implementing", filename: "foo.md" },
    ]);

    expect(output).toContain("1 item(s)");
    expect(output).toContain('foo.md: all todos done, status still "implementing" (foo)');
  });
});
