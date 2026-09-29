CREATE TABLE "app_settings" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_by_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;