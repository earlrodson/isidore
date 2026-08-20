import { getOAuthAccessToken } from "@isidore/db";
import { readCanonicalTemplateFiles } from "@isidore/worker";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { featuresFolderExists, scaffoldFeaturesFolderAsPullRequest } from "@/lib/github-app";

/** AC-003: scaffolds docs/features/ on a new repo by reusing the same
 * canonical file source as `isi init`, committed via the GitHub API as a
 * PR the user merges themselves rather than a direct commit. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/api/auth/github/login", request.url));
  }

  const form = await request.formData();
  const owner = form.get("owner");
  const repo = form.get("repo");
  const path = form.get("path");

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
      return NextResponse.redirect(url);
    }

    const files = readCanonicalTemplateFiles();
    const { pullRequestUrl } = await scaffoldFeaturesFolderAsPullRequest(accessToken, {
      owner,
      repo,
      path: normalizedPath,
      files,
    });

    const url = new URL("/onboarding", request.url);
    url.searchParams.set("pr", pullRequestUrl);
    return NextResponse.redirect(url);
  } catch (error) {
    const url = new URL("/onboarding", request.url);
    url.searchParams.set("error", error instanceof Error ? error.message : "scaffold failed");
    return NextResponse.redirect(url);
  }
}
