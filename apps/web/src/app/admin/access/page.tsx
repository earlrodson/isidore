import { notFound, redirect } from "next/navigation";
import { listAllAccessGrants, listProjectOptions } from "@isidore/db";
import { getDb } from "@/lib/db";
import { getCurrentViewer, isAdminEmail } from "@/lib/current-viewer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

/** AC-010: reachable only when the logged-in viewer's email is in
 * ISIDORE_ADMIN_EMAILS — notFound() otherwise, never a 403 (no signal that
 * the page exists for a non-admin). */
export default async function AdminAccessPage() {
  const viewer = await getCurrentViewer();
  if (!viewer) {
    redirect("/login");
  }
  if (!isAdminEmail(viewer.email)) {
    notFound();
  }

  const db = getDb();
  const [projects, grants] = await Promise.all([listProjectOptions(db), listAllAccessGrants(db)]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Repo access</h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Grant access</CardTitle>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects onboarded yet.</p>
          ) : (
            <form action="/api/admin/access" method="POST" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="action" value="grant" />
              <div className="flex flex-col gap-1">
                <Label htmlFor="grant-email">Email</Label>
                <Input id="grant-email" type="email" name="email" required placeholder="pm@client.com" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="grant-project">Project</Label>
                <select
                  id="grant-project"
                  name="projectId"
                  required
                  className="h-9 rounded-md border border-input bg-card px-3 text-sm"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} ({project.provider}/{project.repoId})
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" size="sm">
                Grant
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <h2 className="mb-3 text-lg font-semibold tracking-tight">Current grants</h2>
      {grants.length === 0 ? (
        <p className="text-sm text-muted-foreground">No grants yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Project</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.map((grant) => (
              <TableRow key={`${grant.email}/${grant.projectId}`}>
                <TableCell>{grant.email}</TableCell>
                <TableCell>
                  {grant.name} ({grant.provider}/{grant.repoId})
                </TableCell>
                <TableCell>
                  <form action="/api/admin/access" method="POST">
                    <input type="hidden" name="action" value="revoke" />
                    <input type="hidden" name="email" value={grant.email} />
                    <input type="hidden" name="projectId" value={grant.projectId} />
                    <Button type="submit" variant="destructive" size="sm">
                      Revoke
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
