import { deleteViewerSession } from "@isidore/db";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { clearViewerSessionCookie, hashViewerToken, readViewerToken } from "@/lib/viewer-session";

/** AC-012: mirrors POST /api/auth/logout, kept separate since it clears a
 * different cookie/identity. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = await readViewerToken();
  if (token) {
    await deleteViewerSession(getDb(), hashViewerToken(token));
  }
  await clearViewerSessionCookie();

  // 303, not the default 307: this is a POST request, and 307 would make
  // the browser re-POST to /login, which has no POST handler.
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
