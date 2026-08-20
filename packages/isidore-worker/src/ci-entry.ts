#!/usr/bin/env node
import type { Provider } from "@isidore/shared";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { runWorker } from "./core.js";

/**
 * Thin wrapper GitHub Actions invokes (TECHSTACK.md §3.1) — all logic lives
 * in `core.ts`'s `runWorker`; this file only reads env vars set by the CI
 * job and reports the result.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function main(): Promise<void> {
  const githubRepository = requireEnv("GITHUB_REPOSITORY");
  const [owner, repo] = githubRepository.split("/");

  const result = await runWorker({
    provider: (process.env.ISIDORE_PROVIDER ?? "github") as Provider,
    repoId: process.env.ISIDORE_REPO_ID ?? githubRepository,
    project: process.env.ISIDORE_PROJECT ?? repo,
    baseBranch: process.env.ISIDORE_BASE_BRANCH ?? "develop",
    timezone: process.env.ISIDORE_TIMEZONE ?? "UTC",
    featuresDir: process.env.ISIDORE_FEATURES_DIR ?? "docs/features",
    owner,
    repo,
    githubToken: requireEnv("GITHUB_TOKEN"),
    stagingBranch: process.env.ISIDORE_STAGING_BRANCH,
    productionBranch: process.env.ISIDORE_PRODUCTION_BRANCH,
    endpoint: requireEnv("ISIDORE_INGEST_ENDPOINT"),
    secret: requireEnv("ISIDORE_HMAC_SECRET"),
  });

  console.log(
    `isidore-worker: pushed snapshot for ${result.payload.repo_id} ` +
      `(${result.payload.features.length} features, ${result.attempts} attempt(s), status ${result.status})`,
  );
}

// realpathSync matters when invoked via an npm/pnpm bin symlink
// (node_modules/.bin/isidore-worker-ci) — process.argv[1] is the symlink
// path, which import.meta.url (always the real file) would never equal
// otherwise.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((error) => {
    console.error("isidore-worker: failed to push snapshot");
    console.error(error);
    process.exitCode = 1;
  });
}
