CREATE TABLE "meta_capi_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"lead_id" integer NOT NULL,
	"event_id" varchar(36) NOT NULL,
	"event_name" varchar(40) NOT NULL,
	"pixel_id" varchar(25) NOT NULL,
	"config_version" varchar(36) NOT NULL,
	"payload" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_capi_outbox_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "order_form_capi" (
	"form_id" integer PRIMARY KEY NOT NULL,
	"pixel_id" varchar(25) NOT NULL,
	"token" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"version" varchar(36) NOT NULL,
	"test_status" text,
	"tested_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_leads" ADD COLUMN "measurement_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_leads" ADD COLUMN "meta_tracking" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_capi_outbox" ADD CONSTRAINT "meta_capi_outbox_form_id_order_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."order_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_capi_outbox" ADD CONSTRAINT "meta_capi_outbox_lead_id_order_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."order_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_form_capi" ADD CONSTRAINT "order_form_capi_form_id_order_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."order_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meta_capi_due" ON "meta_capi_outbox" USING btree ("status","next_attempt_at");