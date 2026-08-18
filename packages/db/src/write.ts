import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Feature, IngestPayload } from "@isidore/shared";
import { deriveSnapshot } from "./derive.js";
import { contentHash } from "./hash.js";
import * as schema from "./schema.js";

export type WriteResult = "written" | "unchanged";

/**
 * Persists one feature's slice of an ingest payload to `snapshots`, then
 * derives the normalized tables from it — raw write always happens before
 * normalization so a normalization bug never loses data (TECHSTACK.md §4.2).
 *
 * Skips the write (and derivation) when the incoming content hash matches
 * what's already stored, which is what makes the reconcile job's hash
 * compare cheap (PRD.md §6.3).
 */
export async function writeFeatureSnapshot(
  db: NodePgDatabase<typeof schema>,
  payload: IngestPayload,
  feature: Feature,
): Promise<WriteResult> {
  const hash = contentHash(feature);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ contentHash: schema.snapshots.contentHash })
      .from(schema.snapshots)
      .where(
        and(
          eq(schema.snapshots.provider, payload.provider),
          eq(schema.snapshots.repoId, payload.repo_id),
          eq(schema.snapshots.featureId, feature.feature_id),
        ),
      );

    if (existing?.contentHash === hash) {
      return "unchanged";
    }

    const generatedAt = new Date(payload.generated_at);

    const [row] = await tx
      .insert(schema.snapshots)
      .values({
        provider: payload.provider,
        repoId: payload.repo_id,
        project: payload.project,
        featureId: feature.feature_id,
        payloadSchemaVersion: payload.payload_schema_version,
        week: payload.week,
        baseBranch: payload.base_branch,
        commitSha: payload.commit_sha,
        generatedAt,
        timezone: payload.timezone,
        raw: feature,
        contentHash: hash,
      })
      .onConflictDoUpdate({
        target: [
          schema.snapshots.provider,
          schema.snapshots.repoId,
          schema.snapshots.featureId,
        ],
        set: {
          project: payload.project,
          payloadSchemaVersion: payload.payload_schema_version,
          week: payload.week,
          baseBranch: payload.base_branch,
          commitSha: payload.commit_sha,
          generatedAt,
          timezone: payload.timezone,
          raw: feature,
          contentHash: hash,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    await deriveSnapshot(tx, row);
    return "written";
  });
}
