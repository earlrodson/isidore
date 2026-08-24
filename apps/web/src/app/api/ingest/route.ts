import { createDb, writeFeatureSnapshot } from "@isidore/db";
import { UnknownPayloadSchemaVersionError, parseIngestPayload } from "@isidore/shared";
import { NextResponse, type NextRequest } from "next/server";
import { authenticateIngestRequest } from "@/lib/ingest-auth";

// Ingest is the hot path a broken worker retries against. It must never
// depend on onboarding/OAuth code (TECHSTACK.md §7) — it only reads a
// per-repo secret by provider+repo_id.

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
    payload = parseIngestPayload(auth.request.body);
  } catch (error) {
    if (error instanceof UnknownPayloadSchemaVersionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const results = await Promise.all(
    payload.features.map((feature) => writeFeatureSnapshot(db, payload, feature)),
  );

  return NextResponse.json({ status: "ok", written: results.filter((r) => r === "written").length });
}
