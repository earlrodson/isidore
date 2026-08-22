import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

type Tx = NodePgDatabase<typeof schema>;

export interface ProjectSummary {
  provider: string;
  repoId: string;
  name: string;
  featuresDone: number;
  featuresTotal: number;
  staleTodoCount: number;
  lastReceivedAt: Date | null;
}

/**
 * "Stale" is open + `due` in the past — the same heuristic GUIDELINES.md
 * uses for "today's overdue work" (docs/features/dashboard-cross-project.md
 * decision log), reused here rather than redefined.
 */
function staleTodoFilter() {
  return and(eq(schema.todos.done, false), lt(schema.todos.due, sql`current_date`));
}

/**
 * Cross-project summary rollup (docs/features/dashboard-cross-project.md).
 * Every number is a query over the normalized tables — never a re-parse of
 * `snapshots.raw` (TECHSTACK.md §4.2).
 */
export async function listProjectSummaries(db: Tx): Promise<ProjectSummary[]> {
  const projectRows = await db.select().from(schema.projects);

  const featureCounts = await db
    .select({
      projectId: schema.features.projectId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${schema.features.status} = 'done')::int`,
    })
    .from(schema.features)
    .groupBy(schema.features.projectId);

  const staleCounts = await db
    .select({
      projectId: schema.features.projectId,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.todos)
    .innerJoin(schema.features, eq(schema.todos.featureId, schema.features.id))
    .where(staleTodoFilter())
    .groupBy(schema.features.projectId);

  const lastSnapshots = await db
    .select({
      provider: schema.snapshots.provider,
      repoId: schema.snapshots.repoId,
      lastReceivedAt: sql<string>`max(${schema.snapshots.receivedAt})`,
    })
    .from(schema.snapshots)
    .groupBy(schema.snapshots.provider, schema.snapshots.repoId);

  const featureCountByProject = new Map(featureCounts.map((row) => [row.projectId, row]));
  const staleCountByProject = new Map(staleCounts.map((row) => [row.projectId, row.count]));
  const lastSnapshotByRepo = new Map(
    lastSnapshots.map((row) => [repoKey(row.provider, row.repoId), new Date(row.lastReceivedAt)]),
  );

  return projectRows.map((project) => {
    const counts = featureCountByProject.get(project.id);
    return {
      provider: project.provider,
      repoId: project.repoId,
      name: project.name,
      featuresTotal: counts?.total ?? 0,
      featuresDone: counts?.done ?? 0,
      staleTodoCount: staleCountByProject.get(project.id) ?? 0,
      lastReceivedAt: lastSnapshotByRepo.get(repoKey(project.provider, project.repoId)) ?? null,
    };
  });
}

export interface ProjectDetailTodo {
  todoId: string;
  title: string;
  done: boolean;
  owner: string;
  estimateHours: number;
  due: string | null;
}

export interface ProjectDetailFeature {
  featureId: string;
  title: string;
  status: string;
  estimateHours: number;
  hoursLogged: number;
  openPrs: unknown;
  environment: string | null;
  type: string | null;
  severity: string | null;
  relatesTo: unknown;
  todos: ProjectDetailTodo[];
}

export interface ProjectDetail {
  provider: string;
  repoId: string;
  name: string;
  features: ProjectDetailFeature[];
}

/**
 * Per-project detail (docs/features/dashboard-cross-project.md), keyed on
 * `provider + repo_id` per the ingest contract's idempotency key
 * (TECHSTACK.md §6). Returns `null` when the project isn't onboarded at all,
 * distinct from an onboarded project with zero features.
 */
export async function getProjectDetail(
  db: Tx,
  provider: string,
  repoId: string,
): Promise<ProjectDetail | null> {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.provider, provider), eq(schema.projects.repoId, repoId)));

  if (!project) return null;

  const featureRows = await db
    .select()
    .from(schema.features)
    .where(eq(schema.features.projectId, project.id))
    .orderBy(schema.features.featureId);

  const todosByFeature = await loadTodosByFeature(
    db,
    featureRows.map((feature) => feature.id),
  );

  return {
    provider: project.provider,
    repoId: project.repoId,
    name: project.name,
    features: featureRows.map((feature) => ({
      featureId: feature.featureId,
      title: feature.title,
      status: feature.status,
      estimateHours: feature.estimateHours,
      hoursLogged: feature.hoursLogged,
      openPrs: feature.openPrs,
      environment: feature.environment,
      type: feature.type,
      severity: feature.severity,
      relatesTo: feature.relatesTo,
      todos: todosByFeature.get(feature.id) ?? [],
    })),
  };
}

async function loadTodosByFeature(
  db: Tx,
  featureIds: string[],
): Promise<Map<string, ProjectDetailTodo[]>> {
  const todosByFeature = new Map<string, ProjectDetailTodo[]>();
  if (featureIds.length === 0) return todosByFeature;

  const todoRows = await db
    .select({
      featureId: schema.todos.featureId,
      todoId: schema.todos.todoId,
      title: schema.todos.title,
      done: schema.todos.done,
      owner: schema.assignees.handle,
      estimateHours: schema.todos.estimateHours,
      due: schema.todos.due,
    })
    .from(schema.todos)
    .innerJoin(schema.assignees, eq(schema.todos.ownerId, schema.assignees.id))
    .where(inArray(schema.todos.featureId, featureIds))
    .orderBy(schema.todos.todoId);

  for (const row of todoRows) {
    const list = todosByFeature.get(row.featureId) ?? [];
    list.push({
      todoId: row.todoId,
      title: row.title,
      done: row.done,
      owner: row.owner,
      estimateHours: row.estimateHours,
      due: row.due,
    });
    todosByFeature.set(row.featureId, list);
  }

  return todosByFeature;
}

function repoKey(provider: string, repoId: string): string {
  return `${provider} ${repoId}`;
}

export interface ProjectScope {
  provider?: string;
  repoId?: string;
}

function projectScopeFilter(scope: ProjectScope | undefined) {
  const clauses = [];
  if (scope?.provider) clauses.push(eq(schema.projects.provider, scope.provider));
  if (scope?.repoId) clauses.push(eq(schema.projects.repoId, scope.repoId));
  return clauses.length > 0 ? and(...clauses) : undefined;
}

export interface FeaturesCompletedPerWeek {
  provider: string;
  repoId: string;
  week: string;
  count: number;
}

/**
 * A feature counts once, in the week it first flipped to `done` — later weeks
 * where it stays done (or is reopened and redone) don't recount it
 * (docs/features/p0-reports.md decision log).
 */
export async function listFeaturesCompletedPerWeek(
  db: Tx,
  scope?: ProjectScope,
): Promise<FeaturesCompletedPerWeek[]> {
  const doneEvents = await db
    .select({
      featureId: schema.statusEvents.featureId,
      week: schema.statusEvents.week,
      recordedAt: schema.statusEvents.recordedAt,
      provider: schema.projects.provider,
      repoId: schema.projects.repoId,
    })
    .from(schema.statusEvents)
    .innerJoin(schema.features, eq(schema.statusEvents.featureId, schema.features.id))
    .innerJoin(schema.projects, eq(schema.features.projectId, schema.projects.id))
    .where(and(eq(schema.statusEvents.status, "done"), projectScopeFilter(scope)))
    .orderBy(asc(schema.statusEvents.featureId), asc(schema.statusEvents.recordedAt));

  const firstDoneByFeature = new Map<string, (typeof doneEvents)[number]>();
  for (const event of doneEvents) {
    if (!firstDoneByFeature.has(event.featureId)) {
      firstDoneByFeature.set(event.featureId, event);
    }
  }

  const countByKey = new Map<string, FeaturesCompletedPerWeek>();
  for (const event of firstDoneByFeature.values()) {
    const key = `${event.provider} ${event.repoId} ${event.week}`;
    const existing = countByKey.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      countByKey.set(key, {
        provider: event.provider,
        repoId: event.repoId,
        week: event.week,
        count: 1,
      });
    }
  }

  return [...countByKey.values()];
}

export interface EstimationDriftPoint {
  provider: string;
  repoId: string;
  week: string;
  estimateHours: number;
  hoursLogged: number;
  drift: number;
}

/**
 * Estimate vs actual per feature per week, joined on the append-only
 * `estimates`/`actuals` history (schema.ts) so a mid-flight re-estimate shows
 * up as that week's drift rather than being reconciled against the original
 * estimate (docs/features/p0-reports.md decision log).
 */
export async function listEstimationDrift(
  db: Tx,
  scope?: ProjectScope,
): Promise<EstimationDriftPoint[]> {
  const rows = await db
    .select({
      provider: schema.projects.provider,
      repoId: schema.projects.repoId,
      week: schema.estimates.week,
      estimateHours: schema.estimates.estimateHours,
      hoursLogged: schema.actuals.hoursLogged,
    })
    .from(schema.estimates)
    .innerJoin(
      schema.actuals,
      and(eq(schema.actuals.featureId, schema.estimates.featureId), eq(schema.actuals.week, schema.estimates.week)),
    )
    .innerJoin(schema.features, eq(schema.estimates.featureId, schema.features.id))
    .innerJoin(schema.projects, eq(schema.features.projectId, schema.projects.id))
    .where(projectScopeFilter(scope))
    .orderBy(asc(schema.estimates.week));

  return rows.map((row) => ({
    ...row,
    drift: row.hoursLogged - row.estimateHours,
  }));
}

export interface DeveloperAllocation {
  owner: string;
  openTodoCount: number;
  openEstimateHours: number;
}

/**
 * Open (not done) todo count and summed estimate hours per assignee, across
 * every project in scope. Reflects current backlog load, not historical
 * throughput (docs/features/p0-reports.md).
 */
export async function listDeveloperAllocation(
  db: Tx,
  scope?: ProjectScope,
): Promise<DeveloperAllocation[]> {
  const rows = await db
    .select({
      owner: schema.assignees.handle,
      openTodoCount: sql<number>`count(*)::int`,
      openEstimateHours: sql<number>`coalesce(sum(${schema.todos.estimateHours}), 0)::float`,
    })
    .from(schema.todos)
    .innerJoin(schema.assignees, eq(schema.todos.ownerId, schema.assignees.id))
    .innerJoin(schema.features, eq(schema.todos.featureId, schema.features.id))
    .innerJoin(schema.projects, eq(schema.features.projectId, schema.projects.id))
    .where(and(eq(schema.todos.done, false), projectScopeFilter(scope)))
    .groupBy(schema.assignees.handle)
    .orderBy(asc(schema.assignees.handle));

  return rows;
}
