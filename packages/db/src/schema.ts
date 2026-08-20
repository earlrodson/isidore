import {
  boolean,
  date,
  doublePrecision,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Raw tier (TECHSTACK.md §4.2). One row per feature ever, keyed on
 * `provider + repo_id + feature_id` (TECHSTACK.md §6 rules) — a later push
 * overwrites this row, it never forks a new row per week. `content_hash` is
 * what the reconcile job (PRD.md §6.3) compares against a fresh pull to skip
 * writes when nothing changed.
 */
export const snapshots = pgTable(
  "snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    repoId: text("repo_id").notNull(),
    project: text("project").notNull(),
    featureId: text("feature_id").notNull(),
    payloadSchemaVersion: text("payload_schema_version").notNull(),
    week: text("week").notNull(),
    baseBranch: text("base_branch").notNull(),
    commitSha: text("commit_sha").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull(),
    raw: jsonb("raw").notNull(),
    contentHash: text("content_hash").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("snapshots_provider_repo_feature_key").on(
      table.provider,
      table.repoId,
      table.featureId,
    ),
  ],
);

/** Normalized tier — derived deterministically from `snapshots`, never
 * written to directly by ingest (TECHSTACK.md §4.2). */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    repoId: text("repo_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("projects_provider_repo_key").on(table.provider, table.repoId),
  ],
);

export const features = pgTable(
  "features",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    featureId: text("feature_id").notNull(),
    title: text("title").notNull(),
    prdRef: text("prd_ref").notNull(),
    status: text("status").notNull(),
    estimateHours: doublePrecision("estimate_hours").notNull(),
    hoursLogged: doublePrecision("hours_logged").notNull(),
    openPrs: jsonb("open_prs").notNull(),
    // docs/features/feature-environment-tracking.md — furthest environment
    // this feature's last-seen commit has reached (develop/staging/
    // production), via commit-ancestry, not by re-parsing docs/features/ off
    // other branches. Null when undetermined (e.g. no staging/main branch).
    environment: text("environment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("features_project_feature_key").on(
      table.projectId,
      table.featureId,
    ),
  ],
);

export const assignees = pgTable(
  "assignees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    handle: text("handle").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique("assignees_handle_key").on(table.handle)],
);

/** Many-to-many: a feature's `owners[]`. */
export const featureAssignees = pgTable(
  "feature_assignees",
  {
    featureId: uuid("feature_id")
      .notNull()
      .references(() => features.id, { onDelete: "cascade" }),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => assignees.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("feature_assignees_key").on(table.featureId, table.assigneeId),
  ],
);

export const todos = pgTable(
  "todos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureId: uuid("feature_id")
      .notNull()
      .references(() => features.id, { onDelete: "cascade" }),
    todoId: text("todo_id").notNull(),
    title: text("title").notNull(),
    done: boolean("done").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => assignees.id),
    estimateHours: doublePrecision("estimate_hours").notNull(),
    due: date("due"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("todos_feature_todo_key").on(table.featureId, table.todoId),
  ],
);

/** Append-only history, one point per feature per week — the trend series
 * behind the estimation-drift report (PRD.md §6.5). */
export const estimates = pgTable(
  "estimates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureId: uuid("feature_id")
      .notNull()
      .references(() => features.id, { onDelete: "cascade" }),
    week: text("week").notNull(),
    estimateHours: doublePrecision("estimate_hours").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("estimates_feature_week_key").on(table.featureId, table.week),
  ],
);

export const actuals = pgTable(
  "actuals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureId: uuid("feature_id")
      .notNull()
      .references(() => features.id, { onDelete: "cascade" }),
    week: text("week").notNull(),
    hoursLogged: doublePrecision("hours_logged").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("actuals_feature_week_key").on(table.featureId, table.week),
  ],
);

export const statusEvents = pgTable(
  "status_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureId: uuid("feature_id")
      .notNull()
      .references(() => features.id, { onDelete: "cascade" }),
    week: text("week").notNull(),
    status: text("status").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("status_events_feature_week_key").on(table.featureId, table.week),
  ],
);

/**
 * Per-repo HMAC secret used to verify ingest requests (TECHSTACK.md §7).
 * Deliberately its own table, not part of onboarding/OAuth: the ingest path
 * only ever reads a secret by `provider + repo_id`, so it shares no
 * dependencies with the onboarding flow that will eventually manage these.
 */
export const repoSecrets = pgTable(
  "repo_secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    repoId: text("repo_id").notNull(),
    secret: text("secret").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("repo_secrets_provider_repo_key").on(table.provider, table.repoId),
  ],
);

/**
 * Onboarding identity (docs/features/onboarding-oauth.md). Deliberately
 * disjoint from `repoSecrets`/ingest: this is the first auth surface in the
 * app, kept minimal per PRD open question #2 (org-wide read for v1, no
 * per-project ACL) rather than over-building roles ahead of need.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  login: text("login").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * One row per (provider, provider account) a user has logged in with.
 * Separate from `users` so a second provider (TECHSTACK.md §8 build order
 * step 9) can link to an existing user rather than forcing a new identity.
 */
export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("oauth_accounts_provider_account_key").on(
      table.provider,
      table.providerAccountId,
    ),
  ],
);

/**
 * Server-side session, looked up by a hash of the cookie's bearer token
 * (the raw token itself is never stored, matching the repo secret's
 * display-once posture in spirit — a stolen DB row alone can't replay a
 * session).
 */
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * A GitHub App installation the user connected during onboarding
 * (docs/features/onboarding-oauth.md AC-002/003). Repo access comes from
 * this installation's grant, not from browsing everything the user can
 * see on GitHub.
 */
export const githubInstallations = pgTable(
  "github_installations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    installationId: text("installation_id").notNull(),
    accountLogin: text("account_login").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("github_installations_installation_id_key").on(
      table.installationId,
    ),
  ],
);

/**
 * Seen nonces for replay protection (TECHSTACK.md §7). A unique constraint
 * on `provider + repo_id + nonce` makes "have we seen this before" an
 * atomic insert rather than a check-then-write race.
 */
export const ingestNonces = pgTable(
  "ingest_nonces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    repoId: text("repo_id").notNull(),
    nonce: text("nonce").notNull(),
    requestTimestamp: timestamp("request_timestamp", {
      withTimezone: true,
    }).notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("ingest_nonces_provider_repo_nonce_key").on(
      table.provider,
      table.repoId,
      table.nonce,
    ),
  ],
);
