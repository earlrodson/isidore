import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enrichOpenPrsByFeature,
  fetchOpenPullRequests,
  fetchPullRequestFiles,
  getHeadCommitSha,
} from "../git.js";

describe("getHeadCommitSha", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), "isidore-worker-git-"));
    execFileSync("git", ["init", "-q"], { cwd: repoDir });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: repoDir,
    });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: repoDir });
    execFileSync("git", ["commit", "--allow-empty", "-q", "-m", "init"], {
      cwd: repoDir,
    });
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("returns the current checkout's HEAD commit sha", () => {
    const expected = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoDir,
    })
      .toString()
      .trim();

    expect(getHeadCommitSha(repoDir)).toBe(expected);
    expect(getHeadCommitSha(repoDir)).toMatch(/^[0-9a-f]{40}$/);
  });
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("fetchOpenPullRequests", () => {
  it("requests the open-PR list with auth headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));

    await fetchOpenPullRequests({
      owner: "acme",
      repo: "project-1",
      token: "secret-token",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/project-1/pulls?state=open&per_page=100",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
        }),
      }),
    );
  });

  it("throws when the GitHub API responds with an error status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 401));

    await expect(
      fetchOpenPullRequests({
        owner: "acme",
        repo: "project-1",
        token: "bad-token",
        fetchImpl,
      }),
    ).rejects.toThrow(/401/);
  });
});

describe("fetchPullRequestFiles", () => {
  it("returns just the changed filenames", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        { filename: "docs/features/auth-refresh.md" },
        { filename: "src/auth.ts" },
      ]),
    );

    const files = await fetchPullRequestFiles(
      { owner: "acme", repo: "project-1", token: "t", fetchImpl },
      412,
    );

    expect(files).toEqual([
      "docs/features/auth-refresh.md",
      "src/auth.ts",
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/project-1/pulls/412/files?per_page=100",
      expect.anything(),
    );
  });
});

describe("enrichOpenPrsByFeature", () => {
  it("maps open PRs to the feature ids whose file they touch", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/pulls?state=open&per_page=100")) {
        return jsonResponse([
          { number: 412, state: "open", merged_at: null, updated_at: "2026-08-18T02:11:00Z" },
          { number: 413, state: "open", merged_at: null, updated_at: "2026-08-18T03:00:00Z" },
        ]);
      }
      if (url.endsWith("/pulls/412/files?per_page=100")) {
        return jsonResponse([
          { filename: "docs/features/auth-refresh.md" },
          { filename: "src/auth.ts" },
        ]);
      }
      if (url.endsWith("/pulls/413/files?per_page=100")) {
        return jsonResponse([{ filename: "src/unrelated.ts" }]);
      }
      throw new Error(`unexpected request: ${url}`);
    });

    const result = await enrichOpenPrsByFeature(
      { owner: "acme", repo: "project-1", token: "t", fetchImpl },
      ["auth-refresh", "billing-export"],
    );

    expect(result["auth-refresh"]).toEqual([
      { number: 412, state: "open", updated_at: "2026-08-18T02:11:00Z" },
    ]);
    expect(result["billing-export"]).toEqual([]);
  });

  it("returns an empty array per feature when there are no open PRs", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));

    const result = await enrichOpenPrsByFeature(
      { owner: "acme", repo: "project-1", token: "t", fetchImpl },
      ["auth-refresh"],
    );

    expect(result).toEqual({ "auth-refresh": [] });
  });
});
