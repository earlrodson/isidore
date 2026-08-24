import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { EnvironmentPingPayload } from "@isidore/shared";
import { contentHash } from "./hash.js";
import * as schema from "./schema.js";

type Tx = NodePgDatabase<typeof schema>;

/**
 * Furthest-reached ranking (feature-environment-tracking.md AC-010) — an
 * incoming ping only advances a feature's `environment`, never regresses
 * it, since a merged spec file stays on `staging` forever and would
 * otherwise get re-observed (and wrongly downgrade an already-`production`
 * feature) on every unrelated later `staging` push.
 */
const ENVIRONMENT_RANK: Record<string, number> = {
  develop: 1,
  staging: 2,
  production: 3,
};

function outranks(incoming: string, current: string | null): boolean {
  if (current === null) return true;
  return ENVIRONMENT_RANK[incoming] >= ENVIRONMENT_RANK[current];
}

export type WriteEnvironmentPingResult = "written" | "unchanged";

/**
 * Persists one environment ping to `environment_pings`, then derives the
 * per-feature `environment` updates from it — raw write before
 * normalization, same ordering guarantee as `writeFeatureSnapshot`
 * (TECHSTACK.md §4.2).
 *
 * Skips the write (and derivation) when the incoming content hash matches
 * what's already stored for this `(provider, repoId, environment, commitSha)`
 * — the same repeated-ping is a no-op, not a re-derive.
 */
export async function writeEnvironmentPing(
  db: NodePgDatabase<typeof schema>,
  payload: EnvironmentPingPayload,
): Promise<WriteEnvironmentPingResult> {
  const hash = contentHash(payload);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ contentHash: schema.environmentPings.contentHash })
      .from(schema.environmentPings)
      .where(
        and(
          eq(schema.environmentPings.provider, payload.provider),
          eq(schema.environmentPings.repoId, payload.repo_id),
          eq(schema.environmentPings.environment, payload.environment),
          eq(schema.environmentPings.commitSha, payload.commit_sha),
        ),
      );

    if (existing?.contentHash === hash) {
      return "unchanged";
    }

    const [row] = await tx
      .insert(schema.environmentPings)
      .values({
        provider: payload.provider,
        repoId: payload.repo_id,
        project: payload.project,
        environmentPingSchemaVersion: payload.environment_ping_schema_version,
        environment: payload.environment,
        commitSha: payload.commit_sha,
        generatedAt: new Date(payload.generated_at),
        timezone: payload.timezone,
        featureIds: payload.feature_ids,
        contentHash: hash,
      })
      .onConflictDoUpdate({
        target: [
          schema.environmentPings.provider,
          schema.environmentPings.repoId,
          schema.environmentPings.environment,
          schema.environmentPings.commitSha,
        ],
        set: {
          project: payload.project,
          environmentPingSchemaVersion: payload.environment_ping_schema_version,
          generatedAt: new Date(payload.generated_at),
          timezone: payload.timezone,
          featureIds: payload.feature_ids,
          contentHash: hash,
        },
      })
      .returning();

    await deriveEnvironmentPing(tx, row);
    return "written";
  });
}

/**
 * Fans a stored `environment_pings` row out to per-feature monotonic
 * updates. A `feature_id` the ingest endpoint has never seen via a
 * `develop` snapshot is silently skipped (AC-011) — plan data, including
 * the very existence of a `features` row, originates only from `develop`.
 */
export async function deriveEnvironmentPing(
  tx: Tx,
  row: {
    provider: string;
    repoId: string;
    environment: string;
    featureIds: unknown;
  },
): Promise<void> {
  const [project] = await tx
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.provider, row.provider),
        eq(schema.projects.repoId, row.repoId),
      ),
    );
  if (!project) return;

  const featureIds = row.featureIds as string[];
  if (featureIds.length === 0) return;

  const existingFeatures = await tx
    .select({
      id: schema.features.id,
      featureId: schema.features.featureId,
      environment: schema.features.environment,
    })
    .from(schema.features)
    .where(eq(schema.features.projectId, project.id));

  const byFeatureId = new Map(existingFeatures.map((f) => [f.featureId, f]));

  for (const featureId of featureIds) {
    const feature = byFeatureId.get(featureId);
    if (!feature) continue;
    if (!outranks(row.environment, feature.environment)) continue;

    await tx
      .update(schema.features)
      .set({ environment: row.environment, updatedAt: sql`now()` })
      .where(eq(schema.features.id, feature.id));
  }
}
