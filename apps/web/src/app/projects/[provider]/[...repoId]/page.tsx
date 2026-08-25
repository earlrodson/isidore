import { notFound } from "next/navigation";
import {
  getProjectDetail,
  listDeveloperAllocation,
  listEstimationDrift,
  listFeaturesCompletedPerWeek,
} from "@isidore/db";
import { getDb } from "@/lib/db";
import { formatDrift, formatHours } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

interface ProjectDetailPageProps {
  params: Promise<{ provider: string; repoId: string[] }>;
}

function statusBadgeVariant(status: string): "success" | "destructive" | "secondary" {
  if (status === "done") return "success";
  if (status === "blocked") return "destructive";
  return "secondary";
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
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{project.name}</h1>

      {project.features.length === 0 ? (
        <p className="text-sm text-muted-foreground">No features pushed yet.</p>
      ) : (
        <div className="mb-10 flex flex-col gap-4">
          {project.features.map((feature) => (
            <Card key={feature.featureId}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {feature.type && <Badge variant="outline">{feature.type}</Badge>}
                  <span>{feature.title}</span>
                  <Badge variant={statusBadgeVariant(feature.status)}>{feature.status}</Badge>
                  <Badge variant="secondary">{feature.environment ?? "unknown"}</Badge>
                  {feature.severity && <Badge variant="destructive">{feature.severity}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p className="text-muted-foreground">
                  Hours logged: {formatHours(feature.hoursLogged)} /{" "}
                  {formatHours(feature.estimateHours)}
                </p>
                <p className="text-muted-foreground">
                  Open PRs: {Array.isArray(feature.openPrs) ? feature.openPrs.length : 0}
                </p>
                {Array.isArray(feature.relatesTo) && feature.relatesTo.length > 0 ? (
                  <p className="text-muted-foreground">
                    Relates to: {(feature.relatesTo as string[]).join(", ")}
                  </p>
                ) : null}
                <ul className="flex flex-col gap-1">
                  {feature.todos.map((todo) => (
                    <li key={todo.todoId} className="flex items-center gap-2">
                      <input type="checkbox" checked={todo.done} readOnly className="accent-primary" />
                      <span className={todo.done ? "text-muted-foreground line-through" : undefined}>
                        {todo.title} (@{todo.owner}
                        {todo.due ? `, due ${todo.due}` : ""})
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold tracking-tight">Completed per week</h2>
      {completedPerWeek.length === 0 ? (
        <p className="mb-8 text-sm text-muted-foreground">No completions recorded yet.</p>
      ) : (
        <Table className="mb-8">
          <TableHeader>
            <TableRow>
              <TableHead>Week</TableHead>
              <TableHead>Completed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {completedPerWeek.map((row) => (
              <TableRow key={row.week}>
                <TableCell>{row.week}</TableCell>
                <TableCell>{row.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <h2 className="mb-3 text-lg font-semibold tracking-tight">Estimation drift</h2>
      {estimationDrift.length === 0 ? (
        <p className="mb-8 text-sm text-muted-foreground">No estimate/actual history yet.</p>
      ) : (
        <Table className="mb-8">
          <TableHeader>
            <TableRow>
              <TableHead>Week</TableHead>
              <TableHead>Estimate (h)</TableHead>
              <TableHead>Logged (h)</TableHead>
              <TableHead>Drift (h)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {estimationDrift.map((row) => (
              <TableRow key={row.week}>
                <TableCell>{row.week}</TableCell>
                <TableCell>{formatHours(row.estimateHours)}</TableCell>
                <TableCell>{formatHours(row.hoursLogged)}</TableCell>
                <TableCell>{formatDrift(row.drift)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <h2 className="mb-3 text-lg font-semibold tracking-tight">Developer allocation</h2>
      {allocation.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open todos.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Owner</TableHead>
              <TableHead>Open todos</TableHead>
              <TableHead>Open estimate (h)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allocation.map((row) => (
              <TableRow key={row.owner}>
                <TableCell>{row.owner}</TableCell>
                <TableCell>{row.openTodoCount}</TableCell>
                <TableCell>{formatHours(row.openEstimateHours)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
