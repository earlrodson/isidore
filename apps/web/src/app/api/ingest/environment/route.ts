import { createDb, writeEnvironmentPing } from "@isidore/db";
import { UnknownEnvironmentPingSchemaVersionError, parseEnvironmentPingPayload } from "@isidore/shared";
import { NextResponse, type NextRequest } from "next/server";
import { authenticateIngestRequest } from "@/lib/ingest-auth";

/**
 * feature-environment-tracking.md AC-009 — a `staging`/`production` push's
 * environment ping lands here, never at `/api/ingest`. Deliberately its
 * own route with its own schema: the two payload shapes never mix, and a
 * bug here can't touch `/api/ingest`'s existing contract or the
 * `snapshots` raw table.
 */

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const db = createDb(databaseUrl());

  const auth = await authenticateIngestRequest(db, request);
  if (!auth.ok) {
    return auth.response;
  }

  let payload;
  try {
    payload = parseEnvironmentPingPayload(auth.request.body);
  } catch (error) {
    if (error instanceof UnknownEnvironmentPingSchemaVersionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const result = await writeEnvironmentPing(db, payload);

  return NextResponse.json({ status: "ok", written: result === "written" });
}
