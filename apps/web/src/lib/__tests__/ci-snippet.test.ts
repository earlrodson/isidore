import { afterEach, describe, expect, it } from "vitest";
import { buildGithubActionsWorkflow } from "../ci-snippet.js";

describe("buildGithubActionsWorkflow", () => {
  const originalSourceRepo = process.env.ISIDORE_SOURCE_REPO;

  afterEach(() => {
    if (originalSourceRepo === undefined) delete process.env.ISIDORE_SOURCE_REPO;
    else process.env.ISIDORE_SOURCE_REPO = originalSourceRepo;
  });

  it("pre-fills the ingest endpoint and secret placeholder", () => {
    const yaml = buildGithubActionsWorkflow({
      ingestEndpoint: "https://isidore.example.com/api/ingest",
    });

    expect(yaml).toContain("ISIDORE_INGEST_ENDPOINT: https://isidore.example.com/api/ingest");
    expect(yaml).toContain("ISIDORE_HMAC_SECRET: ${{ secrets.ISIDORE_HMAC_SECRET }}");
  });

  it("defaults featuresDir and baseBranch, honors overrides", () => {
    const defaults = buildGithubActionsWorkflow({ ingestEndpoint: "https://x/api/ingest" });
    expect(defaults).toContain("branches: [develop]");
    expect(defaults).toContain("ISIDORE_FEATURES_DIR: docs/features");

    const overridden = buildGithubActionsWorkflow({
      ingestEndpoint: "https://x/api/ingest",
      featuresDir: "features",
      baseBranch: "main",
    });
    expect(overridden).toContain("branches: [main]");
    expect(overridden).toContain("ISIDORE_FEATURES_DIR: features");
  });

  it("downloads the prebuilt tarball from a GitHub Release and runs it via npx — no checkout/build of isidore source", () => {
    const yaml = buildGithubActionsWorkflow({ ingestEndpoint: "https://x/api/ingest" });
    expect(yaml).toContain("gh release download --repo earlrodson/isidore --pattern 'isidore-worker-*.tgz'");
    expect(yaml).toContain('npx --yes --package="$TARBALL" isidore-worker-ci');
    expect(yaml).toContain("GH_TOKEN: ${{ github.token }}");
    expect(yaml).toContain("node-version: 22");
    expect(yaml).not.toContain("pnpm/action-setup");
    expect(yaml).not.toContain("checkout@v4\n        with:\n          repository:");
  });

  it("uses ISIDORE_SOURCE_REPO when set, falling back to earlrodson/isidore", () => {
    delete process.env.ISIDORE_SOURCE_REPO;
    expect(buildGithubActionsWorkflow({ ingestEndpoint: "https://x/api/ingest" })).toContain(
      "gh release download --repo earlrodson/isidore",
    );

    process.env.ISIDORE_SOURCE_REPO = "acme/isidore-fork";
    expect(buildGithubActionsWorkflow({ ingestEndpoint: "https://x/api/ingest" })).toContain(
      "gh release download --repo acme/isidore-fork",
    );
  });

  it("omits staging/production branch env vars by default, letting the worker fall back to its own defaults", () => {
    const yaml = buildGithubActionsWorkflow({ ingestEndpoint: "https://x/api/ingest" });
    expect(yaml).not.toContain("ISIDORE_STAGING_BRANCH");
    expect(yaml).not.toContain("ISIDORE_PRODUCTION_BRANCH");
  });

  it("bakes in staging/production branch overrides when the user provides them (feature-environment-tracking AC-003)", () => {
    const yaml = buildGithubActionsWorkflow({
      ingestEndpoint: "https://x/api/ingest",
      stagingBranch: "stage",
      productionBranch: "release",
    });
    expect(yaml).toContain("ISIDORE_STAGING_BRANCH: stage");
    expect(yaml).toContain("ISIDORE_PRODUCTION_BRANCH: release");
  });
});
