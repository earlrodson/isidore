import { consumeMagicLink, createViewerSession } from "@isidore/db";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import {
  generateViewerToken,
  hashViewerToken,
  setViewerSessionCookie,
  viewerSessionExpiry,
} from "@/lib/viewer-session";

/** AC-005: validates + single-use-consumes the magic link token, then
 * issues a fresh viewer session token (never reuses the magic-link token
 * itself as the session token). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token");
  const email = token ? await consumeMagicLink(getDb(), hashViewerToken(token)) : null;

  if (!email) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url));
  }

  const sessionToken = generateViewerToken();
  await createViewerSession(getDb(), {
    email,
    tokenHash: hashViewerToken(sessionToken),
    expiresAt: viewerSessionExpiry(),
  });
  await setViewerSessionCookie(sessionToken);

  return NextResponse.redirect(new URL("/", request.url));
}
