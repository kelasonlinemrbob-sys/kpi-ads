import { addDays, parseISODate } from "@/lib/utils";

/**
 * Reporting rules a supervisor can change in Settings → Aturan Laporan (stored in app_settings, read on
 * the server with getReportRules()). These are the defaults.
 */
export type ReportRules = { /** "HH:MM" deadline for the advertiser report and end of the "today" period. */ cutoff: string; /** How many days back a report can still be filled in or edited. */ backfillDays: number };
export const DEFAULT_REPORT_RULES: ReportRules = { cutoff: "15:30", backfillDays: 7 };

export const ADVERTISER_REPORT_CUTOFF = DEFAULT_REPORT_RULES.cutoff;
export const ADVERTISER_REPORT_TIMEZONE = "WIB";

/** "15:30" → "15.30" (Indonesian time notation). */
export const formatCutoff = (cutoff: string) => cutoff.replace(":", ".");

export type AdvertiserReportWindow = "previous_day" | "today_to_cutoff";

export function isAdvertiserReportDay(date: string) {
  const day = parseISODate(date).getDay();
  return day >= 1 && day <= 5;
}

export function latestAdvertiserReportDate(date: string) {
  let candidate = date;
  while (!isAdvertiserReportDay(candidate)) candidate = addDays(candidate, -1);
  return candidate;
}

export function advertiserReportDeadlinePassed(now = new Date(), cutoff = DEFAULT_REPORT_RULES.cutoff) {
  const [h, m] = cutoff.split(":").map(Number);
  return now.getHours() * 60 + now.getMinutes() >= h! * 60 + m!;
}

export type AdvertiserReportPeriod = {
  /** Window type; every full day is "previous_day", the report day itself is "today_to_cutoff". */
  key: AdvertiserReportWindow;
  /** Day the numbers belong to — unique within one report, so it identifies the period. */
  performanceDate: string;
  title: string;
  /** Short tab label, e.g. "Kemarin", "Hari ini" or "Jumat". */
  label: string;
  timeRange: string;
};

const DAY_NAME = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/**
 * Periods an advertiser report covers. Tuesday–Friday: yesterday (full day) + today until the cutoff.
 * Monday also covers the weekend: Friday, Saturday and Sunday (full days) + Monday until the cutoff.
 */
export function advertiserReportWindows(reportDate: string, cutoff = DEFAULT_REPORT_RULES.cutoff): AdvertiserReportPeriod[] {
  const isMonday = parseISODate(reportDate).getDay() === 1;
  const fullDays = isMonday ? [-3, -2, -1] : [-1];
  return [
    ...fullDays.map((offset) => {
      const performanceDate = addDays(reportDate, offset);
      const dayName = DAY_NAME[parseISODate(performanceDate).getDay()]!;
      return {
        key: "previous_day" as const,
        performanceDate,
        title: isMonday ? `Hasil iklan ${dayName}` : "Hasil iklan kemarin",
        label: isMonday ? dayName : "Kemarin",
        timeRange: "00.00–24.00 WIB",
      };
    }),
    {
      key: "today_to_cutoff" as const,
      performanceDate: reportDate,
      title: "Hasil iklan hari ini",
      label: "Hari ini",
      timeRange: `00.00–${formatCutoff(cutoff)} WIB`,
    },
  ];
}

export type ReportRange = { value: string; label: string; start: string; end: string };

/**
 * Date range for the advertiser report list from ?range=: today, yesterday, 7d, 14d, 30d or a
 * month (YYYY-MM). Anything else falls back to the current month.
 */
export function resolveReportRange(raw: string | undefined, today: string, historicalMonths: string[] = []) {
  const monthLabel = (month: string) =>
    parseISODate(`${month}-01`).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  const monthRange = (month: string) => {
    const start = `${month}-01`;
    const next = parseISODate(start);
    next.setMonth(next.getMonth() + 1);
    return { start, end: addDays(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`, -1) };
  };
  const currentMonth = today.slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = parseISODate(`${currentMonth}-01`);
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const options: ReportRange[] = [
    { value: "today", label: "Hari ini", start: today, end: today },
    { value: "yesterday", label: "Kemarin", start: addDays(today, -1), end: addDays(today, -1) },
    { value: "7d", label: "7 hari terakhir", start: addDays(today, -6), end: today },
    { value: "14d", label: "14 hari terakhir", start: addDays(today, -13), end: today },
    { value: "30d", label: "30 hari terakhir", start: addDays(today, -29), end: today },
    // "all" is the URL default (no param): the current month.
    { value: "all", label: "Bulan ini", ...monthRange(currentMonth) },
    ...months.slice(1).map((month) => ({ value: month, label: monthLabel(month), ...monthRange(month) })),
  ];
  for (const month of historicalMonths) {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month < currentMonth && !options.some((o) => o.value === month)) {
      options.push({ value: month, label: monthLabel(month), ...monthRange(month) });
    }
  }
  const range = options.find((option) => option.value === raw) ?? options.find((option) => option.value === "all")!;
  return { range, options };
}
