ALTER TABLE "ai_analyses" ADD COLUMN "credits" double precision;--> statement-breakpoint
CREATE INDEX "ai_analyses_kind_filter" ON "ai_analyses" USING btree ("kind","filter_key","created_at");