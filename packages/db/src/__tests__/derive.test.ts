import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { parseIngestPayload } from "@isidore/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../client.js";
import { replayAll } from "../derive.js";
import * as schema from "../schema.js";
import { writeFeatureSnapshot } from "../write.js";

const databaseUrl =
  process.env.DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/isidore_test`;

const loadFixture = (name: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../../shared/fixtures/${name}`, import.meta.url)), "utf8"),
  );

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

describe("writeFeatureSnapshot", () => {
  it("writes a snapshot and derives the normalized rows", async () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    const feature = payload.features[0];

    const result = await writeFeatureSnapshot(db, payload, feature);

    expect(result).toBe("written");

    const [project] = await db.select().from(schema.projects);
    expect(project.name).toBe("project-1");

    const [featureRow] = await db.select().from(schema.features);
    expect(featureRow.featureId).toBe("auth-refresh");
    expect(featureRow.hoursLogged).toBe(5.5);

    const todoRows = await db.select().from(schema.todos);
    expect(todoRows).toHaveLength(2);

    const assigneeRows = await db.select().from(schema.assignees);
    expect(assigneeRows.map((a) => a.handle)).toEqual(["dev-a"]);
  });

  it("is idempotent: re-writing the same payload never duplicates rows", async () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    const feature = payload.features[0];

    await writeFeatureSnapshot(db, payload, feature);
    const secondResult = await writeFeatureSnapshot(db, payload, feature);

    expect(secondResult).toBe("unchanged");

    const snapshotRows = await db.select().from(schema.snapshots);
    expect(snapshotRows).toHaveLength(1);

    const featureRows = await db.select().from(schema.features);
    expect(featureRows).toHaveLength(1);
  });

  it("overwrites rather than forking a new row when the feature changes", async () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    const feature = payload.features[0];
    await writeFeatureSnapshot(db, payload, feature);

    const updatedFeature = { ...feature, status: "done" as const, hours_logged: 8 };
    const result = await writeFeatureSnapshot(db, payload, updatedFeature);

    expect(result).toBe("written");

    const snapshotRows = await db.select().from(schema.snapshots);
    expect(snapshotRows).toHaveLength(1);
    expect(snapshotRows[0].raw).toMatchObject({ status: "done", hours_logged: 8 });

    const featureRows = await db.select().from(schema.features);
    expect(featureRows).toHaveLength(1);
    expect(featureRows[0].status).toBe("done");
  });

  it("leaves environment null when the payload doesn't carry it", async () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    const feature = payload.features[0];

    await writeFeatureSnapshot(db, payload, feature);

    const [featureRow] = await db.select().from(schema.features);
    expect(featureRow.environment).toBeNull();
  });

  it("ignores a feature's environment field entirely, even when the payload carries one — that's owned exclusively by environment pings now (feature-environment-tracking AC-008/012)", async () => {
    const payload = parseIngestPayload(loadFixture("valid-with-environment.json"));
    const feature = payload.features[0];

    await writeFeatureSnapshot(db, payload, feature);

    const [featureRow] = await db.select().from(schema.features);
    expect(featureRow.environment).toBeNull();
  });

  it("never clobbers an environment already set by a ping, on a later develop snapshot that keeps status done", async () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    const feature = { ...payload.features[0], status: "done" as const };
    await writeFeatureSnapshot(db, payload, feature);

    const [before] = await db.select().from(schema.features);
    await db
      .update(schema.features)
      .set({ environment: "production" })
      .where(sql`${schema.features.id} = ${before.id}`);

    const updatedFeature = { ...feature, hours_logged: 8 };
    await writeFeatureSnapshot(db, payload, updatedFeature);

    const [after] = await db.select().from(schema.features);
    expect(after.environment).toBe("production");
    expect(after.hoursLogged).toBe(8);
  });

  it("clears a stale environment when a done feature's status regresses (reopened)", async () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    const feature = { ...payload.features[0], status: "done" as const };
    await writeFeatureSnapshot(db, payload, feature);

    const [before] = await db.select().from(schema.features);
    await db
      .update(schema.features)
      .set({ environment: "production" })
      .where(sql`${schema.features.id} = ${before.id}`);

    const reopenedFeature = { ...feature, status: "implementing" as const };
    await writeFeatureSnapshot(db, payload, reopenedFeature);

    const [after] = await db.select().from(schema.features);
    expect(after.status).toBe("implementing");
    expect(after.environment).toBeNull();
  });

  it("defaults type/severity/priority/relatesTo to null when the payload doesn't carry them (pre-1.2 backward compat)", async () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    const feature = payload.features[0];

    await writeFeatureSnapshot(db, payload, feature);

    const [featureRow] = await db.select().from(schema.features);
    expect(featureRow.type).toBeNull();
    expect(featureRow.severity).toBeNull();
    expect(featureRow.priority).toBeNull();
    expect(featureRow.relatesTo).toBeNull();
  });

  it("persists a 1.6 payload's priority", async () => {
    const payload = parseIngestPayload(loadFixture("valid-with-priority.json"));
    const feature = payload.features[0];

    await writeFeatureSnapshot(db, payload, feature);

    const [featureRow] = await db.select().from(schema.features);
    expect(featureRow.priority).toBe("high");
  });

  it("persists a 1.2 payload's type/severity/relatesTo", async () => {
    const payload = parseIngestPayload(loadFixture("valid-with-type-severity.json"));
    const feature = payload.features[0];

    await writeFeatureSnapshot(db, payload, feature);

    const [featureRow] = await db.select().from(schema.features);
    expect(featureRow.type).toBe("defect");
    expect(featureRow.severity).toBe("high");
    expect(featureRow.relatesTo).toEqual(["auth-refresh"]);
  });

  it("removes todos no longer present in a full-refresh snapshot", async () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    const feature = payload.features[0];
    await writeFeatureSnapshot(db, payload, feature);

    const shrunkFeature = { ...feature, todos: [feature.todos[0]] };
    await writeFeatureSnapshot(db, payload, shrunkFeature);

    const todoRows = await db.select().from(schema.todos);
    expect(todoRows).toHaveLength(1);
    expect(todoRows[0].todoId).toBe("t1");
  });
});

describe("replayAll", () => {
  it("regenerates normalized tables identically from stored snapshots", async () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    const feature = payload.features[0];
    await writeFeatureSnapshot(db, payload, feature);

    const before = await db.select().from(schema.features);

    await replayAll(db);

    const after = await db.select().from(schema.features);
    expect(after).toHaveLength(before.length);
    expect(after[0]).toMatchObject({
      featureId: before[0].featureId,
      title: before[0].title,
      status: before[0].status,
      estimateHours: before[0].estimateHours,
      hoursLogged: before[0].hoursLogged,
    });

    const todoRows = await db.select().from(schema.todos);
    expect(todoRows).toHaveLength(2);
  });
});
