import { createDb, schema, upsertRepoSecret, writeFeatureSnapshot, type Db } from "@isidore/db";
import { parseIngestPayload } from "@isidore/shared";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { computeSignature } from "../../../../../lib/ingest-auth.js";
import { POST } from "../route.js";

const databaseUrl =
  process.env.DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/isidore_test`;
process.env.DATABASE_URL = databaseUrl;

const secret = "test-secret";
const provider = "github";
const repoId = "your-org/project-1";

let db: Db;

async function truncateAll(database: Db) {
  await database.execute(
    sql`truncate table snapshots, environment_pings, status_events, actuals, estimates, todos, feature_assignees, features, assignees, projects, repo_secrets, ingest_nonces cascade`,
  );
}

function signedRequest(
  rawBody: string,
  overrides: Partial<{ timestamp: string; nonce: string; signature: string }> = {},
) {
  const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = overrides.nonce ?? "nonce-1";
  const signature = overrides.signature ?? computeSignature(secret, { timestamp, nonce, rawBody });

  return new NextRequest("http://localhost/api/ingest/environment", {
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

function pingBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    environment_ping_schema_version: "1.0",
    provider,
    repo_id: repoId,
    project: "project-1",
    environment: "staging",
    commit_sha: "stage123",
    generated_at: "2026-08-25T09:00:00Z",
    timezone: "UTC",
    feature_ids: ["auth-refresh"],
    ...overrides,
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

describe("POST /api/ingest/environment", () => {
  it("advances a known feature's environment (AC-008/009)", async () => {
    const snapshot = parseIngestPayload({
      payload_schema_version: "1.3",
      provider,
      repo_id: repoId,
      project: "project-1",
      week: "2026-W34",
      base_branch: "develop",
      commit_sha: "dev1",
      generated_at: "2026-08-18T09:00:00Z",
      timezone: "UTC",
      features: [
        {
          feature_id: "auth-refresh",
          title: "Refresh token rotation",
          prd_ref: "docs/PRD.md#4.2",
          status: "implementing",
          owners: ["dev-a"],
          estimate_hours: 8,
          hours_logged: 0,
          todos: [],
          open_prs: [],
        },
      ],
    });
    await writeFeatureSnapshot(db, snapshot, snapshot.features[0]);

    const response = await POST(signedRequest(pingBody()));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: "ok", written: true });

    const [featureRow] = await db.select().from(schema.features);
    expect(featureRow.environment).toBe("staging");
  });

  it("never writes to the snapshots table — only /api/ingest does that", async () => {
    await POST(signedRequest(pingBody()));

    const snapshotRows = await db.select().from(schema.snapshots);
    expect(snapshotRows).toHaveLength(0);

    const pingRows = await db.select().from(schema.environmentPings);
    expect(pingRows).toHaveLength(1);
  });

  it("rejects a bad signature", async () => {
    const response = await POST(signedRequest(pingBody(), { signature: "0".repeat(64) }));
    expect(response.status).toBe(401);
  });

  it("rejects an unknown environment_ping_schema_version", async () => {
    const response = await POST(
      signedRequest(pingBody({ environment_ping_schema_version: "99.0" })),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a replayed nonce", async () => {
    const body = pingBody();
    const timestamp = String(Math.floor(Date.now() / 1000));

    const first = await POST(signedRequest(body, { timestamp, nonce: "reused" }));
    expect(first.status).toBe(200);

    const second = await POST(signedRequest(body, { timestamp, nonce: "reused" }));
    expect(second.status).toBe(401);
  });
});
