import type { EstimationDriftPoint } from "@isidore/db";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDrift, formatHours } from "@/lib/format";
import { cn } from "@/lib/cn";

export function DriftSection({
  rows,
  highlightIds,
}: {
  rows: EstimationDriftPoint[];
  highlightIds: string[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No estimate/actual history yet.</p>;
  }
  return (
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
        {rows.map((row) => {
          const id = `${row.provider}/${row.repoId}/${row.week}`;
          return (
            <TableRow key={id} className={cn(highlightIds.includes(id) && "bg-accent")}>
              <TableCell>{row.repoId}</TableCell>
              <TableCell>{row.week}</TableCell>
              <TableCell>{formatHours(row.estimateHours)}</TableCell>
              <TableCell>{formatHours(row.hoursLogged)}</TableCell>
              <TableCell>{formatDrift(row.drift)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
