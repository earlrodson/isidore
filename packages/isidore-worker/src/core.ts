import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseIngestPayload,
  type Feature,
  type IngestPayload,
  type Provider,
  type Todo,
} from "@isidore/shared";
import { enrichOpenPrsByFeature, getHeadCommitSha, resolveEnvironment } from "./git.js";
import { isFeatureFile, parseFeatureFile } from "./parser.js";
import { postSnapshot, type PostSnapshotResult } from "./send.js";

/**
 * The worker's single core function (TECHSTACK.md §3.1): parse → enrich →
 * build → sign → send, all in one place so `ci-entry.ts` and any future
 * `cli.ts` are thin wrappers with nothing to keep in sync. Stateless — never
 * queries Isidore, makes no decisions, calls no LLM.
 */

export interface FeatureFileSource {
  filename: string;
  content: string;
}

/** Real filesystem read of `docs/features/*.md`, split out so tests can inject fixtures instead. */
export function loadFeatureFiles(featuresDir: string): FeatureFileSource[] {
  return readdirSync(featuresDir)
    .filter(isFeatureFile)
    .map((filename) => ({
      filename,
      content: readFileSync(join(featuresDir, filename), "utf-8"),
    }));
}

function isoWeek(date: Date): string {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNumber = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function toTodo(todo: ReturnType<typeof parseFeatureFile>["todos"][number], index: number): Todo {
  return {
    todo_id: `t${index + 1}`,
    title: todo.description,
    done: todo.done,
    owner: todo.owner,
    estimate_hours: todo.estimateHours,
    due: todo.due,
  };
}

export interface BuildSnapshotParams {
  provider: Provider;
  repoId: string;
  project: string;
  baseBranch: string;
  timezone: string;
  cwd?: string;
  featuresDir: string;
  owner: string;
  repo: string;
  githubToken: string;
  stagingBranch?: string;
  productionBranch?: string;
  now?: () => number;
  loadFeatures?: (featuresDir: string) => FeatureFileSource[];
  fetchImpl?: Parameters<typeof enrichOpenPrsByFeature>[0]["fetchImpl"];
}

/** Parses the features folder, enriches from git, and assembles a validated snapshot payload. */
export async function buildSnapshot(params: BuildSnapshotParams): Promise<IngestPayload> {
  const now = params.now ?? (() => Date.now());
  const loadFeatures = params.loadFeatures ?? loadFeatureFiles;

  const sources = loadFeatures(params.featuresDir);
  const parsed = sources.map(({ filename, content }) => {
    try {
      return parseFeatureFile(content);
    } catch (error) {
      throw new Error(`Failed to parse ${filename}: ${(error as Error).message}`);
    }
  });

  const featureIds = parsed.map((file) => file.frontmatter.id);
  const gitApiParams = {
    owner: params.owner,
    repo: params.repo,
    token: params.githubToken,
    fetchImpl: params.fetchImpl,
  };
  const commitSha = getHeadCommitSha(params.cwd);
  const [openPrsByFeature, environment] = await Promise.all([
    enrichOpenPrsByFeature(gitApiParams, featureIds),
    resolveEnvironment(gitApiParams, commitSha, {
      staging: params.stagingBranch,
      production: params.productionBranch,
    }),
  ]);

  const features: Feature[] = parsed.map((file) => ({
    feature_id: file.frontmatter.id,
    title: file.frontmatter.title,
    prd_ref: file.frontmatter.prd_ref ?? "unspecified",
    status: file.frontmatter.status,
    owners: file.frontmatter.owners,
    estimate_hours: file.frontmatter.estimate_hours ?? file.frontmatter.timebox_hours ?? 0,
    hours_logged: file.hoursLogged,
    environment,
    todos: file.todos.map(toTodo),
    open_prs: openPrsByFeature[file.frontmatter.id] ?? [],
  }));

  const generatedAt = new Date(now());

  return parseIngestPayload({
    payload_schema_version: "1.1",
    provider: params.provider,
    repo_id: params.repoId,
    project: params.project,
    week: isoWeek(generatedAt),
    base_branch: params.baseBranch,
    commit_sha: commitSha,
    generated_at: generatedAt.toISOString(),
    timezone: params.timezone,
    features,
  });
}

export interface RunWorkerParams extends BuildSnapshotParams {
  endpoint: string;
  secret: string;
  maxAttempts?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  nonce?: () => string;
}

export interface RunWorkerResult extends PostSnapshotResult {
  payload: IngestPayload;
}

/** The full pipeline: parse → enrich → build → sign → send. */
export async function runWorker(params: RunWorkerParams): Promise<RunWorkerResult> {
  const payload = await buildSnapshot(params);

  const result = await postSnapshot({
    endpoint: params.endpoint,
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
