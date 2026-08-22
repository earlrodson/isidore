ALTER TABLE "features" ADD COLUMN "type" text;--> statement-breakpoint
ALTER TABLE "features" ADD COLUMN "severity" text;--> statement-breakpoint
ALTER TABLE "features" ADD COLUMN "relates_to" jsonb;