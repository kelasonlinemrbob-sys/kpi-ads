ALTER TABLE "meta_capi_outbox" ADD COLUMN "error_code" integer;--> statement-breakpoint
ALTER TABLE "meta_capi_outbox" ADD COLUMN "trace_id" varchar(100);--> statement-breakpoint
ALTER TABLE "order_form_capi" ADD COLUMN "test_succeeded" boolean;