import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

/**
 * Records a nonce for replay protection (TECHSTACK.md §7). Returns `true`
 * if this is the first time the nonce has been seen for this repo, `false`
 * if it's a replay. Relies on the unique constraint on
 * `provider + repo_id + nonce` for atomicity under concurrent requests.
 */
export async function recordNonce(
  db: NodePgDatabase<typeof schema>,
  {
    provider,
    repoId,
    nonce,
    requestTimestamp,
  }: { provider: string; repoId: string; nonce: string; requestTimestamp: Date },
): Promise<boolean> {
  const [row] = await db
    .insert(schema.ingestNonces)
    .values({ provider, repoId, nonce, requestTimestamp })
    .onConflictDoNothing({
      target: [
        schema.ingestNonces.provider,
        schema.ingestNonces.repoId,
        schema.ingestNonces.nonce,
      ],
    })
    .returning();

  return row !== undefined;
}
