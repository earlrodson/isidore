import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { githubAppSlug } from "@/lib/github-app";

const STATE_COOKIE = "isidore_install_state";

/** Redirects to GitHub's own installation picker, letting the user connect
 * repos from any account/org they belong to (docs/features/onboarding-oauth.md
 * — a user can call this more than once to add another account). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/api/auth/github/login", request.url));
  }

  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const url = new URL(`https://github.com/apps/${githubAppSlug()}/installations/new`);
  url.searchParams.set("state", state);
  return NextResponse.redirect(url.toString());
}
