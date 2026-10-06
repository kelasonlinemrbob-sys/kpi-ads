ALTER TYPE "public"."role" ADD VALUE 'cso';--> statement-breakpoint
CREATE TABLE "order_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(32) NOT NULL,
	"owner_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"fields" jsonb NOT NULL,
	"routing" varchar(20) DEFAULT 'fixed' NOT NULL,
	"assignee_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cursor" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"source" varchar(12) DEFAULT 'ads' NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_forms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "order_lead_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"actor_id" integer NOT NULL,
	"detail" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" varchar(36) NOT NULL,
	"form_id" integer NOT NULL,
	"owner_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"assignee_id" integer NOT NULL,
	"cso_phone" varchar(20) NOT NULL,
	"product" varchar(120) NOT NULL,
	"source" varchar(12) NOT NULL,
	"platform" varchar(20) NOT NULL,
	"name" varchar(120),
	"phone" varchar(20),
	"email" varchar(180),
	"city" varchar(120),
	"date" date NOT NULL,
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"attribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"contact_hash" varchar(64) NOT NULL,
	"whatsapp_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_leads_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "advertiser_report_items" ADD COLUMN "ads_leads" integer;--> statement-breakpoint
ALTER TABLE "advertiser_report_items" ADD COLUMN "lead_source" varchar(12) DEFAULT 'ads' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "form_lead_since" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cso_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "order_forms" ADD CONSTRAINT "order_forms_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_forms" ADD CONSTRAINT "order_forms_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lead_events" ADD CONSTRAINT "order_lead_events_lead_id_order_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."order_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lead_events" ADD CONSTRAINT "order_lead_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_leads" ADD CONSTRAINT "order_leads_form_id_order_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."order_forms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_leads" ADD CONSTRAINT "order_leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_leads" ADD CONSTRAINT "order_leads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_leads" ADD CONSTRAINT "order_leads_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_leads_form_request" ON "order_leads" USING btree ("form_id","request_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "order_leads_form_contact_day" ON "order_leads" USING btree ("form_id","date","contact_hash");--> statement-breakpoint
CREATE INDEX "order_leads_owner_date" ON "order_leads" USING btree ("owner_id","date");--> statement-breakpoint
CREATE INDEX "order_leads_assignee_date" ON "order_leads" USING btree ("assignee_id","date");--> statement-breakpoint
CREATE INDEX "order_leads_campaign_date" ON "order_leads" USING btree ("campaign_id","date");