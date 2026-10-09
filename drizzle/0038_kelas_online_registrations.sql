ALTER TABLE "external_registrations" ADD COLUMN "source" varchar(20) DEFAULT 'lkbi' NOT NULL;--> statement-breakpoint
ALTER TABLE "external_registrations" DROP CONSTRAINT "external_registrations_pkey";--> statement-breakpoint
ALTER TABLE "external_registrations" ADD CONSTRAINT "external_registrations_source_id_pk" PRIMARY KEY("source","id");--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "registration_source" varchar(20) DEFAULT 'lkbi' NOT NULL;
