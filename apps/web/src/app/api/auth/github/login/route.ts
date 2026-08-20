import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { githubAuthorizeUrl } from "@/lib/github-app";

const STATE_COOKIE = "isidore_oauth_state";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const state = randomBytes(16).toString("hex");
  const redirectUri = new URL("/api/auth/github/callback", request.url).toString();

  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(githubAuthorizeUrl({ redirectUri, state }));
}
