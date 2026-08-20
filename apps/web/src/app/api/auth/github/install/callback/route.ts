import { getOAuthAccessToken, upsertGithubInstallation } from "@isidore/db";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { listUserInstallations } from "@/lib/github-app";

const STATE_COOKIE = "isidore_install_state";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/api/auth/github/login", request.url));
  }

  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  if (!installationId || !state || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: "invalid install state" }, { status: 400 });
  }

  const db = getDb();
  const accessToken = await getOAuthAccessToken(db, { userId: user.userId, provider: "github" });
  if (!accessToken) {
    return NextResponse.json({ error: "no github access token on file" }, { status: 400 });
  }

  // GitHub's redirect only carries the installation_id — the account
  // login it belongs to is looked up via the same /user/installations
  // listing the picker page uses, so we never trust an unvalidated value
  // from the query string beyond the id itself.
  const installations = await listUserInstallations(accessToken);
  const installation = installations.find((i) => i.installationId === installationId);
  if (!installation) {
    return NextResponse.json({ error: "installation not visible to this user" }, { status: 403 });
  }

  await upsertGithubInstallation(db, {
    userId: user.userId,
    installationId: installation.installationId,
    accountLogin: installation.accountLogin,
  });

  return NextResponse.redirect(new URL("/onboarding", request.url));
}
