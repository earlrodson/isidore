import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildContext, UnknownFeatureIdError } from "../context.js";

const fixture = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url)),
    "utf8",
  );

const loadFeatures = () => [
  { filename: "isi-cli-init.md", content: fixture("isi-cli-init.md") },
  { filename: "ingest-endpoint-hmac.md", content: fixture("ingest-endpoint-hmac.md") },
];

describe("buildContext", () => {
  it("includes only items with an open status and remaining todos", () => {
    const output = buildContext({ featuresDir: "unused", loadFeatures });

    // isi-cli-init.md is `status: planned` with open todos.
    expect(output).toContain("isi CLI — init command");
    // ingest-endpoint-hmac.md is `status: done` — excluded.
    expect(output).not.toContain("ingest-endpoint-hmac");
  });

  it("renders description, acceptance criteria, and only unchecked todos", () => {
    const output = buildContext({ featuresDir: "unused", loadFeatures });

    expect(output).toContain("### Description");
    expect(output).toContain("### Acceptance criteria");
    expect(output).toContain("### Remaining todos");
    expect(output).toContain("Bundle canonical `GUIDELINES.md`");
  });

  it("scopes to a single item by --id", () => {
    const output = buildContext({
      featuresDir: "unused",
      id: "isi-cli-init",
      loadFeatures,
    });

    expect(output).toContain("isi-cli-init");
    expect(output).not.toContain("---\n\n##");
  });

  it("throws UnknownFeatureIdError for an unmatched --id", () => {
    expect(() =>
      buildContext({ featuresDir: "unused", id: "does-not-exist", loadFeatures }),
    ).toThrow(UnknownFeatureIdError);
  });

  it("reports no remaining work when every item is closed", () => {
    const output = buildContext({
      featuresDir: "unused",
      loadFeatures: () => [
        { filename: "ingest-endpoint-hmac.md", content: fixture("ingest-endpoint-hmac.md") },
      ],
    });

    expect(output).toBe("No remaining todos across docs/features/*.md.");
  });
});
