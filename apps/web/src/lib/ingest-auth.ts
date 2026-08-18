import { createHmac, timingSafeEqual } from "node:crypto";

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
