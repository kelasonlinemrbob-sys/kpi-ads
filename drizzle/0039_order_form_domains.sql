CREATE TABLE "order_form_domains" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"hostname" varchar(253) NOT NULL,
	"verification_token" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'pending_dns' NOT NULL,
	"error" text,
	"checked_at" timestamp with time zone,
	"tls_attempt_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_form_domains_form_id_unique" UNIQUE("form_id"),
	CONSTRAINT "order_form_domains_hostname_unique" UNIQUE("hostname")
);
--> statement-breakpoint
ALTER TABLE "order_form_domains" ADD CONSTRAINT "order_form_domains_form_id_order_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."order_forms"("id") ON DELETE restrict ON UPDATE no action;