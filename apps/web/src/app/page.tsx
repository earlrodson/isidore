import Link from "next/link";
import { listProjectSummaries } from "@isidore/db";
import { getDb } from "@/lib/db";

// Server-fetched on every request — data changes a few times a day
// (TECHSTACK.md §4.1), so there is no benefit to static generation here.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const projects = await listProjectSummaries(getDb());

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
    </main>
  );
}
