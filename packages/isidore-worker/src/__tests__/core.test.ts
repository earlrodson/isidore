import { describe, expect, it, vi } from "vitest";
import { buildSnapshot, runWorker } from "../core.js";

const featureFileContent = `---
schema_version: 1
id: auth-refresh
title: Refresh token rotation
type: feature
status: in-progress
priority: high
prd_ref: docs/PRD.md#4.2
owners: [dev-a]
estimate_hours: 8
hours_logged: 0
created: 2026-08-01
updated: 2026-08-18
---

## Description
Test feature.

## Acceptance criteria
- [ ] works

## Todos
- [x] Rotate on use (@dev-a, est 2h, due 2026-08-10, done 2026-08-09)
- [ ] Revoke on reuse (@dev-a, est 3h, due 2026-08-20)

## Daily log
- 2026-08-01 (@dev-a, 0h): item created
- 2026-08-09 (@dev-a, 5.5h): rotated on use

## Links
- PR:
- Branch:
`;

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const baseParams = {
  provider: "github" as const,
  repoId: "acme/project-1",
  project: "project-1",
  baseBranch: "develop",
  timezone: "Asia/Manila",
  featuresDir: "docs/features",
  owner: "acme",
  repo: "project-1",
  githubToken: "gh-token",
  now: () => 1_755_500_000_000,
  loadFeatures: () => [{ filename: "auth-refresh.md", content: featureFileContent }],
  fetchImpl: vi.fn().mockResolvedValue(jsonResponse([])),
};

describe("buildSnapshot", () => {
  it("assembles a valid IngestPayload from parsed features + git enrichment", async () => {
    const payload = await buildSnapshot({ ...baseParams, cwd: process.cwd() });

    expect(payload.repo_id).toBe("acme/project-1");
    expect(payload.week).toMatch(/^\d{4}-W\d{2}$/);
    expect(payload.commit_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(payload.features).toHaveLength(1);

    const feature = payload.features[0];
    expect(feature.feature_id).toBe("auth-refresh");
    expect(feature.hours_logged).toBe(5.5);
    expect(feature.todos).toEqual([
      { todo_id: "t1", title: "Rotate on use", done: true, owner: "dev-a", estimate_hours: 2, due: "2026-08-10" },
      { todo_id: "t2", title: "Revoke on reuse", done: false, owner: "dev-a", estimate_hours: 3, due: "2026-08-20" },
    ]);
    expect(feature.open_prs).toEqual([]);
    expect(feature.prd_ref).toBe("docs/PRD.md#4.2");
  });

  it("falls back to a placeholder prd_ref when the frontmatter omits it (GUIDELINES.md allows omission)", async () => {
    const withoutPrdRef = featureFileContent.replace("prd_ref: docs/PRD.md#4.2\n", "");
    const payload = await buildSnapshot({
      ...baseParams,
      cwd: process.cwd(),
      loadFeatures: () => [{ filename: "auth-refresh.md", content: withoutPrdRef }],
    });
    expect(payload.features[0].prd_ref).toBe("unspecified");
  });

  it("attaches the resolved environment to every feature (feature-environment-tracking AC-001)", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/compare/")) {
        const branch = url.split("...")[1];
        return jsonResponse({ status: branch === "main" ? "identical" : "behind" });
      }
      return jsonResponse([]);
    });

    const payload = await buildSnapshot({ ...baseParams, cwd: process.cwd(), fetchImpl });
    expect(payload.features[0].environment).toBe("production");
  });

  it("throws a descriptive error when a feature file fails to parse", async () => {
    await expect(
      buildSnapshot({
        ...baseParams,
        cwd: process.cwd(),
        loadFeatures: () => [{ filename: "broken.md", content: "not a feature file" }],
      }),
    ).rejects.toThrow(/Failed to parse broken\.md/);
  });
});

describe("runWorker", () => {
  it("builds, signs, and posts the snapshot", async () => {
    const postFetch = vi.fn().mockResolvedValue(jsonResponse({ status: "ok" }));

    const result = await runWorker({
      ...baseParams,
      cwd: process.cwd(),
      endpoint: "https://isidore.example/api/ingest",
      secret: "shh-secret",
      nonce: () => "fixed-nonce",
      fetchImpl: vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.startsWith("https://api.github.com")) return jsonResponse([]);
        return postFetch(url, init);
      }),
    });

    expect(result.status).toBe(200);
    expect(result.attempts).toBe(1);
    expect(result.payload.repo_id).toBe("acme/project-1");
    expect(postFetch).toHaveBeenCalledWith(
      "https://isidore.example/api/ingest",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-isidore-nonce": "fixed-nonce" }),
      }),
    );
  });
});
