#!/usr/bin/env node
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  FeaturesFolderExistsError,
  initFeaturesFolder,
} from "./scaffold.js";

/**
 * `isi` CLI (TECHSTACK.md §3.1). v1 has one command: `isi init`, which
 * scaffolds `docs/features/` for a newly onboarded repo. `isi push` (the
 * manual override for `core.ts`'s `runWorker`) is tracked separately and not
 * yet implemented.
 */

function printInitHelp(): void {
  console.log(
    [
      "isi init — scaffold docs/features/ with the canonical GUIDELINES.md",
      "and TEMPLATE-*.md files",
      "",
      "Usage: isi init [--force]",
      "",
      "  --force   Overwrite an existing docs/features/GUIDELINES.md",
    ].join("\n"),
  );
}

export async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  if (command === "init") {
    const force = rest.includes("--force");
    if (rest.includes("--help")) {
      printInitHelp();
      return;
    }
    const destDir = join(process.cwd(), "docs", "features");
    try {
      const result = initFeaturesFolder({ destDir, force });
      console.log(
        `isi init: wrote ${result.filesWritten.length} file(s) to ${result.destDir}`,
      );
    } catch (error) {
      if (error instanceof FeaturesFolderExistsError) {
        console.error(`isi init: ${error.message}`);
        process.exitCode = 1;
        return;
      }
      throw error;
    }
    return;
  }

  console.error(`isi: unknown command "${command ?? ""}" — expected "init"`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
