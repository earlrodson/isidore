import { describe, expect, it } from "vitest";
import { computeSignature, isWithinReplayWindow, verifySignature } from "../ingest-auth.js";

describe("verifySignature", () => {
  const secret = "repo-secret";
  const timestamp = "1000";
  const nonce = "abc";
  const rawBody = '{"hello":"world"}';

  it("accepts a signature computed with the matching secret", () => {
    const signature = computeSignature(secret, { timestamp, nonce, rawBody });
    expect(verifySignature(secret, { timestamp, nonce, rawBody, signature })).toBe(true);
  });

  it("rejects a signature computed with a different secret", () => {
    const signature = computeSignature("wrong-secret", { timestamp, nonce, rawBody });
    expect(verifySignature(secret, { timestamp, nonce, rawBody, signature })).toBe(false);
  });

  it("rejects a signature for a different body", () => {
    const signature = computeSignature(secret, { timestamp, nonce, rawBody });
    expect(
      verifySignature(secret, { timestamp, nonce, rawBody: '{"hello":"tampered"}', signature }),
    ).toBe(false);
  });

  it("rejects a malformed signature without throwing", () => {
    expect(
      verifySignature(secret, { timestamp, nonce, rawBody, signature: "not-hex-!!" }),
    ).toBe(false);
  });
});

describe("isWithinReplayWindow", () => {
  it("accepts a timestamp inside the window", () => {
    expect(isWithinReplayWindow(1000, 1200, 300)).toBe(true);
  });

  it("rejects a timestamp outside the window", () => {
    expect(isWithinReplayWindow(1000, 1400, 300)).toBe(false);
  });

  it("rejects a timestamp from the future outside the window", () => {
    expect(isWithinReplayWindow(1500, 1000, 300)).toBe(false);
  });
});
