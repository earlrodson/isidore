import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { parseIngestPayload } from "@isidore/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../client.js";
import { getProjectDetail, listProjectSummaries } from "../queries.js";
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
    sql`truncate table snapshots, status_events, actuals, estimates, todos, feature_assignees, features, assignees, projects cascade`,
  );
}

beforeEach(async () => {
  db = createDb(databaseUrl);
  await truncateAll(db);
});

afterAll(async () => {
  await truncateAll(db);
});

describe("listProjectSummaries", () => {
  it("rolls up feature completion, stale todos, and last snapshot per project", async () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    const feature = payload.features[0];

    // A past-due, still-open todo makes this project's rollup non-zero.
    const staleFeature = {
      ...feature,
      todos: [{ ...feature.todos[1], due: "2000-01-01" }],
    };
    await writeFeatureSnapshot(db, payload, staleFeature);

    const donePayload = { ...payload, repo_id: "your-org/project-2", project: "project-2" };
    const doneFeature = { ...feature, feature_id: "other-feature", status: "done" as const };
    await writeFeatureSnapshot(db, donePayload, doneFeature);

    const summaries = await listProjectSummaries(db);
    expect(summaries).toHaveLength(2);

    const project1 = summaries.find((s) => s.repoId === "your-org/project-1");
    expect(project1).toMatchObject({
      name: "project-1",
      featuresTotal: 1,
      featuresDone: 0,
      staleTodoCount: 1,
    });
    expect(project1?.lastReceivedAt).toBeInstanceOf(Date);

    const project2 = summaries.find((s) => s.repoId === "your-org/project-2");
    expect(project2).toMatchObject({
      name: "project-2",
      featuresTotal: 1,
      featuresDone: 1,
      staleTodoCount: 0,
    });
  });

  it("returns an empty list when no projects are onboarded", async () => {
    expect(await listProjectSummaries(db)).toEqual([]);
  });
});

describe("getProjectDetail", () => {
  it("returns null for a project that was never onboarded", async () => {
    expect(await getProjectDetail(db, "github", "no-such/repo")).toBeNull();
  });

  it("returns an onboarded project with zero features as an empty list, not null", async () => {
    await db.insert(schema.projects).values({
      provider: "github",
      repoId: "your-org/empty-project",
      name: "empty-project",
    });

    const detail = await getProjectDetail(db, "github", "your-org/empty-project");

    expect(detail).toMatchObject({ name: "empty-project", features: [] });
  });

  it("returns features with their todos, estimates, and open PRs", async () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    const feature = payload.features[0];
    await writeFeatureSnapshot(db, payload, feature);

    const detail = await getProjectDetail(db, payload.provider, payload.repo_id);

    expect(detail?.name).toBe("project-1");
    expect(detail?.features).toHaveLength(1);
    expect(detail?.features[0]).toMatchObject({
      featureId: "auth-refresh",
      title: "Refresh token rotation",
      status: "in-progress",
      estimateHours: 8,
      hoursLogged: 5.5,
      openPrs: [{ number: 412, state: "open" }],
    });
    expect(detail?.features[0].todos).toHaveLength(2);
    expect(detail?.features[0].todos.map((t) => t.todoId).sort()).toEqual(["t1", "t2"]);
    expect(detail?.features[0].todos.find((t) => t.todoId === "t1")).toMatchObject({
      done: true,
      owner: "dev-a",
    });
  });
});
