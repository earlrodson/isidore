import { createSession, upsertUserFromOAuth } from "@isidore/db";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { exchangeCodeForToken, fetchGithubUser } from "@/lib/github-app";
import {
  generateSessionToken,
  hashSessionToken,
  sessionExpiry,
  setSessionCookie,
} from "@/lib/session";

const STATE_COOKIE = "isidore_oauth_state";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: "invalid oauth state" }, { status: 400 });
  }

  const redirectUri = new URL("/api/auth/github/callback", request.url).toString();
  const token = await exchangeCodeForToken({ code, redirectUri });
  const githubUser = await fetchGithubUser(token.accessToken);

  const db = getDb();
  const { userId } = await upsertUserFromOAuth(db, {
    provider: "github",
    providerAccountId: String(githubUser.id),
    login: githubUser.login,
    avatarUrl: githubUser.avatarUrl,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    accessTokenExpiresAt: token.expiresAt,
  });

  const sessionToken = generateSessionToken();
  await createSession(db, {
    userId,
    tokenHash: hashSessionToken(sessionToken),
    expiresAt: sessionExpiry(),
  });
  await setSessionCookie(sessionToken);

  return NextResponse.redirect(new URL("/", request.url));
}
