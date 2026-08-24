import {
  parseEnvironmentPingPayload,
  type EnvironmentPingPayload,
  type Provider,
} from "@isidore/shared";
import { loadFeatureFiles, type FeatureFileSource } from "./core.js";
import { getHeadCommitSha } from "./git.js";
import { parseFeatureFile } from "./parser.js";
import { postSnapshot, type PostSnapshotResult } from "./send.js";

/**
 * feature-environment-tracking.md AC-008/009 — the narrow path a
 * `staging`/`production` push takes, as opposed to `develop`'s full
 * `runWorker`. Reads `docs/specifications/*.md` off *that* branch's
 * checkout, but extracts only `frontmatter.id` — status/todos/owners/
 * estimate_hours from that branch's (possibly stale) copy are parsed and
 * immediately discarded, never forwarded. That's what keeps PRD §5.2's
 * "plans only live on develop" rule intact under a multi-branch trigger.
 */

export interface BuildEnvironmentPingParams {
  provider: Provider;
  repoId: string;
  project: string;
  environment: "staging" | "production";
  timezone: string;
  cwd?: string;
  featuresDir: string;
  now?: () => number;
  loadFeatures?: (featuresDir: string) => FeatureFileSource[];
}

export function buildEnvironmentPing(
  params: BuildEnvironmentPingParams,
): EnvironmentPingPayload {
  const now = params.now ?? (() => Date.now());
  const loadFeatures = params.loadFeatures ?? loadFeatureFiles;

  const sources = loadFeatures(params.featuresDir);
  const featureIds = sources.map(({ filename, content }) => {
    try {
      return parseFeatureFile(content).frontmatter.id;
    } catch (error) {
      throw new Error(`Failed to parse ${filename}: ${(error as Error).message}`);
    }
  });

  return parseEnvironmentPingPayload({
    environment_ping_schema_version: "1.0",
    provider: params.provider,
    repo_id: params.repoId,
    project: params.project,
    environment: params.environment,
    commit_sha: getHeadCommitSha(params.cwd),
    generated_at: new Date(now()).toISOString(),
    timezone: params.timezone,
    feature_ids: featureIds,
  });
}

export interface RunEnvironmentPingParams extends BuildEnvironmentPingParams {
  endpoint: string;
  secret: string;
  maxAttempts?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  nonce?: () => string;
  fetchImpl?: Parameters<typeof postSnapshot>[0]["fetchImpl"];
}

export interface RunEnvironmentPingResult extends PostSnapshotResult {
  payload: EnvironmentPingPayload;
}

/** Builds → signs → sends. Posts to `${endpoint}/environment`, never `endpoint` itself. */
export async function runEnvironmentPing(
  params: RunEnvironmentPingParams,
): Promise<RunEnvironmentPingResult> {
  const payload = buildEnvironmentPing(params);

  const result = await postSnapshot({
    endpoint: `${params.endpoint}/environment`,
    payload,
    secret: params.secret,
    fetchImpl: params.fetchImpl,
    maxAttempts: params.maxAttempts,
    retryDelayMs: params.retryDelayMs,
    sleep: params.sleep,
    now: params.now,
    nonce: params.nonce,
  });

  return { ...result, payload };
}
