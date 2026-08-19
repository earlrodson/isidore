import { execFileSync } from "node:child_process";
import type { OpenPr } from "@isidore/shared";

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
