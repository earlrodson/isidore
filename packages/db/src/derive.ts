import { and, eq, notInArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Feature } from "@isidore/shared";
import * as schema from "./schema.js";

type Tx = NodePgDatabase<typeof schema>;

/**
 * Derives normalized rows for a single stored `snapshots` row. Deterministic:
 * re-running against the same row always leaves the normalized tables in the
 * same state, which is what lets a full replay (see `replayAll`) rebuild them
 * from scratch after a parser fix or metric change (TECHSTACK.md §4.2).
 */
export async function deriveSnapshot(
  tx: Tx,
  snapshot: {
    provider: string;
    repoId: string;
    project: string;
    week: string;
    generatedAt: Date;
    raw: unknown;
  },
): Promise<void> {
  const feature = snapshot.raw as Feature;

  const [project] = await tx
    .insert(schema.projects)
    .values({ provider: snapshot.provider, repoId: snapshot.repoId, name: snapshot.project })
    .onConflictDoUpdate({
      target: [schema.projects.provider, schema.projects.repoId],
      set: { name: snapshot.project, updatedAt: sql`now()` },
    })
    .returning();

  const [featureRow] = await tx
    .insert(schema.features)
    .values({
      projectId: project.id,
      featureId: feature.feature_id,
      title: feature.title,
      prdRef: feature.prd_ref,
      status: feature.status,
      estimateHours: feature.estimate_hours,
      hoursLogged: feature.hours_logged,
      openPrs: feature.open_prs,
      environment: feature.environment ?? null,
      type: feature.type ?? null,
      severity: feature.severity ?? null,
      relatesTo: feature.relates_to ?? null,
    })
    .onConflictDoUpdate({
      target: [schema.features.projectId, schema.features.featureId],
      set: {
        title: feature.title,
        prdRef: feature.prd_ref,
        status: feature.status,
        estimateHours: feature.estimate_hours,
        hoursLogged: feature.hours_logged,
        openPrs: feature.open_prs,
        environment: feature.environment ?? null,
        type: feature.type ?? null,
        severity: feature.severity ?? null,
        relatesTo: feature.relates_to ?? null,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  const assigneeIds = await upsertAssignees(tx, feature.owners);
  await syncFeatureAssignees(tx, featureRow.id, assigneeIds);
  await syncTodos(tx, featureRow.id, feature.todos);

  await tx
    .insert(schema.estimates)
    .values({
      featureId: featureRow.id,
      week: snapshot.week,
      estimateHours: feature.estimate_hours,
      recordedAt: snapshot.generatedAt,
    })
    .onConflictDoUpdate({
      target: [schema.estimates.featureId, schema.estimates.week],
      set: { estimateHours: feature.estimate_hours, recordedAt: snapshot.generatedAt },
    });

  await tx
    .insert(schema.actuals)
    .values({
      featureId: featureRow.id,
      week: snapshot.week,
      hoursLogged: feature.hours_logged,
      recordedAt: snapshot.generatedAt,
    })
    .onConflictDoUpdate({
      target: [schema.actuals.featureId, schema.actuals.week],
      set: { hoursLogged: feature.hours_logged, recordedAt: snapshot.generatedAt },
    });

  await tx
    .insert(schema.statusEvents)
    .values({
      featureId: featureRow.id,
      week: snapshot.week,
      status: feature.status,
      recordedAt: snapshot.generatedAt,
    })
    .onConflictDoUpdate({
      target: [schema.statusEvents.featureId, schema.statusEvents.week],
      set: { status: feature.status, recordedAt: snapshot.generatedAt },
    });
}

async function upsertAssignees(tx: Tx, handles: readonly string[]): Promise<string[]> {
  if (handles.length === 0) return [];
  const rows = await tx
    .insert(schema.assignees)
    .values(handles.map((handle) => ({ handle })))
    .onConflictDoUpdate({
      target: schema.assignees.handle,
      set: { handle: sql`excluded.handle` },
    })
    .returning();
  return rows.map((row) => row.id);
}

/** Replaces a feature's owner links wholesale, since a snapshot is a full
 * refresh, not a delta (PRD.md §6.2). */
async function syncFeatureAssignees(
  tx: Tx,
  featureId: string,
  assigneeIds: string[],
): Promise<void> {
  if (assigneeIds.length === 0) {
    await tx.delete(schema.featureAssignees).where(eq(schema.featureAssignees.featureId, featureId));
    return;
  }
  await tx
    .delete(schema.featureAssignees)
    .where(
      and(
        eq(schema.featureAssignees.featureId, featureId),
        notInArray(schema.featureAssignees.assigneeId, assigneeIds),
      ),
    );
  await tx
    .insert(schema.featureAssignees)
    .values(assigneeIds.map((assigneeId) => ({ featureId, assigneeId })))
    .onConflictDoNothing();
}

async function syncTodos(tx: Tx, featureId: string, todos: Feature["todos"]): Promise<void> {
  const todoIds = todos.map((todo) => todo.todo_id);
  if (todoIds.length === 0) {
    await tx.delete(schema.todos).where(eq(schema.todos.featureId, featureId));
    return;
  }
  await tx
    .delete(schema.todos)
    .where(and(eq(schema.todos.featureId, featureId), notInArray(schema.todos.todoId, todoIds)));

  for (const todo of todos) {
    const [ownerId] = await upsertAssignees(tx, [todo.owner]);
    await tx
      .insert(schema.todos)
      .values({
        featureId,
        todoId: todo.todo_id,
        title: todo.title,
        done: todo.done,
        ownerId,
        estimateHours: todo.estimate_hours,
        due: todo.due,
      })
      .onConflictDoUpdate({
        target: [schema.todos.featureId, schema.todos.todoId],
        set: {
          title: todo.title,
          done: todo.done,
          ownerId,
          estimateHours: todo.estimate_hours,
          due: todo.due,
          updatedAt: sql`now()`,
        },
      });
  }
}

/**
 * Rebuilds every normalized table from the stored `snapshots` rows, in
 * receipt order. Used to replay after a parser fix or metric change without
 * asking every repo to re-run CI (TECHSTACK.md §4.2).
 */
export async function replayAll(db: NodePgDatabase<typeof schema>): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`truncate table ${schema.statusEvents}, ${schema.actuals}, ${schema.estimates}, ${schema.todos}, ${schema.featureAssignees}, ${schema.features}, ${schema.assignees}, ${schema.projects} cascade`,
    );
    const rows = await tx.select().from(schema.snapshots).orderBy(schema.snapshots.receivedAt);
    for (const row of rows) {
      await deriveSnapshot(tx, row);
    }
  });
}
