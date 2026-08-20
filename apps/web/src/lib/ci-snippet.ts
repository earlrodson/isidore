const DEFAULT_SOURCE_REPO = "earlrodson/isidore";

export interface CiSnippetParams {
  ingestEndpoint: string;
  featuresDir?: string;
  baseBranch?: string;
  stagingBranch?: string;
  productionBranch?: string;
}

/**
 * AC-005/006: GitHub Actions workflow snippet that runs isidore-worker.
 * Downloads the prebuilt `isidore-worker` tarball from a GitHub Release
 * (`gh release download`) and runs it via `npx --package=<tarball>` — no
 * checkout of isidore's source, no monorepo build step in the consumer's
 * job. This is what resolves AC-006 (docs/features/onboarding-oauth.md);
 * see `packages/isidore-worker/scripts/prepare-release.mjs` for how the
 * tarball itself is assembled (esbuild-bundles `@isidore/shared` in, so
 * the published package has no `workspace:*` reference to resolve).
 * isidore's repo is public, so the job's own default `github.token`
 * (auto-provided, no new secret needed) is enough to read its Releases —
 * `gh`/the GitHub API allow public-repo read with any valid token
 * regardless of which repo it's actually scoped to. If isidore's repo
 * ever goes private, this step would need a PAT with `contents:read` on
 * it instead.
 */
export function buildGithubActionsWorkflow({
  ingestEndpoint,
  featuresDir = "docs/features",
  baseBranch = "develop",
  stagingBranch,
  productionBranch,
}: CiSnippetParams): string {
  const sourceRepo = process.env.ISIDORE_SOURCE_REPO ?? DEFAULT_SOURCE_REPO;
  // docs/features/feature-environment-tracking.md AC-003 — only emitted when
  // the user overrides them on /onboarding; unset lets the worker fall back
  // to its own defaults (staging / main-then-master).
  const environmentBranchEnv = [
    stagingBranch ? `          ISIDORE_STAGING_BRANCH: ${stagingBranch}\n` : "",
    productionBranch ? `          ISIDORE_PRODUCTION_BRANCH: ${productionBranch}\n` : "",
  ].join("");

  return `name: isidore-worker
on:
  push:
    branches: [${baseBranch}]
  workflow_dispatch: {}

jobs:
  push-snapshot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Download isidore-worker
        env:
          GH_TOKEN: \${{ github.token }}
        run: gh release download --repo ${sourceRepo} --pattern 'isidore-worker-*.tgz' --dir .

      - name: Push snapshot
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          ISIDORE_INGEST_ENDPOINT: ${ingestEndpoint}
          ISIDORE_HMAC_SECRET: \${{ secrets.ISIDORE_HMAC_SECRET }}
          ISIDORE_FEATURES_DIR: ${featuresDir}
${environmentBranchEnv}        run: |
          TARBALL=$(ls isidore-worker-*.tgz)
          npx --yes --package="$TARBALL" isidore-worker-ci
`;
}
