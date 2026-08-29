import { deleteSession } from "@isidore/db";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { clearSessionCookie, hashSessionToken, readSessionToken } from "@/lib/session";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = await readSessionToken();
  if (token) {
    await deleteSession(getDb(), hashSessionToken(token));
  }
  await clearSessionCookie();

  // 303, not the default 307: the request that triggered this is a POST
  // (native form submit), and 307 would make the browser re-POST to "/",
  // which has no POST handler.
  return NextResponse.redirect(new URL("/", request.url), 303);
}
