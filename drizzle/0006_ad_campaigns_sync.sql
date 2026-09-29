CREATE TABLE "ad_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"ad_account_id" integer NOT NULL,
	"external_id" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" "campaign_status" NOT NULL,
	"platform_status" varchar(40) NOT NULL,
	"objective" varchar(80),
	"daily_budget" double precision,
	"start_date" date,
	"end_date" date,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD COLUMN "last_sync_error" text;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_campaigns_account_external" ON "ad_campaigns" USING btree ("ad_account_id","external_id");