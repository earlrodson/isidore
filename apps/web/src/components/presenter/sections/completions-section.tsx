import type { FeaturesCompletedPerWeek } from "@isidore/db";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/cn";

export function CompletionsSection({
  rows,
  highlightIds,
}: {
  rows: FeaturesCompletedPerWeek[];
  highlightIds: string[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No completions recorded yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Week</TableHead>
          <TableHead>Completed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const id = `${row.provider}/${row.repoId}/${row.week}`;
          return (
            <TableRow key={id} className={cn(highlightIds.includes(id) && "bg-accent")}>
              <TableCell>{row.repoId}</TableCell>
              <TableCell>{row.week}</TableCell>
              <TableCell>{row.count}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
