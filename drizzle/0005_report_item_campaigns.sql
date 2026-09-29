CREATE TABLE "advertiser_report_item_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"external_id" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"spent" double precision NOT NULL,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	"leads" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "advertiser_report_item_campaigns" ADD CONSTRAINT "advertiser_report_item_campaigns_item_id_advertiser_report_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."advertiser_report_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advertiser_report_item_campaigns_item" ON "advertiser_report_item_campaigns" USING btree ("item_id");