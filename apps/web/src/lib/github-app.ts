const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";

export function githubAppClientId(): string {
  const id = process.env.GITHUB_APP_CLIENT_ID;
  if (!id) throw new Error("GITHUB_APP_CLIENT_ID is not set");
  return id;
}

function githubAppClientSecret(): string {
  const secret = process.env.GITHUB_APP_CLIENT_SECRET;
  if (!secret) throw new Error("GITHUB_APP_CLIENT_SECRET is not set");
  return secret;
}

/** The GitHub App's own slug, e.g. "isidore-dev" — used to build the
 * installation URL (`https://github.com/apps/<slug>/installations/new`). */
export function githubAppSlug(): string {
  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) throw new Error("GITHUB_APP_SLUG is not set");
  return slug;
}

export function githubAuthorizeUrl({
  redirectUri,
  state,
}: {
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", githubAppClientId());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export interface GithubTokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}

/** Exchanges an OAuth `code` for a user-to-server access token
 * (docs/features/onboarding-oauth.md AC-001 — GitHub App login uses the
 * same authorize/callback code exchange as a classic OAuth App). */
export async function exchangeCodeForToken({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}): Promise<GithubTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: githubAppClientId(),
      client_secret: githubAppClientSecret(),
      code,
      redirect_uri: redirectUri,
    }),
  });

  const body = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !body.access_token) {
    throw new Error(
      `GitHub token exchange failed: ${body.error ?? response.status} ${body.error_description ?? ""}`.trim(),
    );
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000) : null,
  };
}

export interface GithubUser {
  id: number;
  login: string;
  avatarUrl: string | null;
}

export async function fetchGithubUser(accessToken: string): Promise<GithubUser> {
  const response = await fetch(USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub /user failed: ${response.status}`);
  }

  const body = (await response.json()) as { id: number; login: string; avatar_url?: string };
  return { id: body.id, login: body.login, avatarUrl: body.avatar_url ?? null };
}

export interface GithubInstallation {
  installationId: string;
  accountLogin: string;
}

/** Every GitHub App installation the logged-in user can act as — spans all
 * of their accounts/orgs (docs/features/onboarding-oauth.md AC-002), not
 * just the one they most recently installed. */
export async function listUserInstallations(accessToken: string): Promise<GithubInstallation[]> {
  const response = await fetch("https://api.github.com/user/installations", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub /user/installations failed: ${response.status}`);
  }

  const body = (await response.json()) as {
    installations: Array<{ id: number; account: { login: string } }>;
  };
  return body.installations.map((installation) => ({
    installationId: String(installation.id),
    accountLogin: installation.account.login,
  }));
}

export interface GithubInstallationRepo {
  id: number;
  fullName: string;
}

/** Repos granted to a GitHub App installation (AC-002) — not a browse of
 * everything the user can see, only what this installation was scoped to. */
export async function listInstallationRepos(
  accessToken: string,
  installationId: string,
): Promise<GithubInstallationRepo[]> {
  const response = await fetch(
    `https://api.github.com/user/installations/${installationId}/repositories`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub installation repositories failed: ${response.status}`);
  }

  const body = (await response.json()) as {
    repositories: Array<{ id: number; full_name: string }>;
  };
  return body.repositories.map((repo) => ({ id: repo.id, fullName: repo.full_name }));
}

function githubHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
  };
}

/** True if `GUIDELINES.md` already exists under `path` on the repo's
 * default branch — mirrors `FeaturesFolderExistsError`'s own existence
 * check in packages/isidore-worker/src/scaffold.ts, just against a remote
 * repo instead of the local filesystem (AC-003). */
export async function featuresFolderExists(
  accessToken: string,
  { owner, repo, path }: { owner: string; repo: string; path: string },
): Promise<boolean> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}/GUIDELINES.md`,
    { headers: githubHeaders(accessToken) },
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`GitHub contents check failed: ${response.status}`);
  }
  return true;
}

async function defaultBranchHeadSha(
  accessToken: string,
  { owner, repo }: { owner: string; repo: string },
): Promise<{ defaultBranch: string; sha: string }> {
  const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: githubHeaders(accessToken),
  });
  if (!repoResponse.ok) {
    throw new Error(`GitHub repo lookup failed: ${repoResponse.status}`);
  }
  const { default_branch: defaultBranch } = (await repoResponse.json()) as {
    default_branch: string;
  };

  const refResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`,
    { headers: githubHeaders(accessToken) },
  );
  if (!refResponse.ok) {
    throw new Error(`GitHub ref lookup failed: ${refResponse.status}`);
  }
  const { object } = (await refResponse.json()) as { object: { sha: string } };

  return { defaultBranch, sha: object.sha };
}

/**
 * Scaffolds `docs/features/` on a fresh branch and opens a PR for the user
 * to merge themselves, rather than committing straight to the default
 * branch — per the risk noted in
 * docs/features/onboarding-oauth.md ("this needs OAuth scope wide enough
 * to create a branch/commit/PR... should probably land as a PR the user
 * still merges themselves, not a direct commit").
 */
export async function scaffoldFeaturesFolderAsPullRequest(
  accessToken: string,
  {
    owner,
    repo,
    path,
    files,
  }: {
    owner: string;
    repo: string;
    path: string;
    files: Array<{ filename: string; content: string }>;
  },
): Promise<{ pullRequestUrl: string }> {
  const { defaultBranch, sha } = await defaultBranchHeadSha(accessToken, { owner, repo });
  const branch = `isidore-onboarding/scaffold-features-${Date.now()}`;

  const branchResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: { ...githubHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });
  if (!branchResponse.ok) {
    throw new Error(`GitHub branch creation failed: ${branchResponse.status}`);
  }

  for (const file of files) {
    const filePath = `${path}/${file.filename}`;
    const commitResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: "PUT",
        headers: { ...githubHeaders(accessToken), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Scaffold ${filePath} (isidore onboarding)`,
          content: Buffer.from(file.content, "utf-8").toString("base64"),
          branch,
        }),
      },
    );
    if (!commitResponse.ok) {
      throw new Error(`GitHub commit of ${filePath} failed: ${commitResponse.status}`);
    }
  }

  const prResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: { ...githubHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `Scaffold ${path}/`,
      head: branch,
      base: defaultBranch,
      body: "Adds the canonical isidore docs/features/ guardrail files (GUIDELINES.md + templates), generated by isidore onboarding.",
    }),
  });
  if (!prResponse.ok) {
    throw new Error(`GitHub PR creation failed: ${prResponse.status}`);
  }
  const { html_url: pullRequestUrl } = (await prResponse.json()) as { html_url: string };

  return { pullRequestUrl };
}
