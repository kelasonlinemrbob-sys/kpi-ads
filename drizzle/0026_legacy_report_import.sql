CREATE TABLE "legacy_report_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_hash" varchar(64) NOT NULL,
	"source_row" integer NOT NULL,
	"source_data" jsonb NOT NULL,
	"item_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_reports" ADD COLUMN "source" varchar(20) DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "legacy_report_rows" ADD CONSTRAINT "legacy_report_rows_item_id_advertiser_report_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."advertiser_report_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_report_rows_file_row" ON "legacy_report_rows" USING btree ("file_hash","source_row");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_report_rows_item" ON "legacy_report_rows" USING btree ("item_id");