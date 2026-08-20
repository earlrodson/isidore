import { describe, expect, it } from "vitest";
import { generateRepoSecret } from "../repo-secret.js";

describe("generateRepoSecret", () => {
  it("returns 64 hex characters (32 bytes)", () => {
    expect(generateRepoSecret()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different secret on every call", () => {
    expect(generateRepoSecret()).not.toBe(generateRepoSecret());
  });
});
