import { execFileSync } from "node:child_process";
import type { Environment, OpenPr } from "@isidore/shared";

/**
 * Git/GitHub enrichment step (TECHSTACK.md §3 pipeline: "enrich from git —
 * commits, PR state"). GitHub Actions only for v1 (TECHSTACK.md §5).
 * Stateless: reads the local checkout and the GitHub REST API, makes no
 * decisions, never queries Isidore.
 *
 * Feature `owners` come from each file's own frontmatter (GUIDELINES.md) —
 * git enrichment does not derive assignees, only commit/PR state.
 */

/** The current checkout's HEAD commit SHA — becomes the payload's `commit_sha`. */
export function getHeadCommitSha(cwd: string = process.cwd()): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd })
    .toString()
    .trim();
}

export interface GitHubPullRequestFile {
  filename: string;
}

export interface GitHubPullRequest {
  number: number;
  state: "open" | "closed";
  merged_at: string | null;
  updated_at: string;
}

export type FetchLike = typeof fetch;

export interface GitHubApiParams {
  owner: string;
  repo: string;
  token: string;
  fetchImpl?: FetchLike;
}

async function githubApiRequest<T>(
  params: GitHubApiParams,
  path: string,
): Promise<T> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://api.github.com/repos/${params.owner}/${params.repo}${path}`,
    {
      headers: {
        Authorization: `Bearer ${params.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `GitHub API request failed (${response.status}): ${path}`,
    );
  }
  return (await response.json()) as T;
}

/** Every currently-open pull request on the repo (single page, up to 100). */
export async function fetchOpenPullRequests(
  params: GitHubApiParams,
): Promise<GitHubPullRequest[]> {
  return githubApiRequest<GitHubPullRequest[]>(
    params,
    "/pulls?state=open&per_page=100",
  );
}

/** Filenames changed by a single pull request (single page, up to 100). */
export async function fetchPullRequestFiles(
  params: GitHubApiParams,
  pullNumber: number,
): Promise<string[]> {
  const files = await githubApiRequest<GitHubPullRequestFile[]>(
    params,
    `/pulls/${pullNumber}/files?per_page=100`,
  );
  return files.map((file) => file.filename);
}

function toOpenPr(pr: GitHubPullRequest): OpenPr {
  return { number: pr.number, state: "open", updated_at: pr.updated_at };
}

/**
 * Maps each given feature id to the open PRs touching its
 * `docs/features/<id>.md` file — the heuristic for "in-progress work not
 * yet merged to develop" from PRD.md §5.3 ("the worker must read open PR
 * state, not just merged state, or days without merges will look empty").
 */
export async function enrichOpenPrsByFeature(
  params: GitHubApiParams,
  featureIds: string[],
): Promise<Record<string, OpenPr[]>> {
  const result: Record<string, OpenPr[]> = Object.fromEntries(
    featureIds.map((id) => [id, []]),
  );
  const featureFileById = new Map(
    featureIds.map((id) => [`docs/features/${id}.md`, id]),
  );

  const openPrs = await fetchOpenPullRequests(params);
  for (const pr of openPrs) {
    const changedFiles = await fetchPullRequestFiles(params, pr.number);
    for (const filename of changedFiles) {
      const featureId = featureFileById.get(filename);
      if (featureId) {
        result[featureId].push(toOpenPr(pr));
      }
    }
  }

  return result;
}

const DEFAULT_STAGING_BRANCH = "staging";
const DEFAULT_PRODUCTION_BRANCH_CANDIDATES = ["main", "master"];

export interface EnvironmentBranches {
  staging?: string;
  production?: string;
}

/**
 * Is `commitSha` an ancestor of (or equal to) `branch`'s tip? Compares
 * `sha...branch`, per the GitHub compare API's base/head semantics: `branch`
 * is ahead of (or identical to) `sha` exactly when `sha` has already reached
 * it. Returns `null`, not `false`, when `branch` doesn't exist — the caller
 * needs to tell "not shipped yet" apart from "can't tell" (AC-006).
 */
async function isCommitInBranch(
  params: GitHubApiParams,
  commitSha: string,
  branch: string,
): Promise<boolean | null> {
  try {
    const result = await githubApiRequest<{ status: string }>(
      params,
      `/compare/${commitSha}...${branch}`,
    );
    return result.status === "identical" || result.status === "ahead";
  } catch (error) {
    if (error instanceof Error && error.message.includes("(404)")) {
      return null;
    }
    throw error;
  }
}

/**
 * docs/features/feature-environment-tracking.md — the furthest environment
 * `commitSha` has reached, via ancestry against the staging/production branch
 * tips (never by re-parsing `docs/features/` off those branches). Checks
 * production first since it's the furthest signal. `branches.production`
 * defaults to `main`, falling back to `master` if `main` doesn't exist
 * (AC-003); `branches.staging` defaults to `staging`. Returns `null` only
 * when neither branch could be resolved at all (AC-006) — a resolvable
 * branch that the commit simply hasn't reached yet yields `"develop"`.
 */
export async function resolveEnvironment(
  params: GitHubApiParams,
  commitSha: string,
  branches: EnvironmentBranches = {},
): Promise<Environment | null> {
  const productionCandidates = branches.production
    ? [branches.production]
    : DEFAULT_PRODUCTION_BRANCH_CANDIDATES;

  let inProduction: boolean | null = null;
  for (const candidate of productionCandidates) {
    inProduction = await isCommitInBranch(params, commitSha, candidate);
    if (inProduction !== null) break;
  }

  const inStaging = await isCommitInBranch(
    params,
    commitSha,
    branches.staging ?? DEFAULT_STAGING_BRANCH,
  );

  if (inProduction) return "production";
  if (inStaging) return "staging";
  if (inProduction === null && inStaging === null) return null;
  return "develop";
}
