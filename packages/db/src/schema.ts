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

/**
 * Raw tier for `feature-environment-tracking`'s AC-009 environment pings —
 * one row per (provider, repo, environment, commit), never per feature, so
 * `replayAll` can rebuild `features.environment` deterministically without
 * re-contacting GitHub. `feature_ids` is the full list from a single ping;
 * `deriveEnvironmentPing` fans that out to per-feature monotonic updates.
 */
export const environmentPings = pgTable(
  "environment_pings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    repoId: text("repo_id").notNull(),
    project: text("project").notNull(),
    environmentPingSchemaVersion: text("environment_ping_schema_version").notNull(),
    environment: text("environment").notNull(),
    commitSha: text("commit_sha").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull(),
    featureIds: jsonb("feature_ids").notNull(),
    contentHash: text("content_hash").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("environment_pings_provider_repo_env_commit_key").on(
      table.provider,
      table.repoId,
      table.environment,
      table.commitSha,
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
    // docs/specifications/feature-environment-tracking.md — furthest
    // environment this feature has been observed on (develop/staging/
    // production). Written only by `deriveEnvironmentPing`
    // (environment_pings), monotonically (never downgraded by a later,
    // unrelated ping) — never by the normal develop snapshot path. Null
    // until the first ping for this feature arrives.
    environment: text("environment"),
    // payload contract 1.2 (docs/specifications/payload-contract-v1-2-type-severity.md)
    // — the item's kind and, for defects, severity + the slugs it relates
    // to. Null for pre-1.2 senders that never set them.
    type: text("type"),
    severity: text("severity"),
    // payload contract 1.6 — feature/enabler priority. Null for pre-1.6
    // senders that never set it.
    priority: text("priority"),
    relatesTo: jsonb("relates_to"),
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
 * Onboarding identity (docs/specifications/onboarding-oauth.md). Deliberately
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
 * (docs/specifications/onboarding-oauth.md AC-002/003). Repo access comes from
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
 * Viewer identity (docs/specifications/viewer-magic-link-access.md).
 * Deliberately disjoint from `users`/`sessions`/`github_installations`:
 * those authenticate repo *owners* connecting a repo via the GitHub App;
 * these authenticate dashboard *viewers* reading data about a repo someone
 * else already connected. The viewer's identity is just their email — no
 * separate `viewers` table, since email is the only fact that matters for
 * granting access.
 */
export const magicLinks = pgTable("magic_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Viewer session, looked up by a hash of the cookie's bearer token — same
 * raw-token-never-persisted posture as `sessions`. Kept as its own table
 * (and its own cookie, set in apps/web/src/lib/viewer-session.ts) so a
 * viewer session can never be confused with an onboarding session.
 */
export const viewerSessions = pgTable("viewer_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Admin-managed email → project grant. Bindable before the viewer has ever
 * logged in (an admin grants by email, not by an existing viewer row), and
 * re-read from the DB on every gated page load — no grant is ever cached
 * in the session/cookie, so revocation is immediate.
 */
export const repoAccess = pgTable(
  "repo_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("repo_access_email_project_key").on(table.email, table.projectId),
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
