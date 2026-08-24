#!/usr/bin/env node
import type { Provider } from "@isidore/shared";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { runWorker } from "./core.js";
import { runEnvironmentPing } from "./environment-ping.js";

/**
 * Thin wrapper GitHub Actions invokes (TECHSTACK.md §3.1). Branch-aware
 * (feature-environment-tracking.md AC-007/008): `GITHUB_REF_NAME` is only
 * set inside GitHub Actions, so a manual/local invocation (e.g. `isi push`)
 * always falls through to the normal `develop` snapshot path unchanged. A
 * push whose ref matches the configured staging/production branch runs
 * `runEnvironmentPing` instead of `runWorker` — never both.
 */

const DEFAULT_STAGING_BRANCH = "staging";
const DEFAULT_PRODUCTION_BRANCH = "main";

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

  const provider = (process.env.ISIDORE_PROVIDER ?? "github") as Provider;
  const repoId = process.env.ISIDORE_REPO_ID ?? githubRepository;
  const project = process.env.ISIDORE_PROJECT ?? repo;
  const timezone = process.env.ISIDORE_TIMEZONE ?? "UTC";
  const featuresDir = process.env.ISIDORE_FEATURES_DIR ?? "docs/specifications";
  const endpoint = requireEnv("ISIDORE_INGEST_ENDPOINT");
  const secret = requireEnv("ISIDORE_HMAC_SECRET");

  const refName = process.env.GITHUB_REF_NAME;
  const stagingBranch = process.env.ISIDORE_STAGING_BRANCH ?? DEFAULT_STAGING_BRANCH;
  const productionBranch = process.env.ISIDORE_PRODUCTION_BRANCH ?? DEFAULT_PRODUCTION_BRANCH;

  if (refName === stagingBranch || refName === productionBranch) {
    const environment = refName === productionBranch ? "production" : "staging";
    const result = await runEnvironmentPing({
      provider,
      repoId,
      project,
      environment,
      timezone,
      featuresDir,
      endpoint,
      secret,
    });
    console.log(
      `isidore-worker: pushed environment ping for ${result.payload.repo_id} ` +
        `(${result.payload.feature_ids.length} feature ids, environment ${environment}, ` +
        `${result.attempts} attempt(s), status ${result.status})`,
    );
    return;
  }

  const result = await runWorker({
    provider,
    repoId,
    project,
    baseBranch: process.env.ISIDORE_BASE_BRANCH ?? "develop",
    timezone,
    featuresDir,
    owner,
    repo,
    githubToken: requireEnv("GITHUB_TOKEN"),
    endpoint,
    secret,
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
