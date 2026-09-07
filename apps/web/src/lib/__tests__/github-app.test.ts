import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  featuresFolderExists,
  githubAppSlug,
  githubAuthorizeUrl,
  listUserInstallations,
  repoFileExists,
  scaffoldFeaturesFolderAsPullRequest,
} from "../github-app.js";

describe("githubAuthorizeUrl", () => {
  const originalClientId = process.env.GITHUB_APP_CLIENT_ID;

  beforeEach(() => {
    process.env.GITHUB_APP_CLIENT_ID = "test-client-id";
  });

  afterEach(() => {
    process.env.GITHUB_APP_CLIENT_ID = originalClientId;
  });

  it("builds a GitHub authorize URL with client_id, redirect_uri, and state", () => {
    const url = new URL(
      githubAuthorizeUrl({
        redirectUri: "https://example.com/api/auth/github/callback",
        state: "abc123",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://example.com/api/auth/github/callback",
    );
    expect(url.searchParams.get("state")).toBe("abc123");
  });
});

describe("githubAppSlug", () => {
  const originalSlug = process.env.GITHUB_APP_SLUG;

  afterEach(() => {
    process.env.GITHUB_APP_SLUG = originalSlug;
  });

  it("throws when GITHUB_APP_SLUG is not set", () => {
    delete process.env.GITHUB_APP_SLUG;
    expect(() => githubAppSlug()).toThrow("GITHUB_APP_SLUG is not set");
  });

  it("returns the configured slug", () => {
    process.env.GITHUB_APP_SLUG = "isidore-dev";
    expect(githubAppSlug()).toBe("isidore-dev");
  });
});

describe("listUserInstallations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps every installation to its id and account login, spanning accounts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          installations: [
            { id: 111, account: { login: "acme-org" } },
            { id: 222, account: { login: "earlrodson" } },
          ],
        }),
      }),
    );

    expect(await listUserInstallations("token")).toEqual([
      { installationId: "111", accountLogin: "acme-org" },
      { installationId: "222", accountLogin: "earlrodson" },
    ]);
  });

  it("throws when GitHub returns a non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(listUserInstallations("token")).rejects.toThrow("401");
  });
});

describe("repoFileExists", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false on a 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(
      await repoFileExists("token", {
        owner: "acme",
        repo: "widgets",
        filePath: ".github/workflows/isidore-worker.yml",
      }),
    ).toBe(false);
  });

  it("returns true when the file is found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    expect(
      await repoFileExists("token", {
        owner: "acme",
        repo: "widgets",
        filePath: ".github/workflows/isidore-worker.yml",
      }),
    ).toBe(true);
  });
});

describe("featuresFolderExists", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false on a 404 (folder not scaffolded yet)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(
      await featuresFolderExists("token", { owner: "acme", repo: "widgets", path: "docs/specifications" }),
    ).toBe(false);
  });

  it("returns true when GUIDELINES.md is found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    expect(
      await featuresFolderExists("token", { owner: "acme", repo: "widgets", path: "docs/specifications" }),
    ).toBe(true);
  });

  it("throws on an unexpected error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(
      featuresFolderExists("token", { owner: "acme", repo: "widgets", path: "docs/specifications" }),
    ).rejects.toThrow("500");
  });
});

describe("scaffoldFeaturesFolderAsPullRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surfaces an actionable error when the workflow file commit 403s", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        // repo lookup (default branch)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ default_branch: "main" }) })
        // ref lookup (head sha)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ object: { sha: "abc123" } }) })
        // branch create
        .mockResolvedValueOnce({ ok: true })
        // workflow file commit
        .mockResolvedValueOnce({ ok: false, status: 403 }),
    );

    await expect(
      scaffoldFeaturesFolderAsPullRequest("token", {
        owner: "acme",
        repo: "widgets",
        path: "docs/specifications",
        files: [],
        extraFiles: [{ path: ".github/workflows/isidore-worker.yml", content: "on: push" }],
      }),
    ).rejects.toThrow(/Workflows.*repository permission/);
  });
});
