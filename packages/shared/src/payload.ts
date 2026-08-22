import { z } from "zod";

/**
 * Snapshot payload the worker POSTs to the ingest endpoint.
 * Shape is pinned by TECHSTACK.md §6 — do not change without updating
 * docs/features/payload-contract-v1.md and every consumer of this schema.
 *
 * Idempotency key: `provider + repo_id + feature_id` — one row per feature
 * ever; a later push overwrites, it never forks a new row per week.
 */

export const SUPPORTED_PAYLOAD_SCHEMA_VERSIONS = ["1.0", "1.1", "1.2"] as const;

export const ProviderSchema = z.enum([
  "github",
  "gitlab",
  "bitbucket",
  "azure_repos",
]);

export const FeatureStatusSchema = z.enum([
  "planned",
  "in-progress",
  "blocked",
  "done",
  "cancelled",
]);

export const OpenPrStateSchema = z.enum(["open", "closed", "merged"]);

/**
 * docs/features/feature-environment-tracking.md — furthest environment a
 * feature's last-seen commit has reached, via ancestry against staging/main
 * tips (never by re-parsing docs/features/ off those branches, per PRD.md
 * §5.2's addendum). `null`/absent means it couldn't be determined (e.g. no
 * staging/main branch configured) — added in "1.1", optional so "1.0"
 * payloads without it still validate.
 */
export const EnvironmentSchema = z.enum(["develop", "staging", "production"]);

/**
 * docs/features/GUIDELINES.md — the item's kind, parsed from
 * `docs/features/<slug>.md` frontmatter's `type` key. `feature`/`enabler`
 * are the common case; `defect`/`spike` carry `severity`/`timebox_hours`
 * instead of `priority`/`estimate_hours` in the source file, but always
 * arrive here as a `feature` shape once the worker normalizes them. Added
 * in "1.2", optional so "1.0"/"1.1" payloads without it still validate.
 */
export const FeatureTypeSchema = z.enum(["feature", "enabler", "defect", "spike"]);

/**
 * docs/features/GUIDELINES.md — `defect` frontmatter's `severity` key,
 * carried through only when `type` is `defect`. Added in "1.2", optional.
 */
export const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);

export const OpenPrSchema = z.object({
  number: z.number().int().positive(),
  state: OpenPrStateSchema,
  updated_at: z.string().datetime({ offset: true }),
});

export const TodoSchema = z.object({
  todo_id: z.string().min(1),
  title: z.string().min(1),
  done: z.boolean(),
  owner: z.string().min(1),
  estimate_hours: z.number().nonnegative(),
  due: z.string().date().nullable(),
});

export const FeatureSchema = z.object({
  feature_id: z.string().min(1),
  title: z.string().min(1),
  prd_ref: z.string().min(1),
  status: FeatureStatusSchema,
  owners: z.array(z.string().min(1)).min(1),
  estimate_hours: z.number().nonnegative(),
  hours_logged: z.number().nonnegative(),
  environment: EnvironmentSchema.nullable().optional(),
  type: FeatureTypeSchema.optional(),
  severity: SeveritySchema.optional(),
  relates_to: z.array(z.string().min(1)).optional(),
  todos: z.array(TodoSchema),
  open_prs: z.array(OpenPrSchema),
});

export const IngestPayloadSchema = z.object({
  payload_schema_version: z.enum(SUPPORTED_PAYLOAD_SCHEMA_VERSIONS),
  provider: ProviderSchema,
  repo_id: z.string().min(1),
  project: z.string().min(1),
  week: z.string().regex(/^\d{4}-W\d{2}$/, "week must match YYYY-Www"),
  base_branch: z.string().min(1),
  commit_sha: z.string().min(1),
  generated_at: z.string().datetime({ offset: true }),
  timezone: z.string().min(1),
  features: z.array(FeatureSchema),
});

export type Provider = z.infer<typeof ProviderSchema>;
export type FeatureStatus = z.infer<typeof FeatureStatusSchema>;
export type Environment = z.infer<typeof EnvironmentSchema>;
export type FeatureType = z.infer<typeof FeatureTypeSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type OpenPr = z.infer<typeof OpenPrSchema>;
export type Todo = z.infer<typeof TodoSchema>;
export type Feature = z.infer<typeof FeatureSchema>;
export type IngestPayload = z.infer<typeof IngestPayloadSchema>;

export class UnknownPayloadSchemaVersionError extends Error {
  constructor(public readonly received: unknown) {
    super(`Unknown payload_schema_version: ${JSON.stringify(received)}`);
    this.name = "UnknownPayloadSchemaVersionError";
  }
}

/**
 * Parses and validates a raw ingest payload. Rejects unknown
 * `payload_schema_version` values outright rather than attempting a
 * partial parse, per PRD.md §6.2 / TECHSTACK.md §6.
 */
export function parseIngestPayload(raw: unknown): IngestPayload {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("payload_schema_version" in raw) ||
    !SUPPORTED_PAYLOAD_SCHEMA_VERSIONS.includes(
      (raw as { payload_schema_version: unknown }).payload_schema_version as never,
    )
  ) {
    const received =
      typeof raw === "object" && raw !== null && "payload_schema_version" in raw
        ? (raw as { payload_schema_version: unknown }).payload_schema_version
        : undefined;
    throw new UnknownPayloadSchemaVersionError(received);
  }

  return IngestPayloadSchema.parse(raw);
}

/** Idempotency key for a single feature within a payload. */
export function idempotencyKey(payload: {
  provider: string;
  repo_id: string;
}, featureId: string): string {
  return `${payload.provider}:${payload.repo_id}:${featureId}`;
}
