import { describe, expect, it } from "vitest";
import { generateSessionToken, hashSessionToken, sessionExpiry } from "../session.js";

describe("generateSessionToken", () => {
  it("returns 64 hex characters (32 bytes)", () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different token on each call", () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });
});

describe("hashSessionToken", () => {
  it("is deterministic for the same input", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("never stores the raw token as its own hash", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).not.toBe(token);
  });

  it("differs for different tokens", () => {
    expect(hashSessionToken("a")).not.toBe(hashSessionToken("b"));
  });
});

describe("sessionExpiry", () => {
  it("returns a date in the future", () => {
    expect(sessionExpiry().getTime()).toBeGreaterThan(Date.now());
  });
});
