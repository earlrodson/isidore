import { notFound } from "next/navigation";
import {
  getProjectDetail,
  listDeveloperAllocation,
  listEstimationDrift,
  listFeaturesCompletedPerWeek,
} from "@isidore/db";
import { getDb } from "@/lib/db";
import { formatDrift, formatHours } from "@/lib/format";

export const dynamic = "force-dynamic";

interface ProjectDetailPageProps {
  params: Promise<{ provider: string; repoId: string[] }>;
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { provider, repoId: repoIdSegments } = await params;
  const repoId = repoIdSegments.join("/");

  const db = getDb();
  const scope = { provider, repoId };
  const [project, completedPerWeek, estimationDrift, allocation] = await Promise.all([
    getProjectDetail(db, provider, repoId),
    listFeaturesCompletedPerWeek(db, scope),
    listEstimationDrift(db, scope),
    listDeveloperAllocation(db, scope),
  ]);
  if (!project) {
    notFound();
  }

  return (
    <main>
      <h1>{project.name}</h1>
      {project.features.length === 0 ? (
        <p>No features pushed yet.</p>
      ) : (
        project.features.map((feature) => (
          <section key={feature.featureId}>
            <h2>
              {feature.type ? `[${feature.type}] ` : ""}
              {feature.title} — {feature.status} [{feature.environment ?? "unknown"}]
              {feature.severity ? ` (severity: ${feature.severity})` : ""}
            </h2>
            <p>
              Hours logged: {formatHours(feature.hoursLogged)} / {formatHours(feature.estimateHours)}
            </p>
            <p>Open PRs: {Array.isArray(feature.openPrs) ? feature.openPrs.length : 0}</p>
            {Array.isArray(feature.relatesTo) && feature.relatesTo.length > 0 ? (
              <p>Relates to: {(feature.relatesTo as string[]).join(", ")}</p>
            ) : null}
            <ul>
              {feature.todos.map((todo) => (
                <li key={todo.todoId}>
                  [{todo.done ? "x" : " "}] {todo.title} (@{todo.owner}
                  {todo.due ? `, due ${todo.due}` : ""})
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <h2>Completed per week</h2>
      {completedPerWeek.length === 0 ? (
        <p>No completions recorded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Week</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
            {completedPerWeek.map((row) => (
              <tr key={row.week}>
                <td>{row.week}</td>
                <td>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Estimation drift</h2>
      {estimationDrift.length === 0 ? (
        <p>No estimate/actual history yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Week</th>
              <th>Estimate (h)</th>
              <th>Logged (h)</th>
              <th>Drift (h)</th>
            </tr>
          </thead>
          <tbody>
            {estimationDrift.map((row) => (
              <tr key={row.week}>
                <td>{row.week}</td>
                <td>{formatHours(row.estimateHours)}</td>
                <td>{formatHours(row.hoursLogged)}</td>
                <td>{formatDrift(row.drift)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Developer allocation</h2>
      {allocation.length === 0 ? (
        <p>No open todos.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Owner</th>
              <th>Open todos</th>
              <th>Open estimate (h)</th>
            </tr>
          </thead>
          <tbody>
            {allocation.map((row) => (
              <tr key={row.owner}>
                <td>{row.owner}</td>
                <td>{row.openTodoCount}</td>
                <td>{formatHours(row.openEstimateHours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
