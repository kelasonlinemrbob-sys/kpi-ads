CREATE TYPE "public"."report_window" AS ENUM('previous_day', 'today_to_cutoff');--> statement-breakpoint
CREATE TABLE "advertiser_report_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"window" "report_window" NOT NULL,
	"performance_date" date NOT NULL,
	"platform" "platform" NOT NULL,
	"product" varchar(120) NOT NULL,
	"spent" double precision NOT NULL,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	"leads" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "advertiser_report_items" ADD CONSTRAINT "advertiser_report_items_report_id_daily_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."daily_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advertiser_report_items" ADD CONSTRAINT "advertiser_report_items_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "advertiser_report_items_report_window_campaign" ON "advertiser_report_items" USING btree ("report_id","window","campaign_id");--> statement-breakpoint
CREATE INDEX "advertiser_report_items_report" ON "advertiser_report_items" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "advertiser_report_items_performance_date" ON "advertiser_report_items" USING btree ("performance_date");