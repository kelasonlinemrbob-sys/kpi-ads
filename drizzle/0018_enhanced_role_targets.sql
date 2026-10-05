ALTER TABLE "advertiser_report_items" ADD COLUMN "landing_page_views" integer;--> statement-breakpoint
ALTER TABLE "kpi_metrics" ADD COLUMN "target_mode" varchar(12) DEFAULT 'monthly' NOT NULL;
--> statement-breakpoint
UPDATE kpi_metrics SET weight = 0 WHERE role IN ('advertiser', 'seo', 'webmaster');
UPDATE kpi_metrics SET name = 'Jumlah Chat', weight = 40, description = 'Jumlah chat / result dari iklan. Target dapat diisi harian atau bulanan.' WHERE key = 'leads';
UPDATE kpi_metrics SET name = 'CPR', weight = 30, description = 'Cost per Result = total spend ÷ jumlah chat / result. Semakin rendah semakin baik.' WHERE key = 'cpl';
UPDATE kpi_targets SET target = GREATEST(1, target / EXTRACT(DAY FROM (TO_DATE(period || '-01', 'YYYY-MM-DD') + INTERVAL '1 month - 1 day'))) WHERE metric_id IN (SELECT id FROM kpi_metrics WHERE key = 'articles');
UPDATE kpi_metrics SET default_target = 1, target_mode = 'daily', weight = 25, description = 'Minimal 1 artikel per hari kalender. Target bulanan mengikuti jumlah hari dalam bulan.' WHERE key = 'articles';
INSERT INTO kpi_metrics (key, name, role, unit, aggregation, numerator_key, denominator_key, higher_is_better, weight, default_target, target_mode, sort_order, description) VALUES
('landing_page_views', 'Landing Page Views', 'advertiser', 'number', 'sum', NULL, NULL, true, 0, NULL, 'monthly', 7, 'Jumlah kunjungan landing page (LPV), bukan jumlah klik. Isi dari data Ads.'),
('cplv', 'CPLV', 'advertiser', 'currency', 'ratio', 'ad_spend', 'landing_page_views', false, 30, NULL, 'monthly', 8, 'Cost per Landing Page View = total spend ÷ LPV. Tetapkan batas biaya di KPI Targets.'),
('seo_score', 'SEO Score', 'seo', 'number', 'avg', NULL, NULL, true, 25, 85, 'monthly', 5, 'Skor SEO harian 0–100, target minimal 85.'),
('seo_impressions', 'Impression Organik', 'seo', 'number', 'sum', NULL, NULL, true, 25, 5, 'growth', 6, 'Impression organik harian. Target naik minimal 5% dari total bulan sebelumnya; tanpa baseline positif, belum dinilai.'),
('seo_clicks', 'Klik Organik', 'seo', 'number', 'sum', NULL, NULL, true, 25, 5, 'growth', 7, 'Klik organik harian. Target naik minimal 5% dari total bulan sebelumnya; tanpa baseline positif, belum dinilai.'),
('task_completion', 'Penyelesaian Task', 'webmaster', 'percent', 'last', NULL, NULL, true, 100, 100, 'monthly', 5, 'Task selesai ÷ seluruh task dalam cakupan bulan × 100%. Termasuk backlog; tanpa task, belum dinilai.')
ON CONFLICT (key) DO NOTHING;
