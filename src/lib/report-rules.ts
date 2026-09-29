import "server-only";
import { cache } from "react";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { DEFAULT_REPORT_RULES, type ReportRules } from "@/lib/reporting";

const KEYS = { cutoff: "report.cutoff", backfillDays: "report.backfill_days" } as const;

/** Reporting rules from Settings → Aturan Laporan, falling back to the defaults. Cached per request. */
export const getReportRules = cache(async (): Promise<ReportRules> => {
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, Object.values(KEYS)));
  const value = (key: string) => rows.find((r) => r.key === key)?.value;
  const cutoff = value(KEYS.cutoff);
  const backfill = Number(value(KEYS.backfillDays));
  return {
    cutoff: cutoff && /^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff) ? cutoff : DEFAULT_REPORT_RULES.cutoff,
    backfillDays: Number.isInteger(backfill) && backfill >= 1 && backfill <= 31 ? backfill : DEFAULT_REPORT_RULES.backfillDays,
  };
});

export async function saveReportRules(rules: ReportRules, userId: number) {
  for (const [key, value] of [
    [KEYS.cutoff, rules.cutoff],
    [KEYS.backfillDays, String(rules.backfillDays)],
  ] as const) {
    await db
      .insert(appSettings)
      .values({ key, value, updatedById: userId })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedById: userId, updatedAt: new Date() } });
  }
}
