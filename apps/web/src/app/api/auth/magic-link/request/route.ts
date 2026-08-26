import { createMagicLink, magicLinkExpiry } from "@isidore/db";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { sendMagicLinkEmail } from "@/lib/mailer";
import { generateViewerToken, hashViewerToken } from "@/lib/viewer-session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Always responds identically regardless of whether the email is known or
 * has any grants (docs/specifications/viewer-magic-link-access.md AC-004)
 * — the only branch is "well-formed enough to email," which is not an
 * account-existence signal. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (EMAIL_RE.test(email)) {
    const token = generateViewerToken();
    await createMagicLink(getDb(), {
      email,
      tokenHash: hashViewerToken(token),
      expiresAt: magicLinkExpiry(),
    });

    const verifyUrl = new URL("/api/auth/magic-link/verify", request.url);
    verifyUrl.searchParams.set("token", token);
    await sendMagicLinkEmail(email, verifyUrl.toString());
  }

  return NextResponse.json({ ok: true });
}
