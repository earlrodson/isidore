CREATE TABLE IF NOT EXISTS "environment_pings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"repo_id" text NOT NULL,
	"project" text NOT NULL,
	"environment_ping_schema_version" text NOT NULL,
	"environment" text NOT NULL,
	"commit_sha" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"feature_ids" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "environment_pings_provider_repo_env_commit_key" UNIQUE("provider","repo_id","environment","commit_sha")
);
