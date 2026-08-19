import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `isi init` scaffold step (docs/features/isi-cli-init.md): copies the
 * canonical docs/features/ guardrail files, bundled as package resources,
 * into a newly-onboarded repo — byte-identical, per that feature's
 * acceptance criteria.
 */

export const TEMPLATES_MANIFEST_FILENAME = ".isidore-templates.json";

/** Directory holding the canonical bundled copies, resolved relative to this module. */
export function resourcesDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "resources");
}

/** Every canonical template filename, in a stable order. */
export function listCanonicalTemplateFiles(dir: string = resourcesDir()): string[] {
  return readdirSync(dir).sort();
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export interface TemplatesManifest {
  schema_version: 1;
  files: Record<string, string>;
}

/** Sha256 of each canonical file — the drift-detection marker for a future `isi init --update`. */
export function buildTemplatesManifest(dir: string = resourcesDir()): TemplatesManifest {
  const files: Record<string, string> = {};
  for (const filename of listCanonicalTemplateFiles(dir)) {
    files[filename] = sha256(readFileSync(join(dir, filename), "utf-8"));
  }
  return { schema_version: 1, files };
}

export class FeaturesFolderExistsError extends Error {
  constructor(destDir: string) {
    super(
      `${join(destDir, "GUIDELINES.md")} already exists — pass force: true to overwrite`,
    );
    this.name = "FeaturesFolderExistsError";
  }
}

export interface InitFeaturesFolderParams {
  destDir: string;
  force?: boolean;
  sourceDir?: string;
}

export interface InitFeaturesFolderResult {
  destDir: string;
  filesWritten: string[];
}

/**
 * Scaffolds `docs/features/` with the canonical GUIDELINES.md + templates,
 * byte-identical to the bundled copies, plus a checksum manifest so a future
 * `isi init --update` can detect drift without touching the templates
 * themselves (which must stay byte-identical — acceptance criterion 1).
 * Refuses to overwrite an existing GUIDELINES.md unless `force` is set.
 */
export function initFeaturesFolder(
  params: InitFeaturesFolderParams,
): InitFeaturesFolderResult {
  const sourceDir = params.sourceDir ?? resourcesDir();
  const guidelinesDest = join(params.destDir, "GUIDELINES.md");

  if (!params.force && existsSync(guidelinesDest)) {
    throw new FeaturesFolderExistsError(params.destDir);
  }

  mkdirSync(params.destDir, { recursive: true });

  const filesWritten: string[] = [];
  for (const filename of listCanonicalTemplateFiles(sourceDir)) {
    const content = readFileSync(join(sourceDir, filename), "utf-8");
    writeFileSync(join(params.destDir, filename), content);
    filesWritten.push(filename);
  }

  const manifest = buildTemplatesManifest(sourceDir);
  writeFileSync(
    join(params.destDir, TEMPLATES_MANIFEST_FILENAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  filesWritten.push(TEMPLATES_MANIFEST_FILENAME);

  return { destDir: params.destDir, filesWritten };
}
