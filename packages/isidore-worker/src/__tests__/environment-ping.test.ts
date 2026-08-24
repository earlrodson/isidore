import { describe, expect, it, vi } from "vitest";
import { buildEnvironmentPing, runEnvironmentPing } from "../environment-ping.js";

const stagingCopy = `---
schema_version: 1
id: auth-refresh
title: Refresh token rotation (stale copy on staging)
type: feature
status: implementing
priority: high
owners: [dev-a]
estimate_hours: 999
hours_logged: 999
created: 2026-08-01
updated: 2026-08-18
---

## Description
This is staging's lagging copy — its plan fields must never be read.

## Todos
- [ ] whatever is on this branch is irrelevant (@dev-a, est 1h)
`;

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const baseParams = {
  provider: "github" as const,
  repoId: "acme/project-1",
  project: "project-1",
  environment: "staging" as const,
  timezone: "Asia/Manila",
  featuresDir: "docs/specifications",
  loadFeatures: () => [{ filename: "auth-refresh.md", content: stagingCopy }],
  now: () => new Date("2026-08-25T00:00:00Z").getTime(),
};

describe("buildEnvironmentPing", () => {
  it("extracts only frontmatter.id — never status/todos/estimate_hours/etc (AC-008)", () => {
    const payload = buildEnvironmentPing({ ...baseParams, cwd: process.cwd() });

    expect(payload.feature_ids).toEqual(["auth-refresh"]);
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("todos");
    expect(payload).not.toHaveProperty("estimate_hours");
  });

  it("tags the payload with the given environment and schema version", () => {
    const payload = buildEnvironmentPing({ ...baseParams, cwd: process.cwd(), environment: "production" });

    expect(payload.environment).toBe("production");
    expect(payload.environment_ping_schema_version).toBe("1.0");
  });

  it("throws a descriptive error when a spec file fails to parse", () => {
    expect(() =>
      buildEnvironmentPing({
        ...baseParams,
        cwd: process.cwd(),
        loadFeatures: () => [{ filename: "broken.md", content: "not frontmatter" }],
      }),
    ).toThrow(/Failed to parse broken\.md/);
  });
});

describe("runEnvironmentPing", () => {
  it("posts to <endpoint>/environment, never <endpoint> itself", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: "ok" }));

    const result = await runEnvironmentPing({
      ...baseParams,
      cwd: process.cwd(),
      endpoint: "https://isidore.example/api/ingest",
      secret: "shh",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://isidore.example/api/ingest/environment",
      expect.anything(),
    );
    expect(result.status).toBe(200);
    expect(result.payload.feature_ids).toEqual(["auth-refresh"]);
  });
});
