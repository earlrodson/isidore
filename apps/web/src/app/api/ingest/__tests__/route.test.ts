import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDb, schema, upsertRepoSecret, type Db } from "@isidore/db";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { computeSignature } from "../../../../lib/ingest-auth.js";
import { POST } from "../route.js";

const databaseUrl =
  process.env.DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/isidore_test`;
process.env.DATABASE_URL = databaseUrl;

const secret = "test-secret";
const provider = "github";
const repoId = "your-org/project-1";

const loadFixture = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../../../packages/shared/fixtures/${name}`, import.meta.url)),
    "utf8",
  );

let db: Db;

async function truncateAll(database: Db) {
  await database.execute(
    sql`truncate table snapshots, status_events, actuals, estimates, todos, feature_assignees, features, assignees, projects, repo_secrets, ingest_nonces cascade`,
  );
}

function signedRequest(rawBody: string, overrides: Partial<{ timestamp: string; nonce: string; signature: string }> = {}) {
  const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = overrides.nonce ?? "nonce-1";
  const signature = overrides.signature ?? computeSignature(secret, { timestamp, nonce, rawBody });

  return new NextRequest("http://localhost/api/ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-isidore-timestamp": timestamp,
      "x-isidore-nonce": nonce,
      "x-isidore-signature": signature,
    },
    body: rawBody,
  });
}

beforeEach(async () => {
  db = createDb(databaseUrl);
  await truncateAll(db);
  await upsertRepoSecret(db, { provider, repoId, secret });
});

afterAll(async () => {
  await truncateAll(db);
});

describe("POST /api/ingest", () => {
  it("accepts a validly signed payload and writes the snapshot", async () => {
    const rawBody = loadFixture("valid.json");

    const response = await POST(signedRequest(rawBody));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: "ok", written: 1 });

    const [snapshot] = await db.select().from(schema.snapshots);
    expect(snapshot.featureId).toBe("auth-refresh");
  });

  it("is idempotent: re-POSTing the same payload overwrites, never duplicates", async () => {
    const rawBody = loadFixture("valid.json");

    await POST(signedRequest(rawBody, { nonce: "nonce-1" }));
    await POST(signedRequest(rawBody, { nonce: "nonce-2" }));

    const rows = await db.select().from(schema.snapshots);
    expect(rows).toHaveLength(1);
  });

  it("rejects a bad signature", async () => {
    const rawBody = loadFixture("valid.json");

    const response = await POST(signedRequest(rawBody, { signature: "0".repeat(64) }));

    expect(response.status).toBe(401);
    const rows = await db.select().from(schema.snapshots);
    expect(rows).toHaveLength(0);
  });

  it("rejects a timestamp outside the replay window", async () => {
    const rawBody = loadFixture("valid.json");
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 3600);

    const response = await POST(signedRequest(rawBody, { timestamp: staleTimestamp }));

    expect(response.status).toBe(401);
  });

  it("rejects a replayed nonce", async () => {
    const rawBody = loadFixture("valid.json");
    const timestamp = String(Math.floor(Date.now() / 1000));

    const first = await POST(signedRequest(rawBody, { timestamp, nonce: "reused" }));
    expect(first.status).toBe(200);

    const second = await POST(signedRequest(rawBody, { timestamp, nonce: "reused" }));
    expect(second.status).toBe(401);
  });

  it("rejects an unknown payload_schema_version without partially writing", async () => {
    const payload = JSON.parse(loadFixture("valid.json"));
    payload.payload_schema_version = "99.0";
    const rawBody = JSON.stringify(payload);

    const response = await POST(signedRequest(rawBody));

    expect(response.status).toBe(400);
    const rows = await db.select().from(schema.snapshots);
    expect(rows).toHaveLength(0);
  });

  it("rejects a request for an unknown repo", async () => {
    const payload = JSON.parse(loadFixture("valid.json"));
    payload.repo_id = "your-org/unknown-repo";
    const rawBody = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = "nonce-unknown";
    const signature = computeSignature(secret, { timestamp, nonce, rawBody });

    const response = await POST(
      new NextRequest("http://localhost/api/ingest", {
        method: "POST",
        headers: {
          "x-isidore-timestamp": timestamp,
          "x-isidore-nonce": nonce,
          "x-isidore-signature": signature,
        },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(401);
  });
});
