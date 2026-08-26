import { describe, expect, it } from "vitest";
import {
  VIEWER_SESSION_COOKIE,
  generateViewerToken,
  hashViewerToken,
  viewerSessionExpiry,
} from "../viewer-session.js";
import { SESSION_COOKIE } from "../session.js";

describe("generateViewerToken", () => {
  it("returns 64 hex characters (32 bytes)", () => {
    expect(generateViewerToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different token on each call", () => {
    expect(generateViewerToken()).not.toBe(generateViewerToken());
  });
});

describe("hashViewerToken", () => {
  it("is deterministic for the same input", () => {
    const token = generateViewerToken();
    expect(hashViewerToken(token)).toBe(hashViewerToken(token));
  });

  it("never stores the raw token as its own hash", () => {
    const token = generateViewerToken();
    expect(hashViewerToken(token)).not.toBe(token);
  });
});

describe("viewerSessionExpiry", () => {
  it("returns a date in the future", () => {
    expect(viewerSessionExpiry().getTime()).toBeGreaterThan(Date.now());
  });
});

describe("VIEWER_SESSION_COOKIE", () => {
  it("is distinct from the onboarding session cookie name", () => {
    expect(VIEWER_SESSION_COOKIE).not.toBe(SESSION_COOKIE);
  });
});
