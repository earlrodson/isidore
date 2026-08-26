import { grantRepoAccess, revokeRepoAccess } from "@isidore/db";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentViewer, isAdminEmail } from "@/lib/current-viewer";

/** AC-010: grant/revoke a repo_access row from the /admin/access form.
 * Gated the same way as the page itself — a non-admin gets the same
 * not-found response as an unbound project (AC-009's no-existence-leak
 * posture), not a 403 that confirms the route exists for them. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const viewer = await getCurrentViewer();
  if (!viewer || !isAdminEmail(viewer.email)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const projectId = String(form.get("projectId") ?? "");
  const action = form.get("action") === "revoke" ? "revoke" : "grant";

  if (!email || !projectId) {
    return NextResponse.json({ error: "email and projectId are required" }, { status: 400 });
  }

  const db = getDb();
  if (action === "revoke") {
    await revokeRepoAccess(db, { email, projectId });
  } else {
    await grantRepoAccess(db, { email, projectId });
  }

  return NextResponse.redirect(new URL("/admin/access", request.url));
}
