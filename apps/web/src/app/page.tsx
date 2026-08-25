import Link from "next/link";
import {
  listDeveloperAllocation,
  listEstimationDrift,
  listFeaturesCompletedPerWeek,
  listProjectSummaries,
} from "@isidore/db";
import { getDb } from "@/lib/db";
import { formatDrift, formatHours } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

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
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Isidore</h1>

      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="completions">Completions / week</TabsTrigger>
          <TabsTrigger value="drift">Estimation drift</TabsTrigger>
          <TabsTrigger value="allocation">Allocation</TabsTrigger>
        </TabsList>

        <TabsContent value="projects">
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects onboarded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Features done</TableHead>
                  <TableHead>Stale todos</TableHead>
                  <TableHead>Last snapshot</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={`${project.provider}/${project.repoId}`}>
                    <TableCell>
                      <Link
                        href={`/projects/${project.provider}/${project.repoId}`}
                        className="font-medium hover:underline"
                      >
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {project.featuresDone}/{project.featuresTotal}
                    </TableCell>
                    <TableCell>
                      {project.staleTodoCount > 0 ? (
                        <Badge variant="destructive">{project.staleTodoCount}</Badge>
                      ) : (
                        <Badge variant="success">0</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {project.lastReceivedAt ? project.lastReceivedAt.toISOString() : "never"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="completions">
          {completedPerWeek.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completions recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Week</TableHead>
                  <TableHead>Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedPerWeek.map((row) => (
                  <TableRow key={`${row.provider}/${row.repoId}/${row.week}`}>
                    <TableCell>{row.repoId}</TableCell>
                    <TableCell>{row.week}</TableCell>
                    <TableCell>{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="drift">
          {estimationDrift.length === 0 ? (
            <p className="text-sm text-muted-foreground">No estimate/actual history yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Week</TableHead>
                  <TableHead>Estimate (h)</TableHead>
                  <TableHead>Logged (h)</TableHead>
                  <TableHead>Drift (h)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estimationDrift.map((row) => (
                  <TableRow key={`${row.provider}/${row.repoId}/${row.week}`}>
                    <TableCell>{row.repoId}</TableCell>
                    <TableCell>{row.week}</TableCell>
                    <TableCell>{formatHours(row.estimateHours)}</TableCell>
                    <TableCell>{formatHours(row.hoursLogged)}</TableCell>
                    <TableCell>{formatDrift(row.drift)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="allocation">
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
        </TabsContent>
      </Tabs>
    </main>
  );
}
