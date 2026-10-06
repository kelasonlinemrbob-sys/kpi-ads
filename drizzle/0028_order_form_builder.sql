ALTER TABLE "order_forms" ADD COLUMN "appearance" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "order_forms" ADD COLUMN "tracking" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "order_forms" ADD COLUMN "weights" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "order_forms" ADD COLUMN "routing_credits" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "order_leads" ADD COLUMN "payment_status" varchar(16) DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_leads" ADD COLUMN "revenue" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_leads" ADD COLUMN "follow_up_step" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_leads" ADD COLUMN "follow_up_at" timestamp with time zone;