import { todayISO } from "./kpi";

export const CREATIVE_PERIODS = [
  { value: "7d", label: "7 hari terakhir" },
  { value: "14d", label: "14 hari terakhir" },
  { value: "30d", label: "30 hari terakhir" },
] as const;
export type CreativePeriodKey = (typeof CREATIVE_PERIODS)[number]["value"];
export function creativePeriod(value?: string | null, today = todayISO()) {
  const key = CREATIVE_PERIODS.find((p) => p.value === value)?.value ?? "7d";
  const days = Number(key.slice(0, -1));
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days + 1);
  return { key, days, start: date.toISOString().slice(0, 10), end: today, label: CREATIVE_PERIODS.find((p) => p.value === key)!.label };
}
export type CreativePeriod = ReturnType<typeof creativePeriod>;
export function validCreativeRange(start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  const a = Date.parse(`${start}T12:00:00Z`), b = Date.parse(`${end}T12:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) && new Date(a).toISOString().slice(0, 10) === start && new Date(b).toISOString().slice(0, 10) === end && b >= a && b - a < 30 * 86400000;
}
