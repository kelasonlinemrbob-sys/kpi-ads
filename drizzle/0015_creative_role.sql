-- New role "creative". The enum is recreated instead of ALTER TYPE ... ADD VALUE, because a value
-- added that way can't be used in the same transaction (the KPI metrics below use it).
ALTER TYPE "public"."role" RENAME TO "role_old";--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('supervisor', 'advertiser', 'webmaster', 'seo', 'creative');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."role" USING "role"::text::"public"."role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "secondary_role" TYPE "public"."role" USING "secondary_role"::text::"public"."role";--> statement-breakpoint
ALTER TABLE "kpi_metrics" ALTER COLUMN "role" TYPE "public"."role" USING "role"::text::"public"."role";--> statement-breakpoint
DROP TYPE "public"."role_old";--> statement-breakpoint
INSERT INTO "kpi_metrics" ("key", "name", "description", "role", "unit", "aggregation", "higher_is_better", "weight", "default_target", "sort_order") VALUES
  ('content_produced', 'Konten Diproduksi', 'Video / grafis iklan yang selesai dan diserahkan ke advertiser.', 'creative', 'number', 'sum', true, 40, 60, 1),
  ('content_live', 'Konten Tayang', 'Konten yang dipakai di iklan aktif (lihat menu Creative).', 'creative', 'number', 'sum', true, 25, 40, 2),
  ('content_winning', 'Konten Winning', 'Konten yang ditandai Winning oleh advertiser / supervisor.', 'creative', 'number', 'sum', true, 35, 6, 3)
ON CONFLICT ("key") DO NOTHING;
