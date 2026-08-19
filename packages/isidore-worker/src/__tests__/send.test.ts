import { createHmac, timingSafeEqual } from "node:crypto";
import type { IngestPayload } from "@isidore/shared";
import { describe, expect, it, vi } from "vitest";
import {
  IngestPostError,
  IngestPostNetworkError,
  postSnapshot,
  signPayload,
} from "../send.js";

const payload = {
  payload_schema_version: "1.0",
  provider: "github",
  repo_id: "acme/project-1",
  project: "project-1",
  week: "2026-W34",
  base_branch: "develop",
  commit_sha: "a1b2c3d",
  generated_at: "2026-08-18T09:00:00+08:00",
  timezone: "Asia/Manila",
  features: [],
} as unknown as IngestPayload;

/** Mirrors apps/web/src/lib/ingest-auth.ts#verifySignature exactly. */
function verifySignature(
  secret: string,
  args: { timestamp: string; nonce: string; rawBody: string; signature: string },
): boolean {
  const expected = createHmac("sha256", secret)
    .update(`${args.timestamp}.${args.nonce}.${args.rawBody}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(args.signature, "hex");
  return (
    expectedBuf.length === actualBuf.length &&
    timingSafeEqual(expectedBuf, actualBuf)
  );
}

describe("signPayload", () => {
  it("produces a signature the ingest endpoint's verifySignature accepts", () => {
    const signed = signPayload(payload, "shh-secret", {
      now: () => 1_755_500_000_000,
      nonce: () => "fixed-nonce",
    });

    expect(signed.rawBody).toBe(JSON.stringify(payload));
    expect(signed.timestamp).toBe("1755500000");
    expect(signed.nonce).toBe("fixed-nonce");
    expect(verifySignature("shh-secret", { ...signed })).toBe(true);
  });

  it("produces a different signature for a different secret", () => {
    const options = { now: () => 1, nonce: () => "n" };
    const a = signPayload(payload, "secret-a", options);
    const b = signPayload(payload, "secret-b", options);
    expect(a.signature).not.toBe(b.signature);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("postSnapshot", () => {
  const noopSleep = async () => {};
  const baseParams = {
    endpoint: "https://isidore.example/api/ingest",
    payload,
    secret: "shh-secret",
    now: () => 1_755_500_000_000,
    nonce: () => "fixed-nonce",
    sleep: noopSleep,
  };

  it("returns the result on a successful first attempt", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: "ok" }));

    const result = await postSnapshot({ ...baseParams, fetchImpl });

    expect(result).toEqual({ status: 200, body: { status: "ok" }, attempts: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(baseParams.endpoint);
    expect(init.headers["x-isidore-timestamp"]).toBe("1755500000");
    expect(init.headers["x-isidore-nonce"]).toBe("fixed-nonce");
    expect(init.body).toBe(JSON.stringify(payload));
  });

  it("retries on a 5xx response and succeeds once the server recovers", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 503))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));

    const result = await postSnapshot({ ...baseParams, fetchImpl });

    expect(result.attempts).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws IngestPostError without retrying on a 4xx response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "signature mismatch" }, 401));

    await expect(postSnapshot({ ...baseParams, fetchImpl })).rejects.toThrow(
      IngestPostError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws IngestPostError after exhausting retries on repeated 5xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));

    await expect(
      postSnapshot({ ...baseParams, fetchImpl, maxAttempts: 3 }),
    ).rejects.toThrow(IngestPostError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("retries on a network error and throws IngestPostNetworkError once exhausted", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    await expect(
      postSnapshot({ ...baseParams, fetchImpl, maxAttempts: 2 }),
    ).rejects.toThrow(IngestPostNetworkError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("signs each retry attempt with a fresh nonce", async () => {
    const nonces = ["nonce-1", "nonce-2"];
    let call = 0;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));

    await postSnapshot({
      ...baseParams,
      nonce: () => nonces[call++],
      fetchImpl,
    });

    const firstNonce = fetchImpl.mock.calls[0][1].headers["x-isidore-nonce"];
    const secondNonce = fetchImpl.mock.calls[1][1].headers["x-isidore-nonce"];
    expect(firstNonce).toBe("nonce-1");
    expect(secondNonce).toBe("nonce-2");
  });

  it("waits with exponential backoff between retries", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));

    await postSnapshot({
      ...baseParams,
      sleep,
      retryDelayMs: 100,
      fetchImpl,
    });

    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });
});
