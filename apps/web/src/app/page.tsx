import Link from "next/link";
import { redirect } from "next/navigation";
import {
  listAccessibleProjectsForEmail,
  listDeveloperAllocation,
  listEstimationDrift,
  listFeaturesCompletedPerWeek,
  listProjectSummaries,
} from "@isidore/db";
import { getDb } from "@/lib/db";
import { formatDrift, formatHours } from "@/lib/format";
import { getCurrentViewer } from "@/lib/current-viewer";
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
import { Button } from "@/components/ui/button";

// Server-fetched on every request — data changes a few times a day
// (TECHSTACK.md §4.1), so there is no benefit to static generation here.
export const dynamic = "force-dynamic";

function repoKey(provider: string, repoId: string): string {
  return `${provider} ${repoId}`;
}

function mergeAllocation(
  perProject: Array<Awaited<ReturnType<typeof listDeveloperAllocation>>>,
): Awaited<ReturnType<typeof listDeveloperAllocation>> {
  const byOwner = new Map<string, { owner: string; openTodoCount: number; openEstimateHours: number }>();
  for (const rows of perProject) {
    for (const row of rows) {
      const existing = byOwner.get(row.owner);
      if (existing) {
        existing.openTodoCount += row.openTodoCount;
        existing.openEstimateHours += row.openEstimateHours;
      } else {
        byOwner.set(row.owner, { ...row });
      }
    }
  }
  return Array.from(byOwner.values()).sort((a, b) => a.owner.localeCompare(b.owner));
}

export default async function HomePage() {
  const viewer = await getCurrentViewer();
  if (!viewer) {
    redirect("/login");
  }

  const db = getDb();
  const [allProjects, allCompletedPerWeek, allEstimationDrift, allAllocation, accessible] =
    await Promise.all([
      listProjectSummaries(db),
      listFeaturesCompletedPerWeek(db),
      listEstimationDrift(db),
      listDeveloperAllocation(db),
      listAccessibleProjectsForEmail(db, viewer.email),
    ]);

  // AC-008: every table is filtered down to only the projects this email
  // has a repo_access grant for, re-read fresh on every load (never cached
  // in the session) so a revoked grant disappears immediately.
  const allowed = new Set(accessible.map((project) => repoKey(project.provider, project.repoId)));
  const projects = allProjects.filter((project) => allowed.has(repoKey(project.provider, project.repoId)));
  const completedPerWeek = allCompletedPerWeek.filter((row) => allowed.has(repoKey(row.provider, row.repoId)));
  const estimationDrift = allEstimationDrift.filter((row) => allowed.has(repoKey(row.provider, row.repoId)));
  // Allocation is aggregated per-owner across every project in scope, so it
  // can't be filtered client-side the way the other tables are (an owner's
  // row would still include hours from projects this viewer can't see) —
  // re-query per accessible project and merge the sums instead.
  const allocation =
    allowed.size === allProjects.length
      ? allAllocation
      : mergeAllocation(
          await Promise.all(projects.map((project) => listDeveloperAllocation(db, project))),
        );

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Isidore</h1>
        <Button asChild size="sm">
          <Link href="/onboarding">Connect a repo</Link>
        </Button>
      </div>

      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="completions">Completions / week</TabsTrigger>
          <TabsTrigger value="drift">Estimation drift</TabsTrigger>
          <TabsTrigger value="allocation">Allocation</TabsTrigger>
        </TabsList>

        <TabsContent value="projects">
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No projects onboarded yet.{" "}
              <Link href="/onboarding" className="font-medium underline">
                Connect a repo
              </Link>{" "}
              to get started.
            </p>
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
