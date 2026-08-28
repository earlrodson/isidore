import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOAuthAccessToken } from "@isidore/db";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { buildGithubActionsWorkflow } from "@/lib/ci-snippet";
import { listInstallationRepos, listUserInstallations } from "@/lib/github-app";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export const dynamic = "force-dynamic";

function StepHeading({
  step,
  title,
  optional,
}: {
  step: number;
  title: string;
  optional?: boolean;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {step}
      </span>
      <span className="text-sm font-medium">{title}</span>
      {optional && <span className="text-xs text-muted-foreground">(optional)</span>}
    </div>
  );
}

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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Connect a repo</h1>
      <p className="mb-6 text-sm text-muted-foreground">Signed in as {user.login}.</p>

      <div className="mb-6 flex flex-col gap-3">
        {params.pr && (
          <Alert variant="success">
            <AlertDescription>
              Scaffold PR opened:{" "}
              <a href={params.pr} className="font-medium underline">
                {params.pr}
              </a>
            </AlertDescription>
          </Alert>
        )}
        {params.scaffolded === "exists" && (
          <Alert>
            <AlertDescription>docs/specifications/ already exists in that repo.</AlertDescription>
          </Alert>
        )}
        {params.error && (
          <Alert variant="destructive">
            <AlertDescription>Error: {params.error}</AlertDescription>
          </Alert>
        )}
      </div>

      <Button asChild variant="outline" className="mb-8">
        <Link href="/api/auth/github/install">Connect another GitHub account</Link>
      </Button>

      {installations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No GitHub App installations connected yet.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {installations.map((installation, index) => (
            <Card key={installation.installationId}>
              <CardHeader>
                <CardTitle>{installation.accountLogin}</CardTitle>
              </CardHeader>
              <CardContent>
                {reposByInstallation[index].length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No repositories granted to this installation.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-6">
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
                        <li key={repo.id} className="rounded-md border border-border p-4">
                          <p className="mb-4 font-medium">{repo.fullName}</p>

                          <div className="flex flex-col gap-5">
                            <div>
                              <StepHeading step={1} title="Configure branch names" optional />
                              <p className="mb-2 text-xs text-muted-foreground">
                                Defaults to staging/main. Set this before step 2 if your repo uses
                                different branch names — it&apos;s baked into the CI workflow that
                                step 2 generates.
                              </p>
                              <form method="GET" className="flex flex-wrap items-end gap-2">
                                <input type="hidden" name="configuredOwner" value={owner} />
                                <input type="hidden" name="configuredRepo" value={repoName} />
                                <div className="flex flex-col gap-1">
                                  <Label htmlFor={`staging-${repo.id}`}>Staging branch</Label>
                                  <Input
                                    id={`staging-${repo.id}`}
                                    type="text"
                                    name="stagingBranch"
                                    placeholder="staging"
                                    defaultValue={isConfiguredRepo ? params.stagingBranch : undefined}
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <Label htmlFor={`production-${repo.id}`}>Production branch</Label>
                                  <Input
                                    id={`production-${repo.id}`}
                                    type="text"
                                    name="productionBranch"
                                    placeholder="main"
                                    defaultValue={isConfiguredRepo ? params.productionBranch : undefined}
                                  />
                                </div>
                                <Button type="submit" variant="outline" size="sm">
                                  Update CI snippet branch names
                                </Button>
                              </form>
                            </div>

                            <div>
                              <StepHeading
                                step={2}
                                title="Scaffold docs/specifications/ + CI workflow"
                              />
                              <p className="mb-2 text-xs text-muted-foreground">
                                Opens a PR with the docs/specifications/ guardrail files, plus
                                .github/workflows/isidore-worker.yml if your repo doesn&apos;t
                                already have one.
                              </p>
                              <form
                                action="/api/onboarding/scaffold"
                                method="POST"
                                className="flex flex-wrap items-end gap-2"
                              >
                                <input type="hidden" name="owner" value={owner} />
                                <input type="hidden" name="repo" value={repoName} />
                                <input
                                  type="hidden"
                                  name="stagingBranch"
                                  value={isConfiguredRepo ? (params.stagingBranch ?? "") : ""}
                                />
                                <input
                                  type="hidden"
                                  name="productionBranch"
                                  value={isConfiguredRepo ? (params.productionBranch ?? "") : ""}
                                />
                                <div className="flex flex-col gap-1">
                                  <Label htmlFor={`path-${repo.id}`}>Folder</Label>
                                  <Input
                                    id={`path-${repo.id}`}
                                    type="text"
                                    name="path"
                                    defaultValue="docs/specifications"
                                  />
                                </div>
                                <Button type="submit" size="sm">
                                  Scaffold docs/specifications/
                                </Button>
                              </form>
                            </div>

                            <div>
                              <StepHeading step={3} title="Generate an ingest secret" />
                              <form action="/api/onboarding/secret" method="POST" className="flex items-end">
                                <input type="hidden" name="owner" value={owner} />
                                <input type="hidden" name="repo" value={repoName} />
                                <Button type="submit" variant="secondary" size="sm">
                                  Generate/rotate ingest secret
                                </Button>
                              </form>
                            </div>

                            <div>
                              <StepHeading step={4} title="Add the secret, then merge the PR" />
                              <Collapsible>
                                <CollapsibleTrigger asChild>
                                  <Button type="button" variant="ghost" size="sm">
                                    CI snippet (.github/workflows/isidore-worker.yml)
                                  </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <p className="mt-2 text-sm text-muted-foreground">
                                    For reference — step 2 already commits this to the PR when the
                                    repo doesn&apos;t have it yet, so you shouldn&apos;t need to paste
                                    it in by hand. Still builds isidore-worker from source in your
                                    job — see AC-006 in docs/specifications/onboarding-oauth.md. Fill
                                    in the secret from step
                                    3 above as the <code>ISIDORE_HMAC_SECRET</code> repo secret. Leave the
                                    branch names in step 1 blank to use the worker&apos;s defaults
                                    (staging / main, falling back to master).
                                  </p>
                                  <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs">
                                    {snippet}
                                  </pre>
                                </CollapsibleContent>
                              </Collapsible>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
