import { createDb, schema, type Db } from "@isidore/db";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const databaseUrl =
  process.env.DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/isidore_test`;
process.env.DATABASE_URL = databaseUrl;

const sendMagicLinkEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/mailer", () => ({
  sendMagicLinkEmail: (...args: unknown[]) => sendMagicLinkEmail(...args),
}));

const { POST } = await import("../route.js");

let db: Db;

async function truncateAll(database: Db) {
  await database.execute(sql`truncate table magic_links cascade`);
}

function requestWith(body: unknown) {
  return new NextRequest("http://localhost/api/auth/magic-link/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  db = createDb(databaseUrl);
  await truncateAll(db);
});

afterEach(() => {
  sendMagicLinkEmail.mockClear();
});

afterAll(async () => {
  await truncateAll(db);
});

describe("POST /api/auth/magic-link/request", () => {
  it("issues a magic link and emails it for a well-formed, unknown email (AC-004)", async () => {
    const response = await POST(requestWith({ email: "pm@client.com" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(sendMagicLinkEmail).toHaveBeenCalledTimes(1);
    expect(sendMagicLinkEmail).toHaveBeenCalledWith(
      "pm@client.com",
      expect.stringContaining("/api/auth/magic-link/verify?token="),
    );

    const [row] = await db.select().from(schema.magicLinks);
    expect(row.email).toBe("pm@client.com");
  });

  it("responds identically for a well-formed email with no prior history vs. none needed (no enumeration)", async () => {
    const first = await POST(requestWith({ email: "unknown@client.com" }));
    const second = await POST(requestWith({ email: "unknown@client.com" }));

    expect(await first.json()).toEqual(await second.json());
    expect(first.status).toBe(second.status);
  });

  it("does not create a magic link or send an email for a malformed address", async () => {
    const response = await POST(requestWith({ email: "not-an-email" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(sendMagicLinkEmail).not.toHaveBeenCalled();

    const rows = await db.select().from(schema.magicLinks);
    expect(rows).toHaveLength(0);
  });

  it("responds 200 with no email created for a missing/non-string body", async () => {
    const response = await POST(requestWith({}));

    expect(response.status).toBe(200);
    expect(sendMagicLinkEmail).not.toHaveBeenCalled();
  });
});
