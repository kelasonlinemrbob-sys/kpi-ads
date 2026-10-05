CREATE TABLE "creative_metrics" (
	"sync_id" integer NOT NULL,
	"creative_id" integer NOT NULL,
	"impressions" integer NOT NULL,
	"reach" integer NOT NULL,
	"video_views" integer NOT NULL,
	"thruplays" integer NOT NULL,
	"avg_play_time" double precision,
	"spend" double precision NOT NULL,
	"clicks" integer NOT NULL,
	"leads" integer NOT NULL,
	CONSTRAINT "creative_metrics_sync_id_creative_id_pk" PRIMARY KEY("sync_id","creative_id")
);
--> statement-breakpoint
CREATE TABLE "creative_syncs" (
	"id" serial PRIMARY KEY NOT NULL,
	"ad_account_id" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creative_metrics" ADD CONSTRAINT "creative_metrics_sync_id_creative_syncs_id_fk" FOREIGN KEY ("sync_id") REFERENCES "public"."creative_syncs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_metrics" ADD CONSTRAINT "creative_metrics_creative_id_ad_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."ad_creatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_syncs" ADD CONSTRAINT "creative_syncs_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creative_metrics_creative" ON "creative_metrics" USING btree ("creative_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_syncs_account_period" ON "creative_syncs" USING btree ("ad_account_id","period_start","period_end");