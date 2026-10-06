CREATE TABLE "telegram_connections" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"bot_name" text NOT NULL,
	"chat_id" varchar(40) NOT NULL,
	"chat_title" text NOT NULL,
	"thread_id" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"auto_send" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"report_id" integer,
	"connection_version" integer NOT NULL,
	"body" text NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"manual" boolean DEFAULT false NOT NULL,
	"next_part" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"send_after" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "telegram_worker" (
	"id" integer PRIMARY KEY NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_connections" ADD CONSTRAINT "telegram_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_outbox" ADD CONSTRAINT "telegram_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_outbox" ADD CONSTRAINT "telegram_outbox_report_id_daily_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."daily_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_outbox_pending" ON "telegram_outbox" USING btree ("status","send_after");--> statement-breakpoint
CREATE INDEX "telegram_outbox_report" ON "telegram_outbox" USING btree ("user_id","report_id");