import { notFound } from "next/navigation";
import { getProjectDetail } from "@isidore/db";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ProjectDetailPageProps {
  params: Promise<{ provider: string; repoId: string[] }>;
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { provider, repoId: repoIdSegments } = await params;
  const repoId = repoIdSegments.join("/");

  const project = await getProjectDetail(getDb(), provider, repoId);
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
              {feature.title} — {feature.status}
            </h2>
            <p>
              Hours logged: {feature.hoursLogged} / {feature.estimateHours}
            </p>
            <p>Open PRs: {Array.isArray(feature.openPrs) ? feature.openPrs.length : 0}</p>
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
    </main>
  );
}
