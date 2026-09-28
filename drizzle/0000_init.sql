CREATE TYPE "public"."aggregation" AS ENUM('sum', 'avg', 'last', 'ratio');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'paused', 'ended');--> statement-breakpoint
CREATE TYPE "public"."metric_unit" AS ENUM('number', 'currency', 'percent', 'ratio');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('meta', 'google', 'tiktok', 'shopee', 'other');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('submitted', 'approved', 'revision');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('supervisor', 'advertiser', 'webmaster', 'seo');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'review', 'done');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"subject_user_id" integer,
	"type" varchar(40) NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"href" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"platform" "platform" NOT NULL,
	"objective" varchar(80),
	"product" varchar(120),
	"daily_budget" double precision DEFAULT 0 NOT NULL,
	"landing_page_url" text,
	"status" "campaign_status" DEFAULT 'active' NOT NULL,
	"owner_id" integer NOT NULL,
	"start_date" date,
	"end_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" date NOT NULL,
	"summary" text NOT NULL,
	"blockers" text,
	"plan_tomorrow" text,
	"status" "report_status" DEFAULT 'submitted' NOT NULL,
	"reviewer_id" integer,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"metric_id" integer NOT NULL,
	"date" date NOT NULL,
	"value" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"role" "role" NOT NULL,
	"unit" "metric_unit" DEFAULT 'number' NOT NULL,
	"aggregation" "aggregation" DEFAULT 'sum' NOT NULL,
	"numerator_key" varchar(60),
	"denominator_key" varchar(60),
	"higher_is_better" boolean DEFAULT true NOT NULL,
	"weight" integer DEFAULT 0 NOT NULL,
	"default_target" double precision,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "kpi_metrics_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "kpi_targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"metric_id" integer NOT NULL,
	"period" varchar(7) NOT NULL,
	"target" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"assignee_id" integer NOT NULL,
	"created_by_id" integer NOT NULL,
	"campaign_id" integer,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(180) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"title" varchar(120),
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_entries" ADD CONSTRAINT "kpi_entries_report_id_daily_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."daily_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_entries" ADD CONSTRAINT "kpi_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_entries" ADD CONSTRAINT "kpi_entries_metric_id_kpi_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."kpi_metrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_targets" ADD CONSTRAINT "kpi_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_targets" ADD CONSTRAINT "kpi_targets_metric_id_kpi_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."kpi_metrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_created" ON "activities" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_reports_user_date" ON "daily_reports" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "daily_reports_date" ON "daily_reports" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_entries_user_metric_date" ON "kpi_entries" USING btree ("user_id","metric_id","date");--> statement-breakpoint
CREATE INDEX "kpi_entries_date" ON "kpi_entries" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_targets_user_metric_period" ON "kpi_targets" USING btree ("user_id","metric_id","period");--> statement-breakpoint
CREATE INDEX "tasks_assignee" ON "tasks" USING btree ("assignee_id");