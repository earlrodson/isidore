#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildContext, UnknownFeatureIdError } from "./context.js";
import {
  FeaturesFolderExistsError,
  initFeaturesFolder,
} from "./scaffold.js";

/**
 * `isi` CLI (TECHSTACK.md §3.1). Commands: `isi init` scaffolds
 * `docs/features/` for a newly onboarded repo; `isi context` dumps its open
 * items as markdown for any CLI-based coding agent to consume. `isi push`
 * (the manual override for `core.ts`'s `runWorker`) is tracked separately
 * and not yet implemented.
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

function printContextHelp(): void {
  console.log(
    [
      "isi context — print docs/features/ open items (remaining todos) as",
      "markdown, for piping into any CLI coding agent",
      "",
      "Usage: isi context [--id <slug>]",
      "",
      "  --id <slug>   Scope to a single item's frontmatter id instead of",
      "                every item with an open status and remaining todos",
      "",
      "Example: isi context | claude -p \"implement the remaining todos above\"",
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

  if (command === "context") {
    if (rest.includes("--help")) {
      printContextHelp();
      return;
    }
    const idFlagIndex = rest.indexOf("--id");
    const id = idFlagIndex === -1 ? undefined : rest[idFlagIndex + 1];
    const featuresDir = join(process.cwd(), "docs", "features");
    try {
      console.log(buildContext({ featuresDir, id }));
    } catch (error) {
      if (error instanceof UnknownFeatureIdError) {
        console.error(`isi context: ${error.message}`);
        process.exitCode = 1;
        return;
      }
      throw error;
    }
    return;
  }

  console.error(
    `isi: unknown command "${command ?? ""}" — expected "init" or "context"`,
  );
  process.exitCode = 1;
}

// realpathSync matters when invoked via an npm/pnpm bin symlink
// (node_modules/.bin/isi) — process.argv[1] is the symlink path, which
// import.meta.url (always the real file) would never equal otherwise.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
