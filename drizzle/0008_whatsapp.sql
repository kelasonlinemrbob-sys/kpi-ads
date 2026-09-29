CREATE TYPE "public"."wa_message_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."wa_session_status" AS ENUM('disconnected', 'connecting', 'qr', 'connected');--> statement-breakpoint
CREATE TABLE "wa_auth" (
	"user_id" integer NOT NULL,
	"key" varchar(200) NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "wa_auth_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "wa_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"report_id" integer,
	"group_jid" varchar(80) NOT NULL,
	"body" text NOT NULL,
	"status" "wa_message_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wa_sessions" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"want_connected" boolean DEFAULT false NOT NULL,
	"status" "wa_session_status" DEFAULT 'disconnected' NOT NULL,
	"qr" text,
	"phone" varchar(40),
	"group_jid" varchar(80),
	"group_name" varchar(160),
	"groups" jsonb,
	"refresh_groups" boolean DEFAULT false NOT NULL,
	"auto_send" boolean DEFAULT true NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_worker" (
	"id" integer PRIMARY KEY NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wa_auth" ADD CONSTRAINT "wa_auth_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_outbox" ADD CONSTRAINT "wa_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_outbox" ADD CONSTRAINT "wa_outbox_report_id_daily_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."daily_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_sessions" ADD CONSTRAINT "wa_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wa_outbox_status" ON "wa_outbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wa_outbox_report" ON "wa_outbox" USING btree ("report_id");