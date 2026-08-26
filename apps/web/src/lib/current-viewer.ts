import { getViewerSessionByTokenHash } from "@isidore/db";
import { getDb } from "@/lib/db";
import { hashViewerToken, readViewerToken } from "@/lib/viewer-session";

export interface CurrentViewer {
  email: string;
}

/** Reads the viewer session cookie and resolves it to an email, or null.
 * Never imported by the onboarding or ingest paths — this is the
 * stakeholder-facing dashboard identity only
 * (docs/specifications/viewer-magic-link-access.md). */
export async function getCurrentViewer(): Promise<CurrentViewer | null> {
  const token = await readViewerToken();
  if (!token) return null;

  const session = await getViewerSessionByTokenHash(getDb(), hashViewerToken(token));
  if (!session) return null;

  return { email: session.email };
}

/** Whether the given email is an admin, per the ISIDORE_ADMIN_EMAILS env
 * var (comma-separated) — deliberately env-configured, not a DB table, to
 * keep the bootstrap problem trivial (AC-010 decision log). */
export function isAdminEmail(email: string): boolean {
  const admins = (process.env.ISIDORE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}
