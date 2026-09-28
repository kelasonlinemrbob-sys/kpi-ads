import { currentPeriod, isPeriod, periodLabel, shiftPeriod } from "@/lib/kpi";

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
