import { and, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

type Db = NodePgDatabase<typeof schema>;

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

export function magicLinkExpiry(): Date {
  return new Date(Date.now() + MAGIC_LINK_TTL_MS);
}

/** Issues a magic link row — never reveals whether the email is known
 * (docs/specifications/viewer-magic-link-access.md AC-004); callers always
 * create one regardless of prior history. */
export async function createMagicLink(
  db: Db,
  { email, tokenHash, expiresAt }: { email: string; tokenHash: string; expiresAt: Date },
): Promise<void> {
  await db.insert(schema.magicLinks).values({ email, tokenHash, expiresAt });
}

/** Atomically consumes a magic link: valid only if unexpired and not
 * already used, and marks it used in the same statement so a token can
 * never be replayed even under a race (AC-005). Returns the bound email,
 * or null if the token is invalid/expired/already consumed. */
export async function consumeMagicLink(db: Db, tokenHash: string): Promise<string | null> {
  const [row] = await db
    .update(schema.magicLinks)
    .set({ consumedAt: new Date() })
    .where(
      and(eq(schema.magicLinks.tokenHash, tokenHash), isNull(schema.magicLinks.consumedAt)),
    )
    .returning({ email: schema.magicLinks.email, expiresAt: schema.magicLinks.expiresAt });

  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  return row.email;
}

export async function createViewerSession(
  db: Db,
  { email, tokenHash, expiresAt }: { email: string; tokenHash: string; expiresAt: Date },
): Promise<void> {
  await db.insert(schema.viewerSessions).values({ email, tokenHash, expiresAt });
}

export async function getViewerSessionByTokenHash(
  db: Db,
  tokenHash: string,
): Promise<{ email: string; expiresAt: Date } | null> {
  const [row] = await db
    .select({ email: schema.viewerSessions.email, expiresAt: schema.viewerSessions.expiresAt })
    .from(schema.viewerSessions)
    .where(eq(schema.viewerSessions.tokenHash, tokenHash));

  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

export async function deleteViewerSession(db: Db, tokenHash: string): Promise<void> {
  await db.delete(schema.viewerSessions).where(eq(schema.viewerSessions.tokenHash, tokenHash));
}

/** Grants (or no-ops if already granted) an email access to a project. */
export async function grantRepoAccess(
  db: Db,
  { email, projectId }: { email: string; projectId: string },
): Promise<void> {
  await db
    .insert(schema.repoAccess)
    .values({ email, projectId })
    .onConflictDoNothing({
      target: [schema.repoAccess.email, schema.repoAccess.projectId],
    });
}

export async function revokeRepoAccess(
  db: Db,
  { email, projectId }: { email: string; projectId: string },
): Promise<void> {
  await db
    .delete(schema.repoAccess)
    .where(and(eq(schema.repoAccess.email, email), eq(schema.repoAccess.projectId, projectId)));
}

/** The (provider, repoId) pairs an email is granted access to — re-read
 * from the DB on every gated page load, never cached in the session
 * (AC-011). */
export async function listAccessibleProjectsForEmail(
  db: Db,
  email: string,
): Promise<Array<{ provider: string; repoId: string }>> {
  return db
    .select({ provider: schema.projects.provider, repoId: schema.projects.repoId })
    .from(schema.repoAccess)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.repoAccess.projectId))
    .where(eq(schema.repoAccess.email, email));
}

export async function isEmailGrantedToProject(
  db: Db,
  { email, provider, repoId }: { email: string; provider: string; repoId: string },
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.repoAccess.id })
    .from(schema.repoAccess)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.repoAccess.projectId))
    .where(
      and(
        eq(schema.repoAccess.email, email),
        eq(schema.projects.provider, provider),
        eq(schema.projects.repoId, repoId),
      ),
    );

  return row !== undefined;
}

export interface AccessGrant {
  email: string;
  projectId: string;
  provider: string;
  repoId: string;
  name: string;
}

/** All grants across every project, for the admin UI (AC-010). */
export async function listAllAccessGrants(db: Db): Promise<AccessGrant[]> {
  return db
    .select({
      email: schema.repoAccess.email,
      projectId: schema.repoAccess.projectId,
      provider: schema.projects.provider,
      repoId: schema.projects.repoId,
      name: schema.projects.name,
    })
    .from(schema.repoAccess)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.repoAccess.projectId));
}

export interface ProjectOption {
  id: string;
  provider: string;
  repoId: string;
  name: string;
}

/** Every onboarded project, for the admin UI's per-project grant form. */
export async function listProjectOptions(db: Db): Promise<ProjectOption[]> {
  return db
    .select({
      id: schema.projects.id,
      provider: schema.projects.provider,
      repoId: schema.projects.repoId,
      name: schema.projects.name,
    })
    .from(schema.projects);
}
