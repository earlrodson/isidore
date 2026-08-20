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

  return NextResponse.redirect(new URL("/", request.url));
}
