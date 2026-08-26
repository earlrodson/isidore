import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

/** Deliberately distinct from `SESSION_COOKIE` (session.ts) — a viewer
 * session must never be confusable with an onboarding session; they
 * authenticate different audiences against different table sets
 * (docs/specifications/viewer-magic-link-access.md AC-002). */
export const VIEWER_SESSION_COOKIE = "isidore_viewer_session";
const VIEWER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function generateViewerToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashViewerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function viewerSessionExpiry(): Date {
  return new Date(Date.now() + VIEWER_SESSION_TTL_MS);
}

export async function setViewerSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(VIEWER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: VIEWER_SESSION_TTL_MS / 1000,
  });
}

export async function clearViewerSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(VIEWER_SESSION_COOKIE);
}

export async function readViewerToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(VIEWER_SESSION_COOKIE)?.value ?? null;
}
