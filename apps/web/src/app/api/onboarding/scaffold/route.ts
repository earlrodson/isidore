import { getOAuthAccessToken } from "@isidore/db";
import { readCanonicalTemplateFiles } from "@isidore/worker";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { buildGithubActionsWorkflow } from "@/lib/ci-snippet";
import { getDb } from "@/lib/db";
import {
  featuresFolderExists,
  repoFileExists,
  scaffoldFeaturesFolderAsPullRequest,
} from "@/lib/github-app";

const WORKFLOW_PATH = ".github/workflows/isidore-worker.yml";

/** AC-003: scaffolds docs/specifications/ on a new repo by reusing the same
 * canonical file source as `isi init`, committed via the GitHub API as a
 * PR the user merges themselves rather than a direct commit. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/api/auth/github/login", request.url), 303);
  }

  const form = await request.formData();
  const owner = form.get("owner");
  const repo = form.get("repo");
  const path = form.get("path");
  const stagingBranch = form.get("stagingBranch");
  const productionBranch = form.get("productionBranch");

  if (typeof owner !== "string" || typeof repo !== "string" || typeof path !== "string" || !path) {
    return NextResponse.json({ error: "owner, repo, and path are required" }, { status: 400 });
  }

  const db = getDb();
  const accessToken = await getOAuthAccessToken(db, { userId: user.userId, provider: "github" });
  if (!accessToken) {
    return NextResponse.json({ error: "no github access token on file" }, { status: 400 });
  }

  const normalizedPath = path.replace(/\/+$/, "");

  try {
    if (await featuresFolderExists(accessToken, { owner, repo, path: normalizedPath })) {
      const url = new URL("/onboarding", request.url);
      url.searchParams.set("scaffolded", "exists");
      url.searchParams.set("scaffoldOwner", owner);
      url.searchParams.set("scaffoldRepo", repo);
      return NextResponse.redirect(url, 303);
    }

    const files = readCanonicalTemplateFiles();

    // Bundle the CI workflow into the same PR when the repo doesn't already
    // have one — skip it otherwise so a manually-customized workflow is
    // never clobbered.
    const extraFiles = (await repoFileExists(accessToken, { owner, repo, filePath: WORKFLOW_PATH }))
      ? []
      : [
          {
            path: WORKFLOW_PATH,
            content: buildGithubActionsWorkflow({
              ingestEndpoint: new URL("/api/ingest", request.url).toString(),
              stagingBranch: typeof stagingBranch === "string" ? stagingBranch || undefined : undefined,
              productionBranch:
                typeof productionBranch === "string" ? productionBranch || undefined : undefined,
            }),
          },
        ];

    const { pullRequestUrl } = await scaffoldFeaturesFolderAsPullRequest(accessToken, {
      owner,
      repo,
      path: normalizedPath,
      files,
      extraFiles,
    });

    const url = new URL("/onboarding", request.url);
    url.searchParams.set("pr", pullRequestUrl);
    url.searchParams.set("scaffoldOwner", owner);
    url.searchParams.set("scaffoldRepo", repo);
    return NextResponse.redirect(url, 303);
  } catch (error) {
    const url = new URL("/onboarding", request.url);
    url.searchParams.set("error", error instanceof Error ? error.message : "scaffold failed");
    url.searchParams.set("scaffoldOwner", owner);
    url.searchParams.set("scaffoldRepo", repo);
    return NextResponse.redirect(url, 303);
  }
}
