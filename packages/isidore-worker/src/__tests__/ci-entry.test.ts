import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runWorker = vi.fn();
vi.mock("../core.js", () => ({ runWorker }));

const runEnvironmentPing = vi.fn();
vi.mock("../environment-ping.js", () => ({ runEnvironmentPing }));

const originalEnv = { ...process.env };

function setEnv(vars: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const requiredEnv = {
  GITHUB_REPOSITORY: "acme/project-1",
  GITHUB_TOKEN: "gh-token",
  ISIDORE_INGEST_ENDPOINT: "https://isidore.example/api/ingest",
  ISIDORE_HMAC_SECRET: "shh-secret",
};

describe("ci-entry main", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    runWorker.mockReset();
    runEnvironmentPing.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("maps required env vars and applies defaults for optional ones", async () => {
    setEnv(requiredEnv);
    runWorker.mockResolvedValue({
      status: 200,
      attempts: 1,
      payload: { repo_id: "acme/project-1", features: [] },
    });

    const { main } = await import("../ci-entry.js");
    await main();

    expect(runWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "github",
        repoId: "acme/project-1",
        project: "project-1",
        baseBranch: "develop",
        timezone: "UTC",
        featuresDir: "docs/specifications",
        owner: "acme",
        repo: "project-1",
        githubToken: "gh-token",
        endpoint: "https://isidore.example/api/ingest",
        secret: "shh-secret",
      }),
    );
    expect(runEnvironmentPing).not.toHaveBeenCalled();
  });

  it("honors ISIDORE_* overrides instead of the derived defaults", async () => {
    setEnv({
      ...requiredEnv,
      ISIDORE_PROVIDER: "gitlab",
      ISIDORE_REPO_ID: "custom-repo-id",
      ISIDORE_PROJECT: "custom-project",
      ISIDORE_BASE_BRANCH: "main",
      ISIDORE_TIMEZONE: "Asia/Manila",
      ISIDORE_FEATURES_DIR: "custom/features",
      ISIDORE_STAGING_BRANCH: "stage",
      ISIDORE_PRODUCTION_BRANCH: "release",
    });
    runWorker.mockResolvedValue({
      status: 200,
      attempts: 1,
      payload: { repo_id: "custom-repo-id", features: [] },
    });

    const { main } = await import("../ci-entry.js");
    await main();

    expect(runWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "gitlab",
        repoId: "custom-repo-id",
        project: "custom-project",
        baseBranch: "main",
        timezone: "Asia/Manila",
        featuresDir: "custom/features",
      }),
    );
  });

  it("throws a descriptive error when a required env var is missing", async () => {
    setEnv({ ...requiredEnv, GITHUB_TOKEN: undefined });

    const { main } = await import("../ci-entry.js");
    await expect(main()).rejects.toThrow(
      "Missing required environment variable: GITHUB_TOKEN",
    );
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("runs an environment ping instead of runWorker when GITHUB_REF_NAME matches the staging branch (feature-environment-tracking AC-007/008)", async () => {
    setEnv({ ...requiredEnv, GITHUB_REF_NAME: "staging" });
    runEnvironmentPing.mockResolvedValue({
      status: 200,
      attempts: 1,
      payload: { repo_id: "acme/project-1", feature_ids: ["a", "b"] },
    });

    const { main } = await import("../ci-entry.js");
    await main();

    expect(runEnvironmentPing).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "github",
        repoId: "acme/project-1",
        environment: "staging",
        featuresDir: "docs/specifications",
        endpoint: "https://isidore.example/api/ingest",
        secret: "shh-secret",
      }),
    );
    expect(runWorker).not.toHaveBeenCalled();
    // GITHUB_TOKEN is required for the snapshot path (PR enrichment) but
    // not the ping path — main() must not demand it for a staging push.
  });

  it("runs an environment ping tagged production when GITHUB_REF_NAME matches the production branch", async () => {
    setEnv({ ...requiredEnv, GITHUB_REF_NAME: "main" });
    runEnvironmentPing.mockResolvedValue({
      status: 200,
      attempts: 1,
      payload: { repo_id: "acme/project-1", feature_ids: [] },
    });

    const { main } = await import("../ci-entry.js");
    await main();

    expect(runEnvironmentPing).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "production" }),
    );
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("honors ISIDORE_STAGING_BRANCH/ISIDORE_PRODUCTION_BRANCH overrides when dispatching", async () => {
    setEnv({
      ...requiredEnv,
      GITHUB_REF_NAME: "release",
      ISIDORE_PRODUCTION_BRANCH: "release",
    });
    runEnvironmentPing.mockResolvedValue({
      status: 200,
      attempts: 1,
      payload: { repo_id: "acme/project-1", feature_ids: [] },
    });

    const { main } = await import("../ci-entry.js");
    await main();

    expect(runEnvironmentPing).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "production" }),
    );
  });

  it("falls through to runWorker when GITHUB_REF_NAME is unset (local/manual invocation)", async () => {
    setEnv({ ...requiredEnv, GITHUB_REF_NAME: undefined });
    runWorker.mockResolvedValue({
      status: 200,
      attempts: 1,
      payload: { repo_id: "acme/project-1", features: [] },
    });

    const { main } = await import("../ci-entry.js");
    await main();

    expect(runWorker).toHaveBeenCalled();
    expect(runEnvironmentPing).not.toHaveBeenCalled();
  });
});
