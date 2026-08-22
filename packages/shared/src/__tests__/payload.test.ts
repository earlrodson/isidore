import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  UnknownPayloadSchemaVersionError,
  idempotencyKey,
  parseIngestPayload,
} from "../payload.js";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));

const loadFixture = (name: string) =>
  JSON.parse(readFileSync(fixturePath(name), "utf8"));

describe("parseIngestPayload", () => {
  it("accepts a valid payload", () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    expect(payload.features[0].feature_id).toBe("auth-refresh");
  });

  it("accepts a 1.0 payload with no environment field (backward compat)", () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    expect(payload.features[0].environment).toBeUndefined();
  });

  it("accepts a 1.1 payload with a per-feature environment", () => {
    const payload = parseIngestPayload(loadFixture("valid-with-environment.json"));
    expect(payload.payload_schema_version).toBe("1.1");
    expect(payload.features[0].environment).toBe("staging");
  });

  it("accepts a 1.2 payload with type/severity/relates_to", () => {
    const payload = parseIngestPayload(loadFixture("valid-with-type-severity.json"));
    expect(payload.payload_schema_version).toBe("1.2");
    expect(payload.features[0].type).toBe("defect");
    expect(payload.features[0].severity).toBe("high");
    expect(payload.features[0].relates_to).toEqual(["auth-refresh"]);
  });

  it("accepts a 1.1 payload with no type/severity/relates_to field (backward compat)", () => {
    const payload = parseIngestPayload(loadFixture("valid-with-environment.json"));
    expect(payload.features[0].type).toBeUndefined();
    expect(payload.features[0].severity).toBeUndefined();
    expect(payload.features[0].relates_to).toBeUndefined();
  });

  it("rejects an unknown payload_schema_version", () => {
    expect(() =>
      parseIngestPayload(loadFixture("reject-unknown-schema-version.json")),
    ).toThrow(UnknownPayloadSchemaVersionError);
  });

  it("rejects a missing payload_schema_version", () => {
    expect(() =>
      parseIngestPayload(loadFixture("reject-missing-schema-version.json")),
    ).toThrow(UnknownPayloadSchemaVersionError);
  });

  it("rejects a malformed week", () => {
    expect(() =>
      parseIngestPayload(loadFixture("reject-malformed-week.json")),
    ).toThrow();
  });

  it("rejects an invalid feature status", () => {
    expect(() =>
      parseIngestPayload(loadFixture("reject-invalid-feature-status.json")),
    ).toThrow();
  });

  it("rejects a feature with no owners", () => {
    expect(() =>
      parseIngestPayload(loadFixture("reject-missing-owners.json")),
    ).toThrow();
  });
});

describe("idempotencyKey", () => {
  it("combines provider + repo_id + feature_id", () => {
    const payload = parseIngestPayload(loadFixture("valid.json"));
    expect(idempotencyKey(payload, "auth-refresh")).toBe(
      "github:your-org/project-1:auth-refresh",
    );
  });
});
