import type { DeveloperAllocation } from "@isidore/db";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatHours } from "@/lib/format";
import { cn } from "@/lib/cn";

export function AllocationSection({
  rows,
  highlightIds,
}: {
  rows: DeveloperAllocation[];
  highlightIds: string[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No open todos.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Owner</TableHead>
          <TableHead>Open todos</TableHead>
          <TableHead>Open estimate (h)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.owner} className={cn(highlightIds.includes(row.owner) && "bg-accent")}>
            <TableCell>{row.owner}</TableCell>
            <TableCell>{row.openTodoCount}</TableCell>
            <TableCell>{formatHours(row.openEstimateHours)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
