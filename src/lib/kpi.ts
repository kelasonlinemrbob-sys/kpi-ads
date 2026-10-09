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

// ---------- date windows (a month or a custom range) ----------

/** Days from `start` to `end`, both included. */
export function daysInclusive(start: string, end: string) {
  return Math.round((parseISODate(end).getTime() - parseISODate(start).getTime()) / 86_400_000) + 1;
}

/**
 * The dates a dashboard reads: a calendar month or any range. `asOf` is the last day that counts
 * (today while the window is running); `month` is the month of `asOf`, for month-only pages and targets.
 */
export type DateWindow = { kind: "month" | "range"; start: string; end: string; asOf: string; days: number; month: string };

export function monthWindow(period: string): DateWindow {
  const { start, end, days } = periodRange(period);
  return { kind: "month", start, end, asOf: periodAsOf(period), days, month: period };
}

export function rangeWindow(start: string, end: string, today = todayISO()): DateWindow {
  const asOf = today < start ? start : today < end ? today : end;
  return { kind: "range", start, end, asOf, days: daysInclusive(start, end), month: asOf.slice(0, 7) };
}

/**
 * What a window is compared with: the previous month for a month (same elapsed days, like
 * comparableRange), else the range of the same length right before it.
 */
export function previousWindow(w: DateWindow): DateWindow {
  const elapsed = daysInclusive(w.start, w.asOf);
  if (w.kind === "month") {
    const prev = monthWindow(shiftPeriod(w.month, -1));
    return { ...prev, asOf: addDays(prev.start, Math.min(elapsed, prev.days) - 1) };
  }
  const start = addDays(w.start, -w.days);
  const end = addDays(w.start, -1);
  const asOf = addDays(start, elapsed - 1);
  return { kind: "range", start, end, asOf, days: w.days, month: asOf.slice(0, 7) };
}

/** How many of the window's days fall in each calendar month — monthly targets are prorated by it. */
export function windowSlices(w: Pick<DateWindow, "start" | "end">) {
  const slices: { month: string; days: number; monthDays: number }[] = [];
  for (let month = w.start.slice(0, 7); month <= w.end.slice(0, 7); month = shiftPeriod(month, 1)) {
    const r = periodRange(month);
    const from = r.start > w.start ? r.start : w.start;
    const to = r.end < w.end ? r.end : w.end;
    slices.push({ month, days: daysInclusive(from, to), monthDays: r.days });
  }
  return slices;
}

/** A month's targets and how many of its days the window covers. */
export type TargetSlice = { days: number; monthDays: number; targets: Map<number, number> };

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
    if (!entries.some(e => e.metricId === num.id) || !entries.some(e => e.metricId === den.id)) return null;
    // A partial LPV denominator would overstate cost; missing LPV is not zero.
    if (metric.key === "cplv" && entries.some((e) => e.metricId === num.id &&
      !entries.some((v) => v.metricId === den.id && v.userId === e.userId && v.date === e.date))) return null;
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
      const total = [...latest.values()].reduce((s, e) => s + e.value, 0);
      return metric.key === "task_completion" ? total / latest.size : total;
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
  targets: Map<number, number>; // metricId -> override in the metric's targetMode units
  previousEntries?: Entry[]; // full previous calendar month, for growth targets
  period: string;
  asOf: string;
  /** Scales default targets for someone who spends only part of their time on this role (0.6 = 60%). */
  targetScale?: number;
  /** A custom range instead of the whole `period` month. */
  window?: { start: string; end: string };
  /** Targets of every month the window touches; defaults to `targets` for the whole window. */
  targetSlices?: TargetSlice[];
}): { score: number | null; results: MetricResult[] } {
  const { start, end } = opts.window ?? periodRange(opts.period);
  const days = daysInclusive(start, end);
  const elapsed = Math.max(1, daysInclusive(start, opts.asOf));
  const fraction = Math.min(1, elapsed / days);
  const byKey = new Map(opts.allMetrics.map((m) => [m.key, m]));
  const slices = opts.targetSlices ?? [{ days, monthDays: days, targets: opts.targets }];

  const results: MetricResult[] = opts.metrics.map((metric) => {
    const actual = aggregate(metric, opts.entries, byKey);
    const target = windowTarget(metric, slices, opts.previousEntries ?? [], byKey, opts.targetScale ?? 1);
    const expected = target === null ? null : metric.aggregation === "sum" ? target * fraction : target;
    const unavailable = actual === null && (metric.key === "task_completion" || metric.key === "cplv");
    return { metric, actual, target, expected, achievement: unavailable ? null : achievementOf(metric, actual, expected) };
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

/**
 * The target over the window. A per-member override is taken as-is; the default shrinks with the
 * member's share of the role. Monthly totals are prorated by the days the window covers in each month,
 * daily standards multiply by those days, averages/ratios are weighted by them, and growth applies the
 * latest month's rate to the previous window.
 */
function windowTarget(metric: KpiMetric, slices: TargetSlice[], previousEntries: Entry[], byKey: Map<string, KpiMetric>, scale: number) {
  if (metric.targetMode === "growth") {
    const configured = slices[slices.length - 1]!.targets.get(metric.id) ?? metric.defaultTarget;
    if (configured === null) return null;
    const baseline = aggregate(metric, previousEntries, byKey);
    return baseline !== null && baseline > 0 ? baseline * (1 + configured / 100) : null;
  }
  const averaged = metric.targetMode !== "daily" && metric.aggregation !== "sum";
  let total = 0;
  let weight = 0;
  for (const s of slices) {
    const override = s.targets.get(metric.id);
    const configured = override ?? metric.defaultTarget;
    if (configured === null) continue;
    if (averaged) {
      total += configured * s.days;
      weight += s.days;
      continue;
    }
    const part = metric.targetMode === "daily" ? configured * s.days : (configured * s.days) / s.monthDays;
    total += override === undefined ? scaleTarget(metric, part, scale) : part;
    weight += s.days;
  }
  if (!weight) return null;
  return averaged ? total / weight : total;
}

/** Monthly totals scale with role share; daily standards, averages, ratios and growth rates don't. */
export function scaleTarget(metric: KpiMetric, target: number, scale: number) {
  return metric.aggregation === "sum" && metric.targetMode === "monthly" && scale !== 1 ? target * scale : target;
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
