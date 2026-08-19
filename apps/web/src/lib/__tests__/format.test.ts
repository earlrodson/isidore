import { describe, expect, it } from "vitest";
import { formatDrift, formatHours } from "../format.js";

describe("formatHours", () => {
  it("drops a trailing .0", () => {
    expect(formatHours(5)).toBe("5");
  });

  it("rounds to 1 decimal place", () => {
    expect(formatHours(5.55)).toBe("5.6");
  });

  it("keeps a single significant decimal", () => {
    expect(formatHours(5.5)).toBe("5.5");
  });
});

describe("formatDrift", () => {
  it("prefixes a positive drift with +", () => {
    expect(formatDrift(2)).toBe("+2");
  });

  it("leaves a negative drift as-is", () => {
    expect(formatDrift(-2.5)).toBe("-2.5");
  });

  it("does not prefix zero", () => {
    expect(formatDrift(0)).toBe("0");
  });
});
