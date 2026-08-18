CREATE TABLE IF NOT EXISTS "actuals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_id" uuid NOT NULL,
	"week" text NOT NULL,
	"hours_logged" double precision NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "actuals_feature_week_key" UNIQUE("feature_id","week")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assignees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignees_handle_key" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_id" uuid NOT NULL,
	"week" text NOT NULL,
	"estimate_hours" double precision NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "estimates_feature_week_key" UNIQUE("feature_id","week")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_assignees" (
	"feature_id" uuid NOT NULL,
	"assignee_id" uuid NOT NULL,
	CONSTRAINT "feature_assignees_key" UNIQUE("feature_id","assignee_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"feature_id" text NOT NULL,
	"title" text NOT NULL,
	"prd_ref" text NOT NULL,
	"status" text NOT NULL,
	"estimate_hours" double precision NOT NULL,
	"hours_logged" double precision NOT NULL,
	"open_prs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "features_project_feature_key" UNIQUE("project_id","feature_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"repo_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_provider_repo_key" UNIQUE("provider","repo_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"repo_id" text NOT NULL,
	"project" text NOT NULL,
	"feature_id" text NOT NULL,
	"payload_schema_version" text NOT NULL,
	"week" text NOT NULL,
	"base_branch" text NOT NULL,
	"commit_sha" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"raw" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshots_provider_repo_feature_key" UNIQUE("provider","repo_id","feature_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_id" uuid NOT NULL,
	"week" text NOT NULL,
	"status" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "status_events_feature_week_key" UNIQUE("feature_id","week")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_id" uuid NOT NULL,
	"todo_id" text NOT NULL,
	"title" text NOT NULL,
	"done" boolean NOT NULL,
	"owner_id" uuid NOT NULL,
	"estimate_hours" double precision NOT NULL,
	"due" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "todos_feature_todo_key" UNIQUE("feature_id","todo_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "actuals" ADD CONSTRAINT "actuals_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimates" ADD CONSTRAINT "estimates_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feature_assignees" ADD CONSTRAINT "feature_assignees_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feature_assignees" ADD CONSTRAINT "feature_assignees_assignee_id_assignees_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."assignees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "features" ADD CONSTRAINT "features_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "status_events" ADD CONSTRAINT "status_events_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "todos" ADD CONSTRAINT "todos_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "todos" ADD CONSTRAINT "todos_owner_id_assignees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."assignees"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
