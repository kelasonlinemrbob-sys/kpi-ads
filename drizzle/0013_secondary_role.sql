ALTER TABLE "users" ADD COLUMN "secondary_role" "role";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "secondary_share" integer DEFAULT 40 NOT NULL;