import { afterEach, describe, expect, it } from "vitest";
import { isAdminEmail } from "../current-viewer.js";

const ORIGINAL = process.env.ISIDORE_ADMIN_EMAILS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ISIDORE_ADMIN_EMAILS;
  else process.env.ISIDORE_ADMIN_EMAILS = ORIGINAL;
});

describe("isAdminEmail", () => {
  it("returns false when ISIDORE_ADMIN_EMAILS is unset", () => {
    delete process.env.ISIDORE_ADMIN_EMAILS;
    expect(isAdminEmail("admin@example.com")).toBe(false);
  });

  it("matches an email in the comma-separated list, case-insensitively", () => {
    process.env.ISIDORE_ADMIN_EMAILS = "admin@example.com, Other@Example.com";
    expect(isAdminEmail("ADMIN@example.com")).toBe(true);
    expect(isAdminEmail("other@example.com")).toBe(true);
  });

  it("rejects an email not in the list", () => {
    process.env.ISIDORE_ADMIN_EMAILS = "admin@example.com";
    expect(isAdminEmail("pm@client.com")).toBe(false);
  });
});
