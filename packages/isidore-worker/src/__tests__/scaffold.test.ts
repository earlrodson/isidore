import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FeaturesFolderExistsError,
  TEMPLATES_MANIFEST_FILENAME,
  buildTemplatesManifest,
  initFeaturesFolder,
  listCanonicalTemplateFiles,
  readCanonicalTemplateFiles,
  resourcesDir,
} from "../scaffold.js";

describe("resourcesDir / listCanonicalTemplateFiles", () => {
  it("bundles GUIDELINES.md and all three TEMPLATE-*.md files", () => {
    const files = listCanonicalTemplateFiles();
    expect(files).toEqual([
      "GUIDELINES.md",
      "TEMPLATE-defect.md",
      "TEMPLATE-feature.md",
      "TEMPLATE-spike.md",
    ]);
  });

  it("resolves to a real directory on disk", () => {
    expect(() => listCanonicalTemplateFiles(resourcesDir())).not.toThrow();
  });
});

describe("readCanonicalTemplateFiles", () => {
  it("returns the same files initFeaturesFolder writes, plus the manifest, byte-identical", () => {
    const files = readCanonicalTemplateFiles();

    expect(files.map((f) => f.filename)).toEqual([
      "GUIDELINES.md",
      "TEMPLATE-defect.md",
      "TEMPLATE-feature.md",
      "TEMPLATE-spike.md",
      TEMPLATES_MANIFEST_FILENAME,
    ]);

    const guidelines = files.find((f) => f.filename === "GUIDELINES.md");
    expect(guidelines?.content).toBe(readFileSync(join(resourcesDir(), "GUIDELINES.md"), "utf-8"));

    const manifest = files.find((f) => f.filename === TEMPLATES_MANIFEST_FILENAME);
    expect(JSON.parse(manifest?.content ?? "")).toEqual(buildTemplatesManifest());
  });

  it("writes nothing to disk", () => {
    const destDir = join(mkdtempSync(join(tmpdir(), "isidore-read-")), "docs", "features");
    readCanonicalTemplateFiles();
    expect(() => readFileSync(join(destDir, "GUIDELINES.md"))).toThrow();
  });
});

describe("initFeaturesFolder", () => {
  let destDir: string;

  beforeEach(() => {
    destDir = join(mkdtempSync(join(tmpdir(), "isidore-init-")), "docs", "features");
  });

  afterEach(() => {
    rmSync(destDir, { recursive: true, force: true });
  });

  it("scaffolds docs/features/ byte-identical to the bundled canonical copies", () => {
    const result = initFeaturesFolder({ destDir });

    expect(result.filesWritten).toEqual([
      "GUIDELINES.md",
      "TEMPLATE-defect.md",
      "TEMPLATE-feature.md",
      "TEMPLATE-spike.md",
      TEMPLATES_MANIFEST_FILENAME,
    ]);

    for (const filename of ["GUIDELINES.md", "TEMPLATE-feature.md"]) {
      const written = readFileSync(join(destDir, filename), "utf-8");
      const canonical = readFileSync(join(resourcesDir(), filename), "utf-8");
      expect(written).toBe(canonical);
    }
  });

  it("writes a checksum manifest matching buildTemplatesManifest", () => {
    initFeaturesFolder({ destDir });

    const manifest = JSON.parse(
      readFileSync(join(destDir, TEMPLATES_MANIFEST_FILENAME), "utf-8"),
    );
    expect(manifest).toEqual(buildTemplatesManifest());
  });

  it("refuses to overwrite an existing GUIDELINES.md without force", () => {
    initFeaturesFolder({ destDir });
    writeFileSync(join(destDir, "GUIDELINES.md"), "locally edited");

    expect(() => initFeaturesFolder({ destDir })).toThrow(
      FeaturesFolderExistsError,
    );
    expect(readFileSync(join(destDir, "GUIDELINES.md"), "utf-8")).toBe(
      "locally edited",
    );
  });

  it("overwrites when force is true", () => {
    initFeaturesFolder({ destDir });
    writeFileSync(join(destDir, "GUIDELINES.md"), "locally edited");

    initFeaturesFolder({ destDir, force: true });

    const written = readFileSync(join(destDir, "GUIDELINES.md"), "utf-8");
    const canonical = readFileSync(join(resourcesDir(), "GUIDELINES.md"), "utf-8");
    expect(written).toBe(canonical);
  });
});
