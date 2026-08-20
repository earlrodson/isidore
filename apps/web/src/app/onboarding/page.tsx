import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOAuthAccessToken } from "@isidore/db";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { buildGithubActionsWorkflow } from "@/lib/ci-snippet";
import { listInstallationRepos, listUserInstallations } from "@/lib/github-app";

export const dynamic = "force-dynamic";

interface OnboardingPageProps {
  searchParams: Promise<{
    scaffolded?: string;
    pr?: string;
    error?: string;
    configuredOwner?: string;
    configuredRepo?: string;
    stagingBranch?: string;
    productionBranch?: string;
  }>;
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/api/auth/github/login");
  }

  const params = await searchParams;
  const db = getDb();
  const accessToken = await getOAuthAccessToken(db, { userId: user.userId, provider: "github" });

  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  const ingestEndpoint = `${proto}://${host}/api/ingest`;
  const ciSnippet = buildGithubActionsWorkflow({ ingestEndpoint });

  // /user/installations is the source of truth for which accounts are
  // connected — reading it live (rather than only our own stored rows)
  // means an installation added on GitHub's side shows up here even before
  // its callback round-trip completes.
  const installations = accessToken ? await listUserInstallations(accessToken) : [];
  const reposByInstallation = accessToken
    ? await Promise.all(
        installations.map((installation) =>
          listInstallationRepos(accessToken, installation.installationId),
        ),
      )
    : [];

  return (
    <main>
      <h1>Connect a repo</h1>
      <p>Signed in as {user.login}.</p>

      {params.pr && (
        <p>
          Scaffold PR opened: <a href={params.pr}>{params.pr}</a>
        </p>
      )}
      {params.scaffolded === "exists" && <p>docs/features/ already exists in that repo.</p>}
      {params.error && <p>Error: {params.error}</p>}

      <p>
        <Link href="/api/auth/github/install">Connect another GitHub account</Link>
      </p>

      {installations.length === 0 ? (
        <p>No GitHub App installations connected yet.</p>
      ) : (
        installations.map((installation, index) => (
          <section key={installation.installationId}>
            <h2>{installation.accountLogin}</h2>
            {reposByInstallation[index].length === 0 ? (
              <p>No repositories granted to this installation.</p>
            ) : (
              <ul>
                {reposByInstallation[index].map((repo) => {
                  const [owner, repoName] = repo.fullName.split("/");
                  const isConfiguredRepo =
                    params.configuredOwner === owner && params.configuredRepo === repoName;
                  const snippet = isConfiguredRepo
                    ? buildGithubActionsWorkflow({
                        ingestEndpoint,
                        stagingBranch: params.stagingBranch || undefined,
                        productionBranch: params.productionBranch || undefined,
                      })
                    : ciSnippet;
                  return (
                    <li key={repo.id}>
                      {repo.fullName}
                      <form action="/api/onboarding/scaffold" method="POST">
                        <input type="hidden" name="owner" value={owner} />
                        <input type="hidden" name="repo" value={repoName} />
                        <label>
                          Folder{" "}
                          <input type="text" name="path" defaultValue="docs/features" />
                        </label>
                        <button type="submit">Scaffold docs/features/</button>
                      </form>
                      <form action="/api/onboarding/secret" method="POST">
                        <input type="hidden" name="owner" value={owner} />
                        <input type="hidden" name="repo" value={repoName} />
                        <button type="submit">Generate/rotate ingest secret</button>
                      </form>
                      <form method="GET">
                        <input type="hidden" name="configuredOwner" value={owner} />
                        <input type="hidden" name="configuredRepo" value={repoName} />
                        <label>
                          Staging branch{" "}
                          <input
                            type="text"
                            name="stagingBranch"
                            placeholder="staging"
                            defaultValue={isConfiguredRepo ? params.stagingBranch : undefined}
                          />
                        </label>
                        <label>
                          Production branch{" "}
                          <input
                            type="text"
                            name="productionBranch"
                            placeholder="main"
                            defaultValue={isConfiguredRepo ? params.productionBranch : undefined}
                          />
                        </label>
                        <button type="submit">Update CI snippet branch names</button>
                      </form>
                      <details>
                        <summary>CI snippet (.github/workflows/isidore-worker.yml)</summary>
                        <p>
                          Still builds isidore-worker from source in your job — see AC-006 in
                          docs/features/onboarding-oauth.md. Fill in the secret from the button
                          above as the <code>ISIDORE_HMAC_SECRET</code> repo secret. Leave the
                          branch names above blank to use the worker&apos;s defaults (staging /
                          main, falling back to master).
                        </p>
                        <pre>{snippet}</pre>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))
      )}
    </main>
  );
}
