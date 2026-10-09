import { currentPeriod, daysInclusive, isPeriod, monthWindow, periodLabel, rangeWindow, shiftPeriod, todayISO, type DateWindow } from "@/lib/kpi";
import { addDays } from "@/lib/utils";

/** Period from ?period=YYYY-MM, clamped to the current month, plus the options for the picker. */
export function resolvePeriod(raw: string | string[] | undefined) {
  const now = currentPeriod();
  const p = typeof raw === "string" && isPeriod(raw) && raw <= now ? raw : now;
  const options = Array.from({ length: 12 }, (_, i) => {
    const value = shiftPeriod(now, -i);
    return { value, label: i === 0 ? `This month` : i === 1 ? "Last month" : periodLabel(value) };
  });
  if (!options.some((o) => o.value === p)) options.push({ value: p, label: periodLabel(p) });
  return { period: p, options };
}

/** Rolling ranges that always end today, so a bookmarked link stays current. */
export const ROLLING_RANGES = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "14d", label: "Last 14 days", days: 14 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
] as const;
/** Longest custom range (also bounds the per-day score series). */
export const MAX_RANGE_DAYS = 366;

export type DateSelection = { type: "month"; period: string } | { type: "rolling"; range: string } | { type: "custom"; from: string; to: string };

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;

const shortDate = (iso: string, withYear: boolean) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });

export function rangeLabel(from: string, to: string) {
  if (from === to) return shortDate(from, true);
  return `${shortDate(from, from.slice(0, 4) !== to.slice(0, 4))} – ${shortDate(to, true)}`;
}

/**
 * The dashboard's dates from ?range=7d, ?from=…&to=… (custom, up to 366 days, not after today) or
 * ?period=YYYY-MM (the default). Invalid input falls back to the month.
 */
export function resolveDateWindow(sp: { period?: string; range?: string; from?: string; to?: string }, today = todayISO()) {
  const { period, options } = resolvePeriod(sp.period);
  const rolling = ROLLING_RANGES.find((r) => r.value === sp.range);
  let window: DateWindow;
  let selection: DateSelection;
  let label: string;
  let compareLabel: string;
  if (rolling) {
    window = rangeWindow(addDays(today, -(rolling.days - 1)), today, today);
    selection = { type: "rolling", range: rolling.value };
    label = rolling.label;
    compareLabel = `vs previous ${rolling.days} days`;
  } else if (isISODate(sp.from) && isISODate(sp.to) && sp.from <= sp.to && sp.from <= today) {
    const to = sp.to > today ? today : sp.to;
    const from = daysInclusive(sp.from, to) > MAX_RANGE_DAYS ? addDays(to, -(MAX_RANGE_DAYS - 1)) : sp.from;
    window = rangeWindow(from, to, today);
    selection = { type: "custom", from, to };
    label = rangeLabel(from, to);
    compareLabel = `vs previous ${window.days} ${window.days === 1 ? "day" : "days"}`;
  } else {
    window = monthWindow(period);
    selection = { type: "month", period };
    label = options.find((o) => o.value === period)?.label ?? periodLabel(period);
    compareLabel = "vs last month";
  }
  const query = selection.type === "rolling" ? `range=${selection.range}` : selection.type === "custom" ? `from=${selection.from}&to=${selection.to}` : `period=${selection.period}`;
  return { window, selection, label, compareLabel, query, months: options, today };
}
