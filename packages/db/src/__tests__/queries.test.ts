import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { parseIngestPayload } from "@isidore/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../client.js";
import {
  getProjectDetail,
  listDeveloperAllocation,
  listEstimationDrift,
  listFeaturesCompletedPerWeek,
  listProjectSummaries,
} from "../queries.js";
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

  it("surfaces a feature's environment, or null when it hasn't been resolved (feature-environment-tracking AC-005)", async () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    const feature = payload.features[0];
    await writeFeatureSnapshot(db, payload, feature);
    const detailWithoutEnvironment = await getProjectDetail(db, payload.provider, payload.repo_id);
    expect(detailWithoutEnvironment?.features[0].environment).toBeNull();

    const envPayload = parseIngestPayload(loadFixture("valid-with-environment.json"));
    const envFeature = envPayload.features[0];
    await writeFeatureSnapshot(db, envPayload, envFeature);
    const detailWithEnvironment = await getProjectDetail(db, envPayload.provider, envPayload.repo_id);
    expect(detailWithEnvironment?.features[0].environment).toBe("staging");
  });
});

describe("listFeaturesCompletedPerWeek", () => {
  it("counts a feature once, in the week it first flips to done", async () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    const feature = payload.features[0];

    await writeFeatureSnapshot(db, { ...payload, week: "2026-W33", generated_at: "2026-08-11T09:00:00Z" }, feature);

    const doneFeature = { ...feature, status: "done" as const };
    await writeFeatureSnapshot(
      db,
      { ...payload, week: "2026-W34", generated_at: "2026-08-18T09:00:00Z" },
      doneFeature,
    );

    // Reopened and redone the following week — must not recount.
    const reopenedFeature = { ...feature, status: "in-progress" as const };
    await writeFeatureSnapshot(
      db,
      { ...payload, week: "2026-W35", generated_at: "2026-08-25T09:00:00Z" },
      reopenedFeature,
    );
    await writeFeatureSnapshot(
      db,
      { ...payload, week: "2026-W36", generated_at: "2026-09-01T09:00:00Z" },
      doneFeature,
    );

    const result = await listFeaturesCompletedPerWeek(db);

    expect(result).toEqual([
      { provider: "github", repoId: "your-org/project-1", week: "2026-W34", count: 1 },
    ]);
  });

  it("scopes by provider and repoId", async () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    const doneFeature = { ...payload.features[0], status: "done" as const };
    await writeFeatureSnapshot(db, payload, doneFeature);

    const otherPayload = { ...payload, repo_id: "your-org/project-2", project: "project-2" };
    await writeFeatureSnapshot(db, otherPayload, doneFeature);

    const scoped = await listFeaturesCompletedPerWeek(db, {
      provider: "github",
      repoId: "your-org/project-2",
    });

    expect(scoped).toEqual([
      { provider: "github", repoId: "your-org/project-2", week: payload.week, count: 1 },
    ]);
  });
});

describe("listEstimationDrift", () => {
  it("trends estimate vs actual per week", async () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    const feature = payload.features[0];

    await writeFeatureSnapshot(
      db,
      { ...payload, week: "2026-W33", generated_at: "2026-08-11T09:00:00Z" },
      { ...feature, estimate_hours: 8, hours_logged: 5.5 },
    );
    await writeFeatureSnapshot(
      db,
      { ...payload, week: "2026-W34", generated_at: "2026-08-18T09:00:00Z" },
      { ...feature, estimate_hours: 8, hours_logged: 10 },
    );

    const drift = await listEstimationDrift(db);

    expect(drift).toEqual([
      {
        provider: "github",
        repoId: "your-org/project-1",
        week: "2026-W33",
        estimateHours: 8,
        hoursLogged: 5.5,
        drift: -2.5,
      },
      {
        provider: "github",
        repoId: "your-org/project-1",
        week: "2026-W34",
        estimateHours: 8,
        hoursLogged: 10,
        drift: 2,
      },
    ]);
  });
});

describe("listDeveloperAllocation", () => {
  it("counts open todos and summed estimate hours per assignee", async () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    const feature = payload.features[0];
    await writeFeatureSnapshot(db, payload, feature);

    const result = await listDeveloperAllocation(db);

    expect(result).toEqual([{ owner: "dev-a", openTodoCount: 1, openEstimateHours: 3 }]);
  });

  it("excludes done todos and scopes by project", async () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    const feature = payload.features[0];
    await writeFeatureSnapshot(db, payload, feature);

    const otherPayload = { ...payload, repo_id: "your-org/project-2", project: "project-2" };
    const otherFeature = {
      ...feature,
      feature_id: "other-feature",
      todos: [{ ...feature.todos[1], owner: "dev-b", todo_id: "t3" }],
    };
    await writeFeatureSnapshot(db, otherPayload, otherFeature);

    const scoped = await listDeveloperAllocation(db, {
      provider: "github",
      repoId: "your-org/project-1",
    });

    expect(scoped).toEqual([{ owner: "dev-a", openTodoCount: 1, openEstimateHours: 3 }]);
  });
});
