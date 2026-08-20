import { upsertRepoSecret } from "@isidore/db";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { generateRepoSecret } from "@/lib/repo-secret";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** AC-004/AC-007: generates (or rotates) the per-repo ingest HMAC secret and
 * renders it exactly once in the response body — never via a redirect/query
 * param, since those land in browser history and server logs. Re-submitting
 * this form rotates the secret (upsertRepoSecret overwrites on conflict). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/api/auth/github/login", request.url));
  }

  const form = await request.formData();
  const owner = form.get("owner");
  const repo = form.get("repo");

  if (typeof owner !== "string" || typeof repo !== "string" || !owner || !repo) {
    return NextResponse.json({ error: "owner and repo are required" }, { status: 400 });
  }

  const repoId = `${owner}/${repo}`;
  const secret = generateRepoSecret();

  await upsertRepoSecret(getDb(), { provider: "github", repoId, secret });

  const safeRepoId = escapeHtml(repoId);
  const safeSecret = escapeHtml(secret);

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Ingest secret for ${safeRepoId}</title></head>
<body>
<h1>Ingest secret for ${safeRepoId}</h1>
<p>This secret is shown once and cannot be retrieved again. Store it now as <code>ISIDORE_HMAC_SECRET</code>.</p>
<pre>${safeSecret}</pre>
<p>Submitting the generation form again will rotate this secret, invalidating the one above.</p>
<p><a href="/onboarding">Back to onboarding</a></p>
</body>
</html>`;

  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
