import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "isidore_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Hex-encoded 32 bytes, matching the entropy of the existing repo secret
 * generator (packages/db/scripts/seed-repo-secret.mjs). */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/** Only the hash is ever persisted (schema.ts `sessions.tokenHash`) — the
 * raw token lives solely in the cookie. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_MS);
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}
