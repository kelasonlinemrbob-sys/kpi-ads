CREATE TABLE "external_registrations" (
	"id" integer PRIMARY KEY NOT NULL,
	"registration_id" varchar(40) NOT NULL,
	"name" varchar(160) NOT NULL,
	"package_name" varchar(200) NOT NULL,
	"period" varchar(80),
	"status" varchar(20) NOT NULL,
	"total_price" double precision DEFAULT 0 NOT NULL,
	"info_source" varchar(160),
	"city" varchar(120),
	"paid_at" timestamp with time zone,
	"registered_at" timestamp with time zone NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "registration_packages" text;--> statement-breakpoint
CREATE INDEX "external_registrations_paid" ON "external_registrations" USING btree ("paid_at");--> statement-breakpoint
CREATE INDEX "external_registrations_registered" ON "external_registrations" USING btree ("registered_at");