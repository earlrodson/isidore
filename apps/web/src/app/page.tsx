import Link from "next/link";
import {
  listDeveloperAllocation,
  listEstimationDrift,
  listFeaturesCompletedPerWeek,
  listProjectSummaries,
} from "@isidore/db";
import { getDb } from "@/lib/db";
import { formatDrift, formatHours } from "@/lib/format";

// Server-fetched on every request — data changes a few times a day
// (TECHSTACK.md §4.1), so there is no benefit to static generation here.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = getDb();
  const [projects, completedPerWeek, estimationDrift, allocation] = await Promise.all([
    listProjectSummaries(db),
    listFeaturesCompletedPerWeek(db),
    listEstimationDrift(db),
    listDeveloperAllocation(db),
  ]);

  return (
    <main>
      <h1>Isidore</h1>
      {projects.length === 0 ? (
        <p>No projects onboarded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Features done</th>
              <th>Stale todos</th>
              <th>Last snapshot</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={`${project.provider}/${project.repoId}`}>
                <td>
                  <Link href={`/projects/${project.provider}/${project.repoId}`}>
                    {project.name}
                  </Link>
                </td>
                <td>
                  {project.featuresDone}/{project.featuresTotal}
                </td>
                <td>{project.staleTodoCount}</td>
                <td>{project.lastReceivedAt ? project.lastReceivedAt.toISOString() : "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Features completed per week</h2>
      {completedPerWeek.length === 0 ? (
        <p>No completions recorded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Week</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
            {completedPerWeek.map((row) => (
              <tr key={`${row.provider}/${row.repoId}/${row.week}`}>
                <td>{row.repoId}</td>
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
              <th>Project</th>
              <th>Week</th>
              <th>Estimate (h)</th>
              <th>Logged (h)</th>
              <th>Drift (h)</th>
            </tr>
          </thead>
          <tbody>
            {estimationDrift.map((row) => (
              <tr key={`${row.provider}/${row.repoId}/${row.week}`}>
                <td>{row.repoId}</td>
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
