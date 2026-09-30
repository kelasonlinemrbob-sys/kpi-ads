CREATE TYPE "public"."creative_format" AS ENUM('video', 'grafis', 'carousel', 'lainnya');--> statement-breakpoint
CREATE TYPE "public"."creative_label" AS ENUM('winning', 'good', 'average', 'poor');--> statement-breakpoint
CREATE TYPE "public"."creative_status" AS ENUM('active', 'paused', 'review', 'takedown');--> statement-breakpoint
CREATE TABLE "ad_creatives" (
	"id" serial PRIMARY KEY NOT NULL,
	"ad_account_id" integer NOT NULL,
	"external_ad_id" varchar(64) NOT NULL,
	"ad_name" varchar(255) NOT NULL,
	"campaign_external_id" varchar(64),
	"campaign_name" varchar(255),
	"objective" varchar(60),
	"post_id" varchar(80),
	"permalink" text,
	"thumbnail_url" text,
	"format" "creative_format" DEFAULT 'lainnya' NOT NULL,
	"format_override" "creative_format",
	"status" "creative_status" NOT NULL,
	"platform_status" varchar(40),
	"impressions" integer DEFAULT 0 NOT NULL,
	"thruplays" integer DEFAULT 0 NOT NULL,
	"avg_play_time" double precision,
	"spend" double precision DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"leads" integer DEFAULT 0 NOT NULL,
	"label" "creative_label",
	"creator_id" integer,
	"editor_id" integer,
	"note" text,
	"ad_created_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_editor_id_users_id_fk" FOREIGN KEY ("editor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_creatives_account_ad" ON "ad_creatives" USING btree ("ad_account_id","external_ad_id");--> statement-breakpoint
CREATE INDEX "ad_creatives_creator" ON "ad_creatives" USING btree ("creator_id");