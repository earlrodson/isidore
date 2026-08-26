import { createDb, schema, type Db } from "@isidore/db";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const databaseUrl =
  process.env.DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/isidore_test`;
process.env.DATABASE_URL = databaseUrl;

const getCurrentViewer = vi.fn();
vi.mock("@/lib/current-viewer", async () => {
  const actual = await vi.importActual<typeof import("@/lib/current-viewer")>(
    "@/lib/current-viewer",
  );
  return {
    ...actual,
    getCurrentViewer: (...args: unknown[]) => getCurrentViewer(...args),
  };
});

const { default: AdminAccessPage } = await import("../page.js");

let db: Db;

async function truncateAll(database: Db) {
  await database.execute(sql`truncate table repo_access, projects cascade`);
}

function digestOf(error: unknown): string {
  return error && typeof error === "object" && "digest" in error
    ? String((error as { digest: unknown }).digest)
    : "";
}

beforeEach(async () => {
  db = createDb(databaseUrl);
  await truncateAll(db);
  delete process.env.ISIDORE_ADMIN_EMAILS;
});

afterEach(() => {
  getCurrentViewer.mockReset();
});

afterAll(async () => {
  await truncateAll(db);
});

describe("AdminAccessPage (AC-010)", () => {
  it("redirects a logged-out visitor to /login", async () => {
    getCurrentViewer.mockResolvedValue(null);

    const error = await AdminAccessPage().catch((thrown: unknown) => thrown);

    expect(digestOf(error)).toContain("/login");
  });

  it("404s for a logged-in non-admin viewer", async () => {
    getCurrentViewer.mockResolvedValue({ email: "pm@client.com" });
    process.env.ISIDORE_ADMIN_EMAILS = "admin@example.com";

    const error = await AdminAccessPage().catch((thrown: unknown) => thrown);

    expect(digestOf(error)).toContain("404");
  });

  it("renders the grants table for an admin viewer", async () => {
    getCurrentViewer.mockResolvedValue({ email: "admin@example.com" });
    process.env.ISIDORE_ADMIN_EMAILS = "admin@example.com";

    const [project] = await db
      .insert(schema.projects)
      .values({ provider: "github", repoId: "acme/repo", name: "repo" })
      .returning();
    await db.insert(schema.repoAccess).values({ email: "pm@client.com", projectId: project.id });

    const element = await AdminAccessPage();

    expect(JSON.stringify(element)).toContain("pm@client.com");
    expect(JSON.stringify(element)).toContain("acme/repo");
  });
});
