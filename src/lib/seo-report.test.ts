import assert from "node:assert/strict";
import { test } from "node:test";
import type { KpiMetric } from "@/db/schema";
import { buildSeoDailyTargets, seoDailyProgress, seoValueError } from "./seo-report";
import type { Entry } from "./kpi";

const defaults: KpiMetric = { id: 1, key: "seo_score", name: "SEO Score", description: null, role: "seo", unit: "number", aggregation: "avg", numeratorKey: null, denominatorKey: null, higherIsBetter: true, weight: 25, defaultTarget: 85, targetMode: "monthly", sortOrder: 1 };
const metrics: KpiMetric[] = [
  defaults,
  { ...defaults, id: 2, key: "articles", aggregation: "sum", targetMode: "daily", defaultTarget: 1 },
  { ...defaults, id: 3, key: "seo_impressions", aggregation: "sum", targetMode: "growth", defaultTarget: 5 },
  { ...defaults, id: 4, key: "seo_clicks", aggregation: "sum", targetMode: "growth", defaultTarget: 5 },
];
const entry = (metricId: number, date: string, value: number): Entry => ({ userId: 1, metricId, date, value });
const targets = (entries: Entry[] = [], date = "2026-02-14", overrides = new Map<number, number>()) => buildSeoDailyTargets({ date, metrics, entries, targets: overrides });

test("daily report follows member targets and calendar month length", () => {
  const result = targets([], "2024-02-14", new Map([[1, 90], [2, 2]]));
  assert.equal(result[0]!.dailyTarget, 90);
  assert.equal(result[1]!.dailyTarget, 2);
  assert.equal(result[1]!.monthlyTarget, 58);
  assert.equal(result[1]!.expectedToDate, 28);
  assert.equal(seoDailyProgress(result[0]!, 89).achieved, false);
  assert.equal(seoDailyProgress(result[0]!, 90).achieved, true);
});

test("editing a daily report replaces today's numbers and excludes future entries", () => {
  const result = targets([
    entry(3, "2026-01-01", 500), entry(3, "2026-01-31", 500),
    entry(3, "2026-02-13", 500), entry(3, "2026-02-14", 200), entry(3, "2026-02-15", 800),
  ])[2]!;
  assert.equal(result.baseline, 1000);
  assert.equal(result.beforeToday, 500);
  assert.equal(result.monthlyTarget, 1050);
  assert.equal(result.expectedToDate, 525);
  assert.equal(result.dailyTarget, 37.5);
  assert.equal(seoDailyProgress(result, 25).actual, 525);
  assert.equal(seoDailyProgress(result, 25).achieved, true);
  assert.equal(seoDailyProgress(result, 24).achieved, false);
});

test("zero and missing baselines show no fabricated growth goal", () => {
  for (const entries of [[], [entry(4, "2026-01-31", 0)]]) {
    const target = targets(entries)[3]!;
    assert.equal(target.dailyTarget, null);
    assert.equal(target.monthlyTarget, null);
    assert.equal(seoDailyProgress(target, 100).achieved, null);
  }
});

test("blank daily values stay unreported; explicit zero is evaluated", () => {
  const target = targets()[1]!;
  assert.equal(seoDailyProgress(target, null).actual, null);
  assert.equal(seoDailyProgress(target, null).achieved, null);
  assert.equal(seoDailyProgress(target, 0).achieved, false);
  assert.equal(seoDailyProgress(target, 1).achieved, true);
});

test("growth override and month boundary use only the previous calendar month", () => {
  const target = targets([entry(3, "2025-12-31", 9999), entry(3, "2026-01-31", 280)], "2026-02-01", new Map([[3, 10]]))[2]!;
  assert.equal(target.baseline, 280);
  assert.ok(Math.abs(target.monthlyTarget! - 308) < 1e-9);
  assert.ok(Math.abs(target.expectedToDate! - 11) < 1e-9);
  assert.equal(target.beforeToday, 0);
});

test("daily report accepts below-target results but rejects invalid counts and scores", () => {
  assert.equal(seoValueError("seo_score", 84), null);
  assert.equal(seoValueError("seo_score", 85.5), null);
  assert.equal(seoValueError("articles", 0), null);
  assert.ok(seoValueError("articles", 1.5));
  assert.ok(seoValueError("seo_impressions", -1));
  assert.ok(seoValueError("seo_clicks", Infinity));
  assert.ok(seoValueError("seo_clicks", NaN));
  assert.ok(seoValueError("seo_score", 101));
});
