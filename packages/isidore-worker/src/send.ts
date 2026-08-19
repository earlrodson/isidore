import { createHmac, randomBytes } from "node:crypto";
import type { IngestPayload } from "@isidore/shared";
import type { FetchLike } from "./git.js";

/**
 * Sign + POST step (TECHSTACK.md §3 pipeline: "HMAC sign and POST with
 * retry"). Signing scheme matches the ingest endpoint exactly
 * (apps/web/src/lib/ingest-auth.ts): `sha256(secret, timestamp.nonce.rawBody)`
 * over the exact JSON string sent, carried in
 * `X-Isidore-Signature`/`X-Isidore-Timestamp`/`X-Isidore-Nonce`.
 */

export interface SignedRequest {
  rawBody: string;
  timestamp: string;
  nonce: string;
  signature: string;
}

export interface SignPayloadOptions {
  /** Injectable for deterministic tests; defaults to the real clock. */
  now?: () => number;
  /** Injectable for deterministic tests; defaults to a random 16-byte hex string. */
  nonce?: () => string;
}

/**
 * Signs a payload. `rawBody` is the exact JSON string that must also be
 * sent as the request body — the endpoint verifies the signature against
 * the raw bytes it received, not a re-serialized object.
 */
export function signPayload(
  payload: IngestPayload,
  secret: string,
  options: SignPayloadOptions = {},
): SignedRequest {
  const now = options.now ?? (() => Date.now());
  const nonce = options.nonce ?? (() => randomBytes(16).toString("hex"));

  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(now() / 1000));
  const nonceValue = nonce();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${nonceValue}.${rawBody}`)
    .digest("hex");

  return { rawBody, timestamp, nonce: nonceValue, signature };
}

export class IngestPostError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    public readonly attempts: number,
  ) {
    super(`Ingest POST rejected with status ${status} after ${attempts} attempt(s)`);
    this.name = "IngestPostError";
  }
}

export class IngestPostNetworkError extends Error {
  constructor(
    public readonly attempts: number,
    public readonly cause: unknown,
  ) {
    super(`Ingest POST failed after ${attempts} attempt(s): ${String(cause)}`);
    this.name = "IngestPostNetworkError";
  }
}

export interface PostSnapshotParams extends SignPayloadOptions {
  endpoint: string;
  payload: IngestPayload;
  secret: string;
  fetchImpl?: FetchLike;
  /** Total attempts, including the first — default 3. */
  maxAttempts?: number;
  /** Base delay before the first retry; doubles each subsequent retry — default 1000ms. */
  retryDelayMs?: number;
  /** Injectable for deterministic tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

export interface PostSnapshotResult {
  status: number;
  body: unknown;
  attempts: number;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Signs and POSTs the snapshot, retrying on network failure or a 5xx
 * response with exponential backoff. A 4xx is never retried — the request
 * itself is wrong (bad signature, unknown schema version, etc.) and
 * retrying it verbatim would fail identically every time.
 */
export async function postSnapshot(
  params: PostSnapshotParams,
): Promise<PostSnapshotResult> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const maxAttempts = params.maxAttempts ?? 3;
  const retryDelayMs = params.retryDelayMs ?? 1000;
  const sleep = params.sleep ?? defaultSleep;

  let lastError: IngestPostError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const signed = signPayload(params.payload, params.secret, {
      now: params.now,
      nonce: params.nonce,
    });

    let response: Response;
    try {
      response = await fetchImpl(params.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-isidore-timestamp": signed.timestamp,
          "x-isidore-nonce": signed.nonce,
          "x-isidore-signature": signed.signature,
        },
        body: signed.rawBody,
      });
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new IngestPostNetworkError(attempt, error);
      }
      await sleep(retryDelayMs * 2 ** (attempt - 1));
      continue;
    }

    const body = await safeJson(response);
    if (response.ok) {
      return { status: response.status, body, attempts: attempt };
    }

    lastError = new IngestPostError(response.status, body, attempt);
    if (response.status < 500 || attempt === maxAttempts) {
      throw lastError;
    }
    await sleep(retryDelayMs * 2 ** (attempt - 1));
  }

  // Unreachable: the loop always returns or throws.
  throw lastError;
}
