import type { ProjectSummary } from "@isidore/db";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/cn";

export function ProjectsSection({
  rows,
  highlightIds,
}: {
  rows: ProjectSummary[];
  highlightIds: string[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No projects onboarded yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Features done</TableHead>
          <TableHead>Stale todos</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((project) => {
          const id = `${project.provider}/${project.repoId}`;
          return (
            <TableRow key={id} className={cn(highlightIds.includes(id) && "bg-accent")}>
              <TableCell className="font-medium">{project.name}</TableCell>
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
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
