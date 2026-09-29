import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  advertiserReportItemCampaigns,
  advertiserReportItems,
  dailyReports,
  kpiEntries,
  kpiMetrics,
  kpiTargets,
  tasks,
  users,
  type AdvertiserReportItemCampaign,
  type Role,
} from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import {
  comparableRange,
  type Entry,
  periodAsOf,
  periodRange,
  scoreMember,
  statusOf,
  type KpiStatus,
  type MetricResult,
  datesBetween,
} from "@/lib/kpi";

export const getMetrics = cache(async () =>
  db.select().from(kpiMetrics).orderBy(asc(kpiMetrics.role), asc(kpiMetrics.sortOrder)),
);

export const getMembers = cache(async (includeInactive = false) =>
  db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      title: users.title,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(includeInactive ? ne(users.role, "supervisor") : and(ne(users.role, "supervisor"), eq(users.isActive, true)))
    .orderBy(asc(users.name)),
);

export type Member = Awaited<ReturnType<typeof getMembers>>[number];

export async function getAllUsers() {
  return db
    .select({ id: users.id, name: users.name, role: users.role, isActive: users.isActive })
    .from(users)
    .orderBy(asc(users.name));
}

export async function getEntries(start: string, end: string, userIds?: number[]): Promise<Entry[]> {
  if (userIds && userIds.length === 0) return [];
  const rows = await db
    .select({ userId: kpiEntries.userId, metricId: kpiEntries.metricId, date: kpiEntries.date, value: kpiEntries.value })
    .from(kpiEntries)
    .where(
      and(
        gte(kpiEntries.date, start),
        lte(kpiEntries.date, end),
        userIds ? inArray(kpiEntries.userId, userIds) : undefined,
      ),
    );
  return rows;
}

export async function getTargetMap(period: string, userIds?: number[]) {
  const rows = await db
    .select()
    .from(kpiTargets)
    .where(and(eq(kpiTargets.period, period), userIds?.length ? inArray(kpiTargets.userId, userIds) : undefined));
  const map = new Map<number, Map<number, number>>();
  for (const r of rows) {
    if (!map.has(r.userId)) map.set(r.userId, new Map());
    map.get(r.userId)!.set(r.metricId, r.target);
  }
  return map;
}

export type Scorecard = {
  member: Pick<Member, "id" | "name" | "email" | "role" | "title">;
  score: number | null;
  prevScore: number | null;
  status: KpiStatus;
  results: MetricResult[];
  reportsCount: number;
  lastReportDate: string | null;
};

/** Scores every given member for the period, plus the comparable slice of last month. */
export async function getScorecards(period: string, members: Scorecard["member"][]): Promise<Scorecard[]> {
  const ids = members.map((m) => m.id);
  const asOf = periodAsOf(period);
  const { start } = periodRange(period);
  const prev = comparableRange(period, asOf);
  const [metrics, entries, prevEntries, targets, prevTargets, reportStats] = await Promise.all([
    getMetrics(),
    getEntries(start, asOf, ids),
    getEntries(prev.start, prev.end, ids),
    getTargetMap(period, ids),
    getTargetMap(prev.period, ids),
    ids.length
      ? db
          .select({
            userId: dailyReports.userId,
            count: sql<number>`count(*) filter (where ${dailyReports.date} between ${start} and ${asOf})`.mapWith(Number),
            last: sql<string | null>`max(${dailyReports.date})`,
          })
          .from(dailyReports)
          .where(inArray(dailyReports.userId, ids))
          .groupBy(dailyReports.userId)
      : Promise.resolve([]),
  ]);
  const stats = new Map(reportStats.map((r) => [r.userId, r]));

  return members.map((member) => {
    const roleMetrics = metrics.filter((m) => m.role === member.role);
    const cur = scoreMember({
      metrics: roleMetrics,
      allMetrics: metrics,
      entries: entries.filter((e) => e.userId === member.id),
      targets: targets.get(member.id) ?? new Map(),
      period,
      asOf,
    });
    const before = scoreMember({
      metrics: roleMetrics,
      allMetrics: metrics,
      entries: prevEntries.filter((e) => e.userId === member.id),
      targets: prevTargets.get(member.id) ?? new Map(),
      period: prev.period,
      asOf: prev.end,
    });
    const s = stats.get(member.id);
    return {
      member,
      score: cur.score,
      prevScore: before.score,
      status: statusOf(cur.score),
      results: cur.results,
      reportsCount: s?.count ?? 0,
      lastReportDate: s?.last ?? null,
    };
  });
}

/** Team score for each day of the period, computed as-of that day (for sparklines). */
export async function getTeamScoreSeries(period: string, members: Scorecard["member"][]) {
  const ids = members.map((m) => m.id);
  const asOf = periodAsOf(period);
  const { start } = periodRange(period);
  const [metrics, entries, targets] = await Promise.all([getMetrics(), getEntries(start, asOf, ids), getTargetMap(period, ids)]);
  return datesBetween(start, asOf).map((date) => {
    const scores = members
      .map(
        (member) =>
          scoreMember({
            metrics: metrics.filter((m) => m.role === member.role),
            allMetrics: metrics,
            entries: entries.filter((e) => e.userId === member.id && e.date <= date),
            targets: targets.get(member.id) ?? new Map(),
            period,
            asOf: date,
          }).score,
      )
      .filter((s): s is number => s !== null);
    return { date, value: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0 };
  });
}

export async function getActivities(user: Pick<SessionUser, "id" | "role">, limit = 60) {
  const since = new Date(Date.now() - 8 * 86_400_000);
  const scope =
    user.role === "supervisor"
      ? gte(activities.createdAt, since)
      : and(gte(activities.createdAt, since), or(eq(activities.subjectUserId, user.id), eq(activities.actorId, user.id)));
  return db
    .select({
      id: activities.id,
      type: activities.type,
      title: activities.title,
      description: activities.description,
      href: activities.href,
      createdAt: activities.createdAt,
      actorName: users.name,
    })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.actorId))
    .where(scope)
    .orderBy(desc(activities.createdAt))
    .limit(limit);
}

export type ActivityItem = Awaited<ReturnType<typeof getActivities>>[number];

export async function logActivity(a: {
  actorId: number;
  subjectUserId?: number | null;
  type: string;
  title: string;
  description?: string;
  href?: string;
}) {
  await db.insert(activities).values(a);
}

export async function getNotifications(user: SessionUser) {
  if (user.role === "supervisor") {
    const [row] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(dailyReports)
      .innerJoin(users, eq(users.id, dailyReports.userId))
      .where(and(eq(dailyReports.status, "submitted"), ne(users.role, "advertiser")));
    return { pendingReviews: row?.n ?? 0, openTasks: 0, revisions: 0 };
  }
  const [t] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(tasks)
    .where(and(eq(tasks.assigneeId, user.id), ne(tasks.status, "done")));
  const [r] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(dailyReports)
    .where(and(eq(dailyReports.userId, user.id), eq(dailyReports.status, "revision")));
  // Advertiser reports are recorded without review, so there is nothing to revise.
  return { pendingReviews: 0, openTasks: t?.n ?? 0, revisions: user.role === "advertiser" ? 0 : (r?.n ?? 0) };
}

export function roleMetrics<T extends { role: Role }>(metrics: T[], role: Role) {
  return metrics.filter((m) => m.role === role);
}

/** Platform campaigns behind generated advertiser report items, grouped by item id (largest spend first). */
export async function getItemCampaigns(itemIds: number[]) {
  const byItem = new Map<number, AdvertiserReportItemCampaign[]>();
  if (!itemIds.length) return byItem;
  const rows = await db
    .select()
    .from(advertiserReportItemCampaigns)
    .where(inArray(advertiserReportItemCampaigns.itemId, itemIds))
    .orderBy(desc(advertiserReportItemCampaigns.spent));
  for (const row of rows) byItem.set(row.itemId, [...(byItem.get(row.itemId) ?? []), row]);
  return byItem;
}

/** Full-day numbers of an advertiser report; impressions/clicks are null for reports saved before product rows existed. */
export type ReportDayMetrics = { spent: number; impressions: number | null; clicks: number | null; leads: number };

/**
 * Full-day ("previous_day" periods, i.e. Friday–Sunday on a Monday) totals per advertiser report.
 * Falls back to the report's Ad Spend / Leads KPI entries when it has no product rows.
 */
export async function getReportDayMetrics(reportIds: number[]) {
  const byReport = new Map<number, ReportDayMetrics>();
  if (!reportIds.length) return byReport;
  const [items, entries] = await Promise.all([
    db
      .select({
        reportId: advertiserReportItems.reportId,
        spent: sql<number>`sum(${advertiserReportItems.spent})`.mapWith(Number),
        impressions: sql<number>`sum(${advertiserReportItems.impressions})`.mapWith(Number),
        clicks: sql<number>`sum(${advertiserReportItems.clicks})`.mapWith(Number),
        leads: sql<number>`sum(${advertiserReportItems.leads})`.mapWith(Number),
      })
      .from(advertiserReportItems)
      .where(and(inArray(advertiserReportItems.reportId, reportIds), eq(advertiserReportItems.window, "previous_day")))
      .groupBy(advertiserReportItems.reportId),
    db
      .select({ reportId: kpiEntries.reportId, key: kpiMetrics.key, value: kpiEntries.value })
      .from(kpiEntries)
      .innerJoin(kpiMetrics, eq(kpiMetrics.id, kpiEntries.metricId))
      .where(and(inArray(kpiEntries.reportId, reportIds), inArray(kpiMetrics.key, ["ad_spend", "leads"]))),
  ]);
  for (const row of items) byReport.set(row.reportId, row);
  for (const id of reportIds) {
    if (byReport.has(id)) continue;
    const kpi = (key: string) => entries.find((e) => e.reportId === id && e.key === key)?.value ?? null;
    if (kpi("ad_spend") !== null || kpi("leads") !== null) {
      byReport.set(id, { spent: kpi("ad_spend") ?? 0, impressions: null, clicks: null, leads: kpi("leads") ?? 0 });
    }
  }
  return byReport;
}
