import type { KpiMetric } from "@/db/schema";
import { addDays, parseISODate, toISODate } from "@/lib/utils";

export type Entry = { userId: number; metricId: number; date: string; value: number };

// ---------- periods ----------

export function todayISO() {
  return toISODate(new Date());
}

export function currentPeriod() {
  return todayISO().slice(0, 7);
}

export function isPeriod(p: string | undefined): p is string {
  return !!p && /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
}

export function periodRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  const start = toISODate(new Date(y!, m! - 1, 1));
  const end = toISODate(new Date(y!, m!, 0));
  return { start, end, days: Number(end.slice(8)) };
}

export function shiftPeriod(period: string, n: number) {
  const [y, m] = period.split("-").map(Number);
  return toISODate(new Date(y!, m! - 1 + n, 1)).slice(0, 7);
}

export function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Last day of the period that counts: today for the running month, month end for past months. */
export function periodAsOf(period: string) {
  const { start, end } = periodRange(period);
  const today = todayISO();
  if (today < start) return start;
  return today < end ? today : end;
}

export function datesBetween(start: string, end: string) {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Same number of elapsed days, one month earlier — for "vs last month" deltas. */
export function comparableRange(period: string, asOf: string) {
  const prev = shiftPeriod(period, -1);
  const { start, days } = periodRange(prev);
  const elapsed = Number(asOf.slice(8));
  return { start, end: addDays(start, Math.min(elapsed, days) - 1), period: prev };
}

// ---------- aggregation ----------

export function aggregate(
  metric: KpiMetric,
  entries: Entry[],
  metricsByKey: Map<string, KpiMetric>,
): number | null {
  if (metric.aggregation === "ratio") {
    const num = metricsByKey.get(metric.numeratorKey ?? "");
    const den = metricsByKey.get(metric.denominatorKey ?? "");
    if (!num || !den) return null;
    let n = 0;
    let d = 0;
    for (const e of entries) {
      if (e.metricId === num.id) n += e.value;
      else if (e.metricId === den.id) d += e.value;
    }
    return d > 0 ? n / d : null;
  }
  const own = entries.filter((e) => e.metricId === metric.id);
  if (own.length === 0) return null;
  switch (metric.aggregation) {
    case "sum":
      return own.reduce((s, e) => s + e.value, 0);
    case "avg":
      return own.reduce((s, e) => s + e.value, 0) / own.length;
    case "last": {
      // latest value per user, summed across users (e.g. keywords ranked by the whole team)
      const latest = new Map<number, Entry>();
      for (const e of own) {
        const cur = latest.get(e.userId);
        if (!cur || e.date > cur.date) latest.set(e.userId, e);
      }
      return [...latest.values()].reduce((s, e) => s + e.value, 0);
    }
  }
}

// ---------- scoring ----------

export const MAX_ACHIEVEMENT = 1.2;

export type MetricResult = {
  metric: KpiMetric;
  actual: number | null;
  target: number | null;
  /** target scaled to the elapsed part of the month (sum metrics only) */
  expected: number | null;
  achievement: number | null; // 0..MAX_ACHIEVEMENT
};

export function achievementOf(metric: KpiMetric, actual: number | null, expected: number | null) {
  if (expected === null || expected <= 0) return null;
  if (actual === null) return 0;
  const raw = metric.higherIsBetter ? actual / expected : actual <= 0 ? MAX_ACHIEVEMENT : expected / actual;
  return Math.max(0, Math.min(MAX_ACHIEVEMENT, raw));
}

export function scoreMember(opts: {
  metrics: KpiMetric[]; // metrics of the member's role
  allMetrics: KpiMetric[];
  entries: Entry[]; // member's entries within [period start, asOf]
  targets: Map<number, number>; // metricId -> monthly target override
  period: string;
  asOf: string;
}): { score: number | null; results: MetricResult[] } {
  const { start, days } = periodRange(opts.period);
  const elapsed = Math.max(1, Math.round((parseISODate(opts.asOf).getTime() - parseISODate(start).getTime()) / 86_400_000) + 1);
  const fraction = Math.min(1, elapsed / days);
  const byKey = new Map(opts.allMetrics.map((m) => [m.key, m]));

  const results: MetricResult[] = opts.metrics.map((metric) => {
    const actual = aggregate(metric, opts.entries, byKey);
    const target = opts.targets.get(metric.id) ?? metric.defaultTarget ?? null;
    const expected = target === null ? null : metric.aggregation === "sum" ? target * fraction : target;
    return { metric, actual, target, expected, achievement: achievementOf(metric, actual, expected) };
  });

  let weighted = 0;
  let totalWeight = 0;
  for (const r of results) {
    if (r.metric.weight <= 0 || r.achievement === null) continue;
    weighted += r.achievement * r.metric.weight;
    totalWeight += r.metric.weight;
  }
  return { score: totalWeight ? (weighted / totalWeight) * 100 : null, results };
}

export type KpiStatus = "exceeding" | "on_track" | "at_risk" | "off_track" | "no_data";

export function statusOf(score: number | null): KpiStatus {
  if (score === null) return "no_data";
  if (score >= 100) return "exceeding";
  if (score >= 80) return "on_track";
  if (score >= 60) return "at_risk";
  return "off_track";
}

export const STATUS_META: Record<KpiStatus, { label: string; tone: "success" | "info" | "warning" | "destructive" | "muted" }> = {
  exceeding: { label: "Exceeding", tone: "success" },
  on_track: { label: "On Track", tone: "info" },
  at_risk: { label: "At Risk", tone: "warning" },
  off_track: { label: "Off Track", tone: "destructive" },
  no_data: { label: "No Data", tone: "muted" },
};

export function pctDelta(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Daily series of one metric across a set of entries (already filtered by user). */
export function dailySeries(
  metric: KpiMetric,
  entries: Entry[],
  allMetrics: KpiMetric[],
  dates: string[],
): { date: string; value: number }[] {
  const byKey = new Map(allMetrics.map((m) => [m.key, m]));
  const byDate = new Map<string, Entry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }
  return dates.map((date) => {
    const list = byDate.get(date) ?? [];
    const v = metric.aggregation === "last" ? avgOf(list.filter((e) => e.metricId === metric.id)) : aggregate(metric, list, byKey);
    return { date, value: v ?? 0 };
  });
}

function avgOf(list: Entry[]) {
  return list.length ? list.reduce((s, e) => s + e.value, 0) / list.length : null;
}

/** Report days expected between two dates. Advertisers use Monday–Friday; legacy roles may include Saturday. */
export function workingDays(start: string, end: string, mondayToFriday = false) {
  return datesBetween(start, end).filter((date) => {
    const day = parseISODate(date).getDay();
    return day !== 0 && (!mondayToFriday || day !== 6);
  }).length;
}
