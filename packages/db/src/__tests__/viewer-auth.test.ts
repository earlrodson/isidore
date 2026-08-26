import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../client.js";
import * as schema from "../schema.js";
import {
  consumeMagicLink,
  createMagicLink,
  grantRepoAccess,
  isEmailGrantedToProject,
  listAccessibleProjectsForEmail,
  listAllAccessGrants,
  revokeRepoAccess,
} from "../viewer-auth.js";

const databaseUrl =
  process.env.DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/isidore_test`;

let db: Db;

async function truncateAll(database: Db) {
  await database.execute(
    sql`truncate table magic_links, viewer_sessions, repo_access, projects cascade`,
  );
}

beforeEach(async () => {
  db = createDb(databaseUrl);
  await truncateAll(db);
});

afterAll(async () => {
  await truncateAll(db);
});

describe("consumeMagicLink", () => {
  it("returns the bound email for a fresh, unexpired token", async () => {
    await createMagicLink(db, {
      email: "pm@client.com",
      tokenHash: "hash-1",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(await consumeMagicLink(db, "hash-1")).toBe("pm@client.com");
  });

  it("cannot be used a second time (single-use)", async () => {
    await createMagicLink(db, {
      email: "pm@client.com",
      tokenHash: "hash-2",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(await consumeMagicLink(db, "hash-2")).toBe("pm@client.com");
    expect(await consumeMagicLink(db, "hash-2")).toBeNull();
  });

  it("rejects an expired token", async () => {
    await createMagicLink(db, {
      email: "pm@client.com",
      tokenHash: "hash-3",
      expiresAt: new Date(Date.now() - 1000),
    });

    expect(await consumeMagicLink(db, "hash-3")).toBeNull();
  });

  it("rejects an unknown token", async () => {
    expect(await consumeMagicLink(db, "no-such-hash")).toBeNull();
  });
});

describe("repo access grants", () => {
  it("grants access, then lists it for that email only", async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ provider: "github", repoId: "acme/repo", name: "repo" })
      .returning();

    await grantRepoAccess(db, { email: "pm@client.com", projectId: project.id });

    expect(await listAccessibleProjectsForEmail(db, "pm@client.com")).toEqual([
      { provider: "github", repoId: "acme/repo" },
    ]);
    expect(await listAccessibleProjectsForEmail(db, "other@client.com")).toEqual([]);
    expect(
      await isEmailGrantedToProject(db, { email: "pm@client.com", provider: "github", repoId: "acme/repo" }),
    ).toBe(true);
  });

  it("granting the same email/project twice does not duplicate the grant", async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ provider: "github", repoId: "acme/repo", name: "repo" })
      .returning();

    await grantRepoAccess(db, { email: "pm@client.com", projectId: project.id });
    await grantRepoAccess(db, { email: "pm@client.com", projectId: project.id });

    expect(await listAccessibleProjectsForEmail(db, "pm@client.com")).toHaveLength(1);
  });

  it("revoking removes access immediately", async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ provider: "github", repoId: "acme/repo", name: "repo" })
      .returning();

    await grantRepoAccess(db, { email: "pm@client.com", projectId: project.id });
    await revokeRepoAccess(db, { email: "pm@client.com", projectId: project.id });

    expect(
      await isEmailGrantedToProject(db, { email: "pm@client.com", provider: "github", repoId: "acme/repo" }),
    ).toBe(false);
  });

  it("listAllAccessGrants includes the project name for the admin UI", async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ provider: "github", repoId: "acme/repo", name: "repo" })
      .returning();
    await grantRepoAccess(db, { email: "pm@client.com", projectId: project.id });

    expect(await listAllAccessGrants(db)).toMatchObject([
      { email: "pm@client.com", provider: "github", repoId: "acme/repo", name: "repo" },
    ]);
  });
});
