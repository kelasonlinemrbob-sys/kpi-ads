import "server-only";
import { getFormLeadCounts } from "./form-lead-metrics";
import { cache } from "react";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
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
  type KpiMetric,
  type Role,
} from "@/db/schema";
import { combineScores, needsReview, roleSlots, type RoleHolder, type RoleSlot } from "@/lib/member-roles";
import type { SessionUser } from "@/lib/auth";
import { taskCompletionAt } from "@/lib/task-kpi";
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
  shiftPeriod,
} from "@/lib/kpi";

/**
 * Members whose reports go through supervisor review: anyone who isn't purely an advertiser
 * (an advertiser with a second role, e.g. SEO, gets that part reviewed). SQL twin of needsReview().
 */
export const reviewedMemberSql = and(
  ne(users.role, "supervisor"),
  or(
    ne(users.role, "advertiser"),
    and(isNotNull(users.secondaryRole), notInArray(users.secondaryRole, ["advertiser", "supervisor"])),
  ),
)!;

export const getMetrics = cache(async () =>
  db.select().from(kpiMetrics).orderBy(asc(kpiMetrics.role), asc(kpiMetrics.sortOrder)),
);

export const getMembers = cache(async (includeInactive = false, includeSupervisors = false) =>
  db
    .select({
      id: users.id,
      name: users.name, avatarId: users.avatarId,
      email: users.email,
      role: users.role,
      advertiserLevel: users.advertiserLevel,
      secondaryRole: users.secondaryRole,
      secondaryShare: users.secondaryShare,
      title: users.title,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(ne(users.role, "cso"), includeSupervisors ? undefined : ne(users.role, "supervisor"), includeInactive ? undefined : eq(users.isActive, true)))
    .orderBy(asc(users.name)),
);

export type Member = Awaited<ReturnType<typeof getMembers>>[number];

export async function getAllUsers() {
  return db
    .select({ id: users.id, name: users.name, avatarId: users.avatarId, role: users.role, isActive: users.isActive })
    .from(users)
    .orderBy(asc(users.name));
}

export async function getEntries(start: string, end: string, userIds?: number[]): Promise<Entry[]> {
  if (userIds && userIds.length === 0) return [];
  const rows = await db
    .select({ userId: kpiEntries.userId, metricId: kpiEntries.metricId, date: kpiEntries.date, value: kpiEntries.value, reportId: kpiEntries.reportId })
    .from(kpiEntries)
    .where(
      and(
        gte(kpiEntries.date, start),
        lte(kpiEntries.date, end),
        userIds ? inArray(kpiEntries.userId, userIds) : undefined,
      ),
    );
  const metrics = await getMetrics();
  // Ads belong to their performance date, including the weekend reported on Monday.
  // Replace legacy report-date totals whenever source product rows are available.
  const ads = await db.select({
    reportId: dailyReports.id, userId: dailyReports.userId, date: advertiserReportItems.performanceDate, campaignId: advertiserReportItems.campaignId,
    spent: advertiserReportItems.spent, leads: advertiserReportItems.leads, lpv: advertiserReportItems.landingPageViews,
  }).from(advertiserReportItems).innerJoin(dailyReports, eq(dailyReports.id, advertiserReportItems.reportId)).where(and(
    eq(advertiserReportItems.window, "previous_day"),
    userIds ? inArray(dailyReports.userId, userIds) : undefined,
    or(and(gte(advertiserReportItems.performanceDate, start), lte(advertiserReportItems.performanceDate, end)),
      and(gte(dailyReports.date, start), lte(dailyReports.date, end))),
  ));
  const sourceReports = new Set(ads.map((row) => row.reportId));
  const adsMetrics = metrics.filter((m) => ["ad_spend", "leads", "landing_page_views"].includes(m.key));
  const adsMetricIds = new Set(adsMetrics.map((m) => m.id));
  const result: Entry[] = rows.filter((row) => !(sourceReports.has(row.reportId) && adsMetricIds.has(row.metricId)));
  const grouped = new Map<string, typeof ads>();
  for (const row of ads) {
    if (row.date < start || row.date > end) continue;
    const key = `${row.userId}:${row.date}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  for (const group of grouped.values()) {
    const first = group[0]!;
    for (const metric of adsMetrics) {
      if (metric.key === "landing_page_views" && group.some((r) => r.lpv === null)) continue;
      const value = group.reduce((sum, r) => sum + (metric.key === "ad_spend" ? r.spent : metric.key === "leads" ? r.leads : r.lpv ?? 0), 0);
      result.push({ userId: first.userId, metricId: metric.id, date: first.date, value });
    }
  }
  // Form leads also count before the advertiser has submitted an Ads report.
  // Already represented product/day rows are excluded to prevent double counting.
  const formCounts = await getFormLeadCounts(start,end,userIds);
  const represented = new Set(ads.map(row => `${row.userId}:${row.campaignId}:${row.date}`));
  const leadMetric = metrics.find(m => m.role === "advertiser" && m.key === "leads");
  if (leadMetric) for (const row of formCounts) if (!represented.has(`${row.userId}:${row.campaignId}:${row.date}`)) {
    result.push({userId:row.userId,metricId:leadMetric.id,date:row.date,value:row.leads});
  }
  const taskMetric = metrics.find((m) => m.key === "task_completion");
  if (taskMetric) {
    const assigned = await db.select().from(tasks).where(userIds ? inArray(tasks.assigneeId, userIds) : undefined);
    const ids = [...new Set(assigned.map((t) => t.assigneeId))];
    for (const date of datesBetween(start, end)) {
      const range = periodRange(date.slice(0, 7));
      for (const userId of ids) {
        const value = taskCompletionAt(assigned.filter((t) => t.assigneeId === userId), range.start, range.end, date);
        if (value !== null) result.push({ userId, metricId: taskMetric.id, date, value });
      }
    }
  }
  return result;
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

export type RoleScore = RoleSlot & { score: number | null; prevScore: number | null; results: MetricResult[] };

export type Scorecard = {
  member: Pick<Member, "id" | "name" | "email" | "role" | "title"> & Partial<Pick<Member, "secondaryRole" | "secondaryShare" | "advertiserLevel" | "avatarId">>;
  /** Combined score: each role's score weighted by its share (just the role's score for one role). */
  score: number | null;
  prevScore: number | null;
  status: KpiStatus;
  /** Results of every role, main role first. */
  results: MetricResult[];
  /** One entry per role the member holds. */
  roleScores: RoleScore[];
  reportsCount: number;
  lastReportDate: string | null;
};

/** Score of one role for a member (their combined score when they only hold that role). */
export function scoreForRole(card: Scorecard, role: Role) {
  return card.roleScores.find((r) => r.role === role)?.score ?? null;
}

/** Scores a member in each of their roles; default targets are scaled by the role's share. */
function scoreRoles(opts: {
  member: RoleHolder;
  metrics: KpiMetric[];
  entries: Entry[];
  previousEntries?: Entry[];
  targets: Map<number, number>;
  period: string;
  asOf: string;
}) {
  return roleSlots(opts.member).map((slot) => ({
    ...slot,
    ...scoreMember({
      metrics: opts.metrics.filter((m) => m.role === slot.role),
      allMetrics: opts.metrics,
      entries: opts.entries,
      previousEntries: opts.previousEntries,
      targets: opts.targets,
      period: opts.period,
      asOf: opts.asOf,
      targetScale: slot.share / 100,
    }),
  }));
}

/** Scores every given member for the period, plus the comparable slice of last month. */
export async function getScorecards(period: string, members: Scorecard["member"][]): Promise<Scorecard[]> {
  const ids = members.map((m) => m.id);
  const asOf = periodAsOf(period);
  const { start } = periodRange(period);
  const prev = comparableRange(period, asOf);
  const baselineRange = periodRange(prev.period);
  const olderRange = periodRange(shiftPeriod(period, -2));
  const [baseline, olderBaseline] = await Promise.all([
    getEntries(baselineRange.start, baselineRange.end, ids),
    getEntries(olderRange.start, olderRange.end, ids),
  ]);
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
    const cur = scoreRoles({
      member,
      metrics,
      entries: entries.filter((e) => e.userId === member.id),
      previousEntries: baseline.filter((e) => e.userId === member.id),
      targets: targets.get(member.id) ?? new Map(),
      period,
      asOf,
    });
    const before = scoreRoles({
      member,
      metrics,
      entries: prevEntries.filter((e) => e.userId === member.id),
      previousEntries: olderBaseline.filter((e) => e.userId === member.id),
      targets: prevTargets.get(member.id) ?? new Map(),
      period: prev.period,
      asOf: prev.end,
    });
    const score = combineScores(cur);
    const s = stats.get(member.id);
    return {
      member,
      score,
      prevScore: combineScores(before),
      status: statusOf(score),
      results: cur.flatMap((r) => r.results),
      roleScores: cur.map((r, i) => ({ role: r.role, share: r.share, score: r.score, prevScore: before[i]?.score ?? null, results: r.results })),
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
  const prev = periodRange(shiftPeriod(period, -1));
  const previousEntries = await getEntries(prev.start, prev.end, ids);
  const [metrics, entries, targets] = await Promise.all([getMetrics(), getEntries(start, asOf, ids), getTargetMap(period, ids)]);
  return datesBetween(start, asOf).map((date) => {
    const scores = members
      .map((member) =>
        combineScores(
          scoreRoles({
            member,
            metrics,
            entries: entries.filter((e) => e.userId === member.id && e.date <= date),
            previousEntries: previousEntries.filter((e) => e.userId === member.id),
            targets: targets.get(member.id) ?? new Map(),
            period,
            asOf: date,
          }),
        ),
      )
      .filter((s): s is number => s !== null);
    return { date, value: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0 };
  });
}

export async function getActivities(user: Pick<SessionUser, "id" | "role">, limit = 60, personal = false) {
  const since = new Date(Date.now() - 8 * 86_400_000);
  const scope =
    user.role === "supervisor" && !personal
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
      .where(and(eq(dailyReports.status, "submitted"), reviewedMemberSql));
    // Tasks waiting in Review; a supervisor can approve any of them.
    const [review] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(tasks)
      .where(eq(tasks.status, "review"));
    return { pendingReviews: row?.n ?? 0, openTasks: review?.n ?? 0, revisions: 0 };
  }
  // Open tasks to do (not the ones already handed in for review) + others' work waiting for my approval.
  const [t] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(tasks)
    .where(
      or(
        and(eq(tasks.assigneeId, user.id), notInArray(tasks.status, ["done", "review"])),
        and(eq(tasks.createdById, user.id), ne(tasks.assigneeId, user.id), eq(tasks.status, "review")),
      ),
    );
  const [r] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(dailyReports)
    .where(and(eq(dailyReports.userId, user.id), eq(dailyReports.status, "revision")));
  // Advertiser reports are recorded without review, so there is nothing to revise.
  return { pendingReviews: 0, openTasks: t?.n ?? 0, revisions: needsReview(user) ? (r?.n ?? 0) : 0 };
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
