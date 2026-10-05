import "server-only";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { kpiEntries } from "@/db/schema";
import { getMetrics, getTargetMap } from "@/lib/data";
import { periodRange, shiftPeriod } from "@/lib/kpi";
import { buildSeoDailyTargets, isSeoReportKey } from "@/lib/seo-report";

/** Call only after verifying the viewer can access this member's reports. */
export async function getSeoDailyTargets(userId: number, date: string) {
  const period = date.slice(0, 7);
  const previous = periodRange(shiftPeriod(period, -1));
  const metrics = (await getMetrics()).filter((m) => m.role === "seo" && isSeoReportKey(m.key));
  if (!metrics.length) return [];
  const [entries, targets] = await Promise.all([
    db.select().from(kpiEntries).where(and(
      eq(kpiEntries.userId, userId), inArray(kpiEntries.metricId, metrics.map((m) => m.id)),
      gte(kpiEntries.date, previous.start), lte(kpiEntries.date, date),
    )),
    getTargetMap(period, [userId]),
  ]);
  return buildSeoDailyTargets({ date, metrics, entries, targets: targets.get(userId) ?? new Map() });
}
