import assert from "node:assert/strict";
import { test } from "node:test";
import type { KpiMetric } from "@/db/schema";
import { aggregate, scoreMember, type Entry } from "./kpi";
import { taskCompletionAt } from "./task-kpi";
import { validTarget } from "./target-rules";

function metric(patch: Partial<KpiMetric> = {}): KpiMetric {
  return { id: 1, key: "articles", name: "Articles", description: null, role: "seo", unit: "number", aggregation: "sum", numeratorKey: null, denominatorKey: null, higherIsBetter: true, weight: 100, defaultTarget: 1, targetMode: "daily", sortOrder: 1, ...patch };
}
const entry = (metricId: number, value: number, date = "2026-02-14"): Entry => ({ metricId, value, date, userId: 1 });
function score(m: KpiMetric, entries: Entry[], patch: Partial<Parameters<typeof scoreMember>[0]> = {}) {
  return scoreMember({ metrics: [m], allMetrics: [m], entries, targets: new Map(), period: "2026-02", asOf: "2026-02-14", ...patch });
}

test("one article per calendar day respects 28, 29, 30 and 31 day months", () => {
  for (const [period, days] of [["2026-02", 28], ["2024-02", 29], ["2026-04", 30], ["2026-10", 31]] as const) {
    const result = score(metric(), [entry(1, 14)], { period, asOf: `${period}-14` });
    assert.equal(result.results[0]!.target, days);
    assert.equal(result.results[0]!.expected, 14);
    assert.equal(result.score, 100);
  }
});

test("daily standards stay at one article per day even for dual roles; monthly totals scale", () => {
  assert.equal(score(metric(), [], { targetScale: 0.4 }).results[0]!.target, 28);
  assert.equal(score(metric({ targetMode: "monthly", defaultTarget: 100 }), [], { targetScale: 0.4 }).results[0]!.target, 40);
  assert.equal(score(metric(), [], { targetScale: 0.4, targets: new Map([[1, 2]]) }).results[0]!.target, 56);
});

test("SEO growth target uses full previous month and elapsed-day pacing", () => {
  const m = metric({ key: "seo_impressions", targetMode: "growth", defaultTarget: 5 });
  const result = score(m, [entry(1, 525)], { previousEntries: [entry(1, 1000, "2026-01-31")], targetScale: 0.4 });
  assert.equal(result.results[0]!.target, 1050);
  assert.equal(result.results[0]!.expected, 525);
  assert.equal(result.score, 100);
});

test("missing or zero SEO baseline does not invent a growth score", () => {
  const m = metric({ key: "seo_clicks", targetMode: "growth", defaultTarget: 5 });
  for (const previousEntries of [[], [entry(1, 0)]]) {
    assert.equal(score(m, [entry(1, 20)], { previousEntries }).score, null);
  }
});

test("SEO growth member override is a percentage, not an absolute count", () => {
  const m = metric({ key: "seo_clicks", targetMode: "growth", defaultTarget: 5 });
  assert.ok(Math.abs(score(m, [], { previousEntries: [entry(1, 100)], targets: new Map([[1, 10]]) }).results[0]!.target! - 110) < 1e-9);
});

test("CPR and CPLV use weighted totals rather than averages of daily costs", () => {
  const spend = metric({ id: 2, key: "ad_spend" });
  const lpv = metric({ id: 3, key: "landing_page_views" });
  const cplv = metric({ key: "cplv", aggregation: "ratio", numeratorKey: "ad_spend", denominatorKey: "landing_page_views", targetMode: "monthly", higherIsBetter: false, defaultTarget: 10 });
  const allMetrics = [cplv, spend, lpv];
  const entries = [entry(2, 100), entry(3, 10), entry(2, 900, "2026-02-15"), entry(3, 40, "2026-02-15")];
  const result = score(cplv, entries, { allMetrics });
  assert.equal(result.results[0]!.actual, 20);
  assert.equal(result.score, 50);
  for (const missing of [entries.filter((e) => e.metricId !== 3), entries.slice(0, 3), [entry(2, 100), entry(3, 0)]]) {
    assert.equal(score(cplv, missing, { allMetrics }).score, null);
  }
  const cpr = { ...cplv, key: "cpl", denominatorKey: "leads" };
  assert.equal(aggregate(cpr, entries, new Map([["ad_spend", spend], ["leads", lpv]])), 20);
  assert.equal(aggregate(cpr, [entry(3, 5)], new Map([["ad_spend", spend], ["leads", lpv]])), null, "No spend data must not imply free leads");
});

const task = (patch: Partial<Parameters<typeof taskCompletionAt>[0][number]> = {}) => ({ assigneeId: 1, status: "todo", dueDate: "2026-02-28", createdAt: new Date("2026-02-01T00:00:00+07:00"), completedAt: null, ...patch });
test("task completion includes backlog, review, and no-due-date tasks", () => {
  const tasks = [
    task({ status: "done", completedAt: new Date("2026-02-10T00:00:00+07:00") }),
    task({ status: "review", dueDate: "2026-01-31", createdAt: new Date("2026-01-01T00:00:00+07:00") }),
    task({ dueDate: null }),
    task({ dueDate: "2026-03-01" }),
    task({ status: "done", completedAt: new Date("2026-01-31T00:00:00+07:00") }),
    task({ createdAt: new Date("2026-02-20T00:00:00+07:00") }),
  ];
  assert.ok(Math.abs(taskCompletionAt(tasks, "2026-02-01", "2026-02-28", "2026-02-14")! - 100 / 3) < 1e-9);
  assert.equal(taskCompletionAt([], "2026-02-01", "2026-02-28", "2026-02-14"), null);
});

test("completed after the scoring date still counts as unfinished", () => {
  assert.equal(taskCompletionAt([task({ status: "done", completedAt: new Date("2026-02-20T00:00:00+07:00") })], "2026-02-01", "2026-02-28", "2026-02-14"), 0);
});

test("task score uses latest completion rate without time or role proration", () => {
  const m = metric({ key: "task_completion", aggregation: "last", unit: "percent", targetMode: "monthly", defaultTarget: 100 });
  assert.equal(score(m, [entry(1, 50, "2026-02-13"), entry(1, 100)], { targetScale: 0.4 }).score, 100);
  assert.equal(score(m, []).score, null);
});

test("target validation enforces SEO minima and exactly 100% completion", () => {
  for (const [key, min] of [["seo_score", 85], ["articles", 1], ["seo_impressions", 5], ["seo_clicks", 5], ["task_completion", 100]] as const) {
    assert.equal(validTarget(key, min), true);
    assert.equal(validTarget(key, min - 1), false);
    assert.equal(validTarget(key, null, true), false);
    assert.equal(validTarget(key, null), true);
  }
  assert.equal(validTarget("seo_score", 101), false);
  assert.equal(validTarget("task_completion", 101), false);
  assert.equal(validTarget("cplv", null, true), true);
  assert.equal(validTarget("leads", Infinity), false);
});
