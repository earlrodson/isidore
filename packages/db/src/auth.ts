import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

export interface OAuthProfile {
  provider: string;
  providerAccountId: string;
  login: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
}

/**
 * Finds or creates the user for this provider account, and upserts the
 * linked oauth_accounts row with the latest tokens. Runs in a transaction
 * since a first-time login must insert both `users` and `oauth_accounts`
 * atomically.
 */
export async function upsertUserFromOAuth(
  db: NodePgDatabase<typeof schema>,
  profile: OAuthProfile,
): Promise<{ userId: string }> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ userId: schema.oauthAccounts.userId })
      .from(schema.oauthAccounts)
      .where(
        and(
          eq(schema.oauthAccounts.provider, profile.provider),
          eq(schema.oauthAccounts.providerAccountId, profile.providerAccountId),
        ),
      );

    const userId =
      existing?.userId ??
      (
        await tx
          .insert(schema.users)
          .values({ login: profile.login, avatarUrl: profile.avatarUrl })
          .returning({ id: schema.users.id })
      )[0].id;

    if (existing) {
      await tx
        .update(schema.users)
        .set({
          login: profile.login,
          avatarUrl: profile.avatarUrl,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));
    }

    await tx
      .insert(schema.oauthAccounts)
      .values({
        userId,
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
        accessToken: profile.accessToken,
        refreshToken: profile.refreshToken,
        accessTokenExpiresAt: profile.accessTokenExpiresAt,
      })
      .onConflictDoUpdate({
        target: [
          schema.oauthAccounts.provider,
          schema.oauthAccounts.providerAccountId,
        ],
        set: {
          accessToken: profile.accessToken,
          refreshToken: profile.refreshToken,
          accessTokenExpiresAt: profile.accessTokenExpiresAt,
          updatedAt: new Date(),
        },
      });

    return { userId };
  });
}

/** Creates a session row keyed by a hash of the bearer token — the raw
 * token is never persisted, only handed to the caller to set as a cookie. */
export async function createSession(
  db: NodePgDatabase<typeof schema>,
  { userId, tokenHash, expiresAt }: { userId: string; tokenHash: string; expiresAt: Date },
): Promise<void> {
  await db.insert(schema.sessions).values({ userId, tokenHash, expiresAt });
}

/** Looks up the still-valid session for a hashed bearer token. */
export async function getSessionByTokenHash(
  db: NodePgDatabase<typeof schema>,
  tokenHash: string,
): Promise<{ userId: string; login: string; expiresAt: Date } | null> {
  const [row] = await db
    .select({
      userId: schema.sessions.userId,
      expiresAt: schema.sessions.expiresAt,
      login: schema.users.login,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.tokenHash, tokenHash));

  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

export async function deleteSession(
  db: NodePgDatabase<typeof schema>,
  tokenHash: string,
): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash));
}

/** Records (or refreshes) the GitHub App installation the user connected. */
export async function upsertGithubInstallation(
  db: NodePgDatabase<typeof schema>,
  { userId, installationId, accountLogin }: { userId: string; installationId: string; accountLogin: string },
): Promise<void> {
  await db
    .insert(schema.githubInstallations)
    .values({ userId, installationId, accountLogin })
    .onConflictDoUpdate({
      target: [schema.githubInstallations.installationId],
      set: { userId, accountLogin, updatedAt: new Date() },
    });
}

/** Reads back the stored access token for a user's provider account —
 * needed to call the provider's API on the user's behalf (e.g. listing
 * installations/repos, committing the scaffold). */
export async function getOAuthAccessToken(
  db: NodePgDatabase<typeof schema>,
  { userId, provider }: { userId: string; provider: string },
): Promise<string | null> {
  const [row] = await db
    .select({ accessToken: schema.oauthAccounts.accessToken })
    .from(schema.oauthAccounts)
    .where(
      and(
        eq(schema.oauthAccounts.userId, userId),
        eq(schema.oauthAccounts.provider, provider),
      ),
    );

  return row?.accessToken ?? null;
}

/** Lists the GitHub App installations a user has connected. */
export async function listGithubInstallations(
  db: NodePgDatabase<typeof schema>,
  userId: string,
): Promise<Array<{ installationId: string; accountLogin: string }>> {
  return db
    .select({
      installationId: schema.githubInstallations.installationId,
      accountLogin: schema.githubInstallations.accountLogin,
    })
    .from(schema.githubInstallations)
    .where(eq(schema.githubInstallations.userId, userId));
}
