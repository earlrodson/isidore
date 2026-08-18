import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

/** Looks up the per-repo HMAC secret used to verify ingest requests. */
export async function getRepoSecret(
  db: NodePgDatabase<typeof schema>,
  provider: string,
  repoId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ secret: schema.repoSecrets.secret })
    .from(schema.repoSecrets)
    .where(
      and(
        eq(schema.repoSecrets.provider, provider),
        eq(schema.repoSecrets.repoId, repoId),
      ),
    );

  return row?.secret ?? null;
}

/** Creates or rotates the HMAC secret for a repo. */
export async function upsertRepoSecret(
  db: NodePgDatabase<typeof schema>,
  { provider, repoId, secret }: { provider: string; repoId: string; secret: string },
): Promise<void> {
  await db
    .insert(schema.repoSecrets)
    .values({ provider, repoId, secret })
    .onConflictDoUpdate({
      target: [schema.repoSecrets.provider, schema.repoSecrets.repoId],
      set: { secret, updatedAt: new Date() },
    });
}
