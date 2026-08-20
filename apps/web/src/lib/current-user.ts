import { getSessionByTokenHash } from "@isidore/db";
import { getDb } from "@/lib/db";
import { hashSessionToken, readSessionToken } from "@/lib/session";

export interface CurrentUser {
  userId: string;
  login: string;
}

/** Reads the session cookie and resolves it to a user, or null if there is
 * no session / it has expired. Used by onboarding routes and pages — never
 * imported by the ingest route (TECHSTACK.md §7). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = await readSessionToken();
  if (!token) return null;

  const session = await getSessionByTokenHash(getDb(), hashSessionToken(token));
  if (!session) return null;

  return { userId: session.userId, login: session.login };
}
