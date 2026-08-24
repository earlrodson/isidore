import { sql } from "drizzle-orm";
import { parseEnvironmentPingPayload, parseIngestPayload } from "@isidore/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../client.js";
import { writeEnvironmentPing } from "../environment.js";
import { replayAll } from "../derive.js";
import * as schema from "../schema.js";
import { writeFeatureSnapshot } from "../write.js";

const databaseUrl =
  process.env.DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/isidore_test`;

let db: Db;

async function truncateAll(database: Db) {
  await database.execute(
    sql`truncate table snapshots, environment_pings, status_events, actuals, estimates, todos, feature_assignees, features, assignees, projects cascade`,
  );
}

beforeEach(async () => {
  db = createDb(databaseUrl);
  await truncateAll(db);
});

afterAll(async () => {
  await truncateAll(db);
});

const validSnapshot = parseIngestPayload({
  payload_schema_version: "1.3",
  provider: "github",
  repo_id: "your-org/project-1",
  project: "project-1",
  week: "2026-W34",
  base_branch: "develop",
  commit_sha: "a1b2c3d",
  generated_at: "2026-08-18T09:00:00+08:00",
  timezone: "Asia/Manila",
  features: [
    {
      feature_id: "auth-refresh",
      title: "Refresh token rotation",
      prd_ref: "docs/PRD.md#4.2",
      status: "implementing",
      owners: ["dev-a"],
      estimate_hours: 8,
      hours_logged: 5.5,
      todos: [],
      open_prs: [],
    },
  ],
});

function ping(overrides: Partial<Parameters<typeof parseEnvironmentPingPayload>[0]> = {}) {
  return parseEnvironmentPingPayload({
    environment_ping_schema_version: "1.0",
    provider: "github",
    repo_id: "your-org/project-1",
    project: "project-1",
    environment: "staging",
    commit_sha: "abc1234",
    generated_at: "2026-08-25T09:00:00Z",
    timezone: "UTC",
    feature_ids: ["auth-refresh"],
    ...overrides,
  });
}

describe("writeEnvironmentPing", () => {
  it("is a no-op for a feature never seen via a develop snapshot (AC-011)", async () => {
    const result = await writeEnvironmentPing(db, ping());
    expect(result).toBe("written");

    const featureRows = await db.select().from(schema.features);
    expect(featureRows).toHaveLength(0);
  });

  it("advances a known feature's environment", async () => {
    await writeFeatureSnapshot(db, validSnapshot, validSnapshot.features[0]);

    await writeEnvironmentPing(db, ping({ environment: "staging" }));

    const [featureRow] = await db.select().from(schema.features);
    expect(featureRow.environment).toBe("staging");
  });

  it("never downgrades an already-further-along feature (AC-010)", async () => {
    await writeFeatureSnapshot(db, validSnapshot, validSnapshot.features[0]);
    await writeEnvironmentPing(db, ping({ environment: "production", commit_sha: "prod1" }));

    // An unrelated later push to staging still includes this ticket's id,
    // since the spec file stays on staging forever once merged.
    await writeEnvironmentPing(db, ping({ environment: "staging", commit_sha: "stage2" }));

    const [featureRow] = await db.select().from(schema.features);
    expect(featureRow.environment).toBe("production");
  });

  it("is idempotent: re-sending the identical ping is unchanged, not re-derived", async () => {
    await writeFeatureSnapshot(db, validSnapshot, validSnapshot.features[0]);

    const first = await writeEnvironmentPing(db, ping());
    const second = await writeEnvironmentPing(db, ping());

    expect(first).toBe("written");
    expect(second).toBe("unchanged");

    const rows = await db.select().from(schema.environmentPings);
    expect(rows).toHaveLength(1);
  });

  it("skips a feature_id not present in the target project", async () => {
    await writeFeatureSnapshot(db, validSnapshot, validSnapshot.features[0]);

    await writeEnvironmentPing(db, ping({ feature_ids: ["auth-refresh", "does-not-exist"] }));

    const [featureRow] = await db.select().from(schema.features);
    expect(featureRow.environment).toBe("staging");
  });
});

describe("replayAll with environment pings", () => {
  it("rebuilds the same environment state after truncating and replaying", async () => {
    await writeFeatureSnapshot(db, validSnapshot, validSnapshot.features[0]);
    await writeEnvironmentPing(db, ping({ environment: "staging", commit_sha: "s1" }));
    await writeEnvironmentPing(db, ping({ environment: "production", commit_sha: "p1" }));

    const [before] = await db.select().from(schema.features);
    expect(before.environment).toBe("production");

    await replayAll(db);

    const [after] = await db.select().from(schema.features);
    expect(after.environment).toBe("production");
  });
});
