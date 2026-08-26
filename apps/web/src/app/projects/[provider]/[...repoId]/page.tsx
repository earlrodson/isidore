import { notFound } from "next/navigation";
import {
  getProjectDetail,
  listDeveloperAllocation,
  listEstimationDrift,
  listFeaturesCompletedPerWeek,
} from "@isidore/db";
import { getDb } from "@/lib/db";
import { formatDrift, formatHours } from "@/lib/format";
import { FeatureFilters } from "@/components/features/feature-filters";
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
        <p className="mb-10 text-sm text-muted-foreground">No features pushed yet.</p>
      ) : (
        <FeatureFilters features={project.features} />
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
