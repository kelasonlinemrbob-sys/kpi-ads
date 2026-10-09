CREATE TABLE "creative_advertisers" (
	"creative_id" integer NOT NULL,
	"advertiser_id" integer NOT NULL,
	CONSTRAINT "creative_advertisers_creative_id_advertiser_id_pk" PRIMARY KEY("creative_id","advertiser_id")
);
--> statement-breakpoint
ALTER TABLE "creative_advertisers" ADD CONSTRAINT "creative_advertisers_creative_id_users_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_advertisers" ADD CONSTRAINT "creative_advertisers_advertiser_id_users_id_fk" FOREIGN KEY ("advertiser_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creative_advertisers_advertiser" ON "creative_advertisers" USING btree ("advertiser_id");