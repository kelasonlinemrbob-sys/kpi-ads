import type { KpiMetric } from "@/db/schema";
import { aggregate, periodRange, scoreMember, shiftPeriod, type Entry } from "@/lib/kpi";

export const SEO_REPORT_KEYS = ["seo_score", "articles", "seo_impressions", "seo_clicks"] as const;
export type SeoReportKey = (typeof SEO_REPORT_KEYS)[number];
export const isSeoReportKey = (key: string): key is SeoReportKey => SEO_REPORT_KEYS.some((k) => k === key);

export type SeoDailyTarget = {
  key: SeoReportKey;
  name: string;
  dailyTarget: number | null;
  monthlyTarget: number | null;
  expectedToDate: number | null;
  baseline: number | null;
  growthPercent: number | null;
  /** Month-to-date total before the selected day; excludes the value being edited. */
  beforeToday: number;
};

export function buildSeoDailyTargets(opts: {
  date: string;
  metrics: KpiMetric[];
  entries: Entry[]; // one member's history
  targets: Map<number, number>;
}): SeoDailyTarget[] {
  const period = opts.date.slice(0, 7);
  const { start, days } = periodRange(period);
  const previous = periodRange(shiftPeriod(period, -1));
  const previousEntries = opts.entries.filter((e) => e.date >= previous.start && e.date <= previous.end);
  const beforeToday = opts.entries.filter((e) => e.date >= start && e.date < opts.date);
  const metrics = SEO_REPORT_KEYS.flatMap((key) => opts.metrics.filter((m) => m.role === "seo" && m.key === key));
  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const { results } = scoreMember({ metrics, allMetrics: metrics, entries: [], previousEntries, targets: opts.targets, period, asOf: opts.date });
  return results.map(({ metric, target, expected }) => ({
    key: metric.key as SeoReportKey,
    name: metric.name,
    dailyTarget: target === null ? null : metric.aggregation === "sum" ? target / days : target,
    monthlyTarget: metric.aggregation === "sum" ? target : null,
    expectedToDate: expected,
    baseline: metric.targetMode === "growth" ? aggregate(metric, previousEntries, byKey) : null,
    growthPercent: metric.targetMode === "growth" ? opts.targets.get(metric.id) ?? metric.defaultTarget : null,
    beforeToday: aggregate(metric, beforeToday, byKey) ?? 0,
  }));
}

export function seoDailyProgress(target: SeoDailyTarget, value: number | null) {
  const growth = target.key === "seo_impressions" || target.key === "seo_clicks";
  const actual = value === null ? null : growth ? target.beforeToday + value : value;
  const expected = growth ? target.expectedToDate : target.dailyTarget;
  const achieved = actual === null || expected === null ? null : actual + 1e-9 >= expected;
  return { growth, actual, expected, achieved };
}

export function seoValueError(key: SeoReportKey, value: number): string | null {
  if (!Number.isFinite(value) || value < 0) return "Masukkan angka 0 atau lebih.";
  if (key === "seo_score") return value <= 100 ? null : "SEO Score harus berada di antara 0–100.";
  return Number.isSafeInteger(value) ? null : "Jumlah artikel, impression, dan klik harus berupa bilangan bulat.";
}
