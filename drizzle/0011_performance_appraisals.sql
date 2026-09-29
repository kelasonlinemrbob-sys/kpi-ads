CREATE TYPE "public"."advertiser_level" AS ENUM('junior', 'senior');--> statement-breakpoint
CREATE TYPE "public"."appraisal_status" AS ENUM('draft', 'final');--> statement-breakpoint
CREATE TABLE "performance_appraisals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"reviewer_id" integer,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "appraisal_status" DEFAULT 'draft' NOT NULL,
	"skill_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"skill_note" text,
	"kpi" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"kpi_note" text,
	"skill_score" double precision,
	"kpi_score" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "advertiser_level" "advertiser_level";--> statement-breakpoint
ALTER TABLE "performance_appraisals" ADD CONSTRAINT "performance_appraisals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_appraisals" ADD CONSTRAINT "performance_appraisals_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "performance_appraisals_user" ON "performance_appraisals" USING btree ("user_id");--> statement-breakpoint
UPDATE "users" SET "advertiser_level" = 'junior' WHERE "role" = 'advertiser';
