import {
  createDb,
  getRepoSecret,
  recordNonce,
  writeFeatureSnapshot,
} from "@isidore/db";
import { UnknownPayloadSchemaVersionError, parseIngestPayload } from "@isidore/shared";
import { NextResponse, type NextRequest } from "next/server";
import { isWithinReplayWindow, verifySignature } from "@/lib/ingest-auth";

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
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-isidore-timestamp");
  const nonce = request.headers.get("x-isidore-nonce");
  const signature = request.headers.get("x-isidore-signature");

  if (!timestamp || !nonce || !signature) {
    return NextResponse.json({ error: "missing signature headers" }, { status: 401 });
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return NextResponse.json({ error: "invalid timestamp" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const provider = isRecord(body) ? body.provider : undefined;
  const repoId = isRecord(body) ? body.repo_id : undefined;
  if (typeof provider !== "string" || typeof repoId !== "string") {
    return NextResponse.json({ error: "missing provider or repo_id" }, { status: 400 });
  }

  const db = createDb(databaseUrl());

  const secret = await getRepoSecret(db, provider, repoId);
  if (!secret) {
    return NextResponse.json({ error: "unknown repo" }, { status: 401 });
  }

  if (!isWithinReplayWindow(timestampSeconds, Date.now() / 1000)) {
    return NextResponse.json({ error: "timestamp outside replay window" }, { status: 401 });
  }

  if (!verifySignature(secret, { timestamp, nonce, rawBody, signature })) {
    return NextResponse.json({ error: "signature mismatch" }, { status: 401 });
  }

  const nonceIsFresh = await recordNonce(db, {
    provider,
    repoId,
    nonce,
    requestTimestamp: new Date(timestampSeconds * 1000),
  });
  if (!nonceIsFresh) {
    return NextResponse.json({ error: "replayed request" }, { status: 401 });
  }

  let payload;
  try {
    payload = parseIngestPayload(body);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
