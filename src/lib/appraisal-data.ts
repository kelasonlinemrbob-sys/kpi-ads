import "server-only";
import { and, between, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { advertiserReportItems, dailyReports } from "@/db/schema";

export type ReportActuals = { leads: number; spent: number; cpl: number | null; days: number };

/**
 * Lead and spend of an advertiser over a date range, from the full-day periods of their daily
 * reports (the same numbers the KPI scorecard uses). Used to fill in "Real" for Jumlah Lead and CPL.
 */
export async function getReportActuals(userId: number, start: string, end: string): Promise<ReportActuals> {
  const [row] = await db
    .select({
      leads: sql<number>`coalesce(sum(${advertiserReportItems.leads}), 0)`.mapWith(Number),
      spent: sql<number>`coalesce(sum(${advertiserReportItems.spent}), 0)`.mapWith(Number),
      days: sql<number>`count(distinct ${advertiserReportItems.performanceDate})`.mapWith(Number),
    })
    .from(advertiserReportItems)
    .innerJoin(dailyReports, eq(dailyReports.id, advertiserReportItems.reportId))
    .where(
      and(
        eq(dailyReports.userId, userId),
        eq(advertiserReportItems.window, "previous_day"),
        between(advertiserReportItems.performanceDate, start, end),
      ),
    );
  const leads = row?.leads ?? 0;
  const spent = Math.round(row?.spent ?? 0);
  return { leads, spent, cpl: leads > 0 ? Math.round(spent / leads) : null, days: row?.days ?? 0 };
}
