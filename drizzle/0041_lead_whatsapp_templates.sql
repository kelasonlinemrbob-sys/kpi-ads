CREATE TABLE "lead_wa_templates" (
	"campaign_id" integer PRIMARY KEY NOT NULL,
	"messages" jsonb NOT NULL,
	"updated_by" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_leads" ADD COLUMN "wa_opened_at" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_wa_templates" ADD CONSTRAINT "lead_wa_templates_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_wa_templates" ADD CONSTRAINT "lead_wa_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;