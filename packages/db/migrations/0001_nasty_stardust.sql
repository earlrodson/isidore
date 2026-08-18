CREATE TABLE IF NOT EXISTS "ingest_nonces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"repo_id" text NOT NULL,
	"nonce" text NOT NULL,
	"request_timestamp" timestamp with time zone NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingest_nonces_provider_repo_nonce_key" UNIQUE("provider","repo_id","nonce")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "repo_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"repo_id" text NOT NULL,
	"secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repo_secrets_provider_repo_key" UNIQUE("provider","repo_id")
);
