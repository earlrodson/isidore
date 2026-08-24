import { createHmac, timingSafeEqual } from "node:crypto";
import { getRepoSecret, recordNonce, schema } from "@isidore/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { NextResponse, type NextRequest } from "next/server";

/** How far a request's timestamp may drift from now before it's rejected as stale/replayed (TECHSTACK.md §7). */
export const REPLAY_WINDOW_SECONDS = 300;

/**
 * Signing input is `${timestamp}.${nonce}.${rawBody}` — the raw request
 * body, not the parsed/re-serialized object, so the signature covers
 * exactly what the worker sent (TECHSTACK.md §7).
 */
export function computeSignature(
  secret: string,
  { timestamp, nonce, rawBody }: { timestamp: string; nonce: string; rawBody: string },
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.${rawBody}`)
    .digest("hex");
}

export function verifySignature(
  secret: string,
  args: { timestamp: string; nonce: string; rawBody: string; signature: string },
): boolean {
  const expected = computeSignature(secret, args);
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(args.signature, "hex");

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, actualBuf);
}

/** Rejects timestamps outside the replay window, in either direction. */
export function isWithinReplayWindow(
  timestampSeconds: number,
  nowSeconds: number,
  windowSeconds: number = REPLAY_WINDOW_SECONDS,
): boolean {
  return Math.abs(nowSeconds - timestampSeconds) <= windowSeconds;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface AuthenticatedIngestRequest {
  provider: string;
  repoId: string;
  rawBody: string;
  body: unknown;
}

export type AuthenticateIngestRequestResult =
  | { ok: true; request: AuthenticatedIngestRequest }
  | { ok: false; response: NextResponse };

/**
 * Shared HMAC/nonce/replay verification for every ingest route — `/api/ingest`
 * and `/api/ingest/environment` (feature-environment-tracking.md AC-009)
 * both call this rather than duplicating it; the two endpoints diverge only
 * in what they do with `body` once authenticated.
 */
export async function authenticateIngestRequest(
  db: NodePgDatabase<typeof schema>,
  request: NextRequest,
): Promise<AuthenticateIngestRequestResult> {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-isidore-timestamp");
  const nonce = request.headers.get("x-isidore-nonce");
  const signature = request.headers.get("x-isidore-signature");

  if (!timestamp || !nonce || !signature) {
    return { ok: false, response: NextResponse.json({ error: "missing signature headers" }, { status: 401 }) };
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return { ok: false, response: NextResponse.json({ error: "invalid timestamp" }, { status: 401 }) };
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { ok: false, response: NextResponse.json({ error: "invalid json" }, { status: 400 }) };
  }

  const provider = isRecord(body) ? body.provider : undefined;
  const repoId = isRecord(body) ? body.repo_id : undefined;
  if (typeof provider !== "string" || typeof repoId !== "string") {
    return { ok: false, response: NextResponse.json({ error: "missing provider or repo_id" }, { status: 400 }) };
  }

  const secret = await getRepoSecret(db, provider, repoId);
  if (!secret) {
    return { ok: false, response: NextResponse.json({ error: "unknown repo" }, { status: 401 }) };
  }

  if (!isWithinReplayWindow(timestampSeconds, Date.now() / 1000)) {
    return { ok: false, response: NextResponse.json({ error: "timestamp outside replay window" }, { status: 401 }) };
  }

  if (!verifySignature(secret, { timestamp, nonce, rawBody, signature })) {
    return { ok: false, response: NextResponse.json({ error: "signature mismatch" }, { status: 401 }) };
  }

  const nonceIsFresh = await recordNonce(db, {
    provider,
    repoId,
    nonce,
    requestTimestamp: new Date(timestampSeconds * 1000),
  });
  if (!nonceIsFresh) {
    return { ok: false, response: NextResponse.json({ error: "replayed request" }, { status: 401 }) };
  }

  return { ok: true, request: { provider, repoId, rawBody, body } };
}
