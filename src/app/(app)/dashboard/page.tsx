import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";
import {
  ClipboardPenIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  GaugeIcon,
  ListTodoIcon,
  TrophyIcon,
  type LucideIcon,
  BadgeDollarSignIcon,
  MousePointerClickIcon,
  FileTextIcon,
  RocketIcon,
  ZapIcon,
  KeyRoundIcon,
} from "lucide-react";
import { db } from "@/db";
import { dailyReports, tasks, type KpiMetric, type Role } from "@/db/schema";
import { requireUser, type SessionUser } from "@/lib/auth";
import { getActivities, getEntries, getMembers, getMetrics, getScorecards, getTeamScoreSeries } from "@/lib/data";
import { toFeed } from "@/lib/feed";
import {
  aggregate,
  comparableRange,
  dailySeries,
  datesBetween,
  pctDelta,
  periodAsOf,
  periodRange,
  todayISO,
  workingDays,
  type Entry,
} from "@/lib/kpi";
import { resolvePeriod } from "@/lib/period";
import { formatDate, formatNumber, formatValue } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { KpiBreakdownTable } from "@/components/dashboard/kpi-breakdown";
import { Panel, PageHeader } from "@/components/dashboard/panel";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { StatCard } from "@/components/dashboard/stat-card";
import { TeamTable, type TeamRow } from "@/components/dashboard/team-table";
import { TrendChart, type TrendSeries } from "@/components/dashboard/trend-chart";

export const metadata: Metadata = { title: "Dashboard" };

const HEADLINE: Record<Exclude<Role, "supervisor">, { key: string; icon: LucideIcon }[]> = {
  advertiser: [
    { key: "leads", icon: MousePointerClickIcon },
    { key: "roas", icon: BadgeDollarSignIcon },
  ],
  webmaster: [
    { key: "landing_pages", icon: RocketIcon },
    { key: "page_speed", icon: ZapIcon },
  ],
  seo: [
    { key: "articles", icon: FileTextIcon },
    { key: "top10_keywords", icon: KeyRoundIcon },
  ],
};

const TEAM_TREND_KEYS = ["leads", "closing", "revenue", "ad_spend", "landing_pages", "issues_resolved", "articles", "organic_sessions"];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { period, options } = resolvePeriod((await searchParams).period);
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={<>Hello, {firstName} 👋</>}
        description={
          user.role === "supervisor"
            ? "Here are the latest insights from your advertising team."
            : "Here's how your KPI is tracking this period."
        }
        actions={
          <>
            <PeriodSelect value={period} options={options} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-8" aria-label="More actions">
                  <EllipsisVerticalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={`/api/export?period=${period}`}>
                    <DownloadIcon /> Export scorecard (CSV)
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/leaderboard?period=${period}`}>
                    <TrophyIcon /> Leaderboard
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      {user.role === "supervisor" ? <SupervisorDashboard user={user} period={period} /> : <MemberDashboard user={user} period={period} />}
    </>
  );
}

function metricTrend(metric: KpiMetric, metrics: KpiMetric[], entries: Entry[], prevEntries: Entry[], dates: string[]): TrendSeries {
  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const total = aggregate(metric, entries, byKey);
  return {
    key: metric.key,
    label: metric.name,
    unit: metric.unit,
    higherIsBetter: metric.higherIsBetter,
    total,
    delta: pctDelta(total, aggregate(metric, prevEntries, byKey)),
    points: dailySeries(metric, entries, metrics, dates),
  };
}

async function SupervisorDashboard({ user, period }: { user: SessionUser; period: string }) {
  const asOf = periodAsOf(period);
  const { start } = periodRange(period);
  const prev = comparableRange(period, asOf);
  const dates = datesBetween(start, asOf);
  const members = await getMembers();
  const [metrics, scorecards, entries, prevEntries, teamSeries, feed, todayReports] = await Promise.all([
    getMetrics(),
    getScorecards(period, members),
    getEntries(start, asOf),
    getEntries(prev.start, prev.end),
    getTeamScoreSeries(period, members),
    getActivities(user),
    db.select({ userId: dailyReports.userId }).from(dailyReports).where(eq(dailyReports.date, todayISO())),
  ]);
  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const scored = scorecards.filter((s) => s.score !== null);
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const teamScore = avg(scored.map((s) => s.score));
  const prevTeamScore = avg(scorecards.map((s) => s.prevScore));
  const leads = metricTrend(byKey.get("leads")!, metrics, entries, prevEntries, dates);
  const roas = metricTrend(byKey.get("roas")!, metrics, entries, prevEntries, dates);
  const reportedToday = new Set(todayReports.map((r) => r.userId));
  const expected = workingDays(start, asOf);

  const rows: TeamRow[] = scorecards.map((s) => ({
    id: s.member.id,
    name: s.member.name,
    email: s.member.email,
    role: s.member.role,
    title: s.member.title,
    score: s.score,
    delta: pctDelta(s.score, s.prevScore),
    status: s.status,
    reportsCount: s.reportsCount,
    expectedReports: expected,
    lastReportDate: s.lastReportDate,
    reportedToday: reportedToday.has(s.member.id),
  }));

  const trend = TEAM_TREND_KEYS.map((k) => byKey.get(k))
    .filter((m): m is KpiMetric => !!m)
    .map((m) => ({ ...metricTrend(m, metrics, entries, prevEntries, dates), label: `${m.name}` }));

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
      <div className="grid min-w-0 gap-3">
        <div className="grid gap-3 md:grid-cols-3">
          <StatCard
            title="Team KPI Score"
            icon={GaugeIcon}
            value={teamScore === null ? "–" : `${formatNumber(teamScore, 1)}`}
            delta={pctDelta(teamScore, prevTeamScore)}
            series={teamSeries.map((p) => p.value)}
          />
          <StatCard
            title="Total Leads"
            icon={MousePointerClickIcon}
            value={leads.total === null ? "–" : formatNumber(leads.total)}
            delta={leads.delta}
            series={leads.points.map((p) => p.value)}
          />
          <StatCard
            title="Team ROAS"
            icon={BadgeDollarSignIcon}
            value={roas.total === null ? "–" : formatValue(roas.total, "ratio")}
            delta={roas.delta}
            series={roas.points.map((p) => p.value)}
          />
        </div>
        <TrendChart title="Performance Trend" series={trend} />
      </div>
      <ActivityFeed items={toFeed(feed)} className="xl:h-0 xl:min-h-full" />
      <div className="min-w-0 xl:col-span-2">
        <TeamTable rows={rows} period={period} />
      </div>
    </div>
  );
}

async function MemberDashboard({ user, period }: { user: SessionUser; period: string }) {
  const role = user.role as Exclude<Role, "supervisor">;
  const asOf = periodAsOf(period);
  const { start } = periodRange(period);
  const prev = comparableRange(period, asOf);
  const dates = datesBetween(start, asOf);
  const me = { id: user.id, name: user.name, email: user.email, role: user.role, title: user.title };
  const [metrics, [card], entries, prevEntries, scoreSeries, feed, [todayReport], myTasks] = await Promise.all([
    getMetrics(),
    getScorecards(period, [me]),
    getEntries(start, asOf, [user.id]),
    getEntries(prev.start, prev.end, [user.id]),
    getTeamScoreSeries(period, [me]),
    getActivities(user),
    db
      .select({ id: dailyReports.id, status: dailyReports.status })
      .from(dailyReports)
      .where(and(eq(dailyReports.userId, user.id), eq(dailyReports.date, todayISO())))
      .limit(1),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.assigneeId, user.id), ne(tasks.status, "done")))
      .orderBy(asc(tasks.dueDate))
      .limit(5),
  ]);
  const roleMetrics = metrics.filter((m) => m.role === role);
  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const headline = HEADLINE[role].map(({ key, icon }) => ({
    icon,
    metric: byKey.get(key)!,
    trend: metricTrend(byKey.get(key)!, metrics, entries, prevEntries, dates),
  }));
  const isCurrent = period === todayISO().slice(0, 7);

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
      <div className="grid min-w-0 gap-3">
        {isCurrent && !todayReport && (
          <div className="flex flex-col gap-3 rounded-xl border border-dashed bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">You haven&apos;t submitted today&apos;s report</p>
              <p className="text-sm text-muted-foreground">Submit your daily numbers so your KPI score stays up to date.</p>
            </div>
            <Button asChild>
              <Link href="/reports/new">
                <ClipboardPenIcon /> Submit report
              </Link>
            </Button>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <StatCard
            title="My KPI Score"
            icon={GaugeIcon}
            value={card?.score == null ? "–" : formatNumber(card.score, 1)}
            delta={pctDelta(card?.score ?? null, card?.prevScore ?? null)}
            series={scoreSeries.map((p) => p.value)}
          />
          {headline.map(({ icon, metric, trend }) => (
            <StatCard
              key={metric.key}
              title={metric.name}
              icon={icon}
              value={trend.total === null ? "–" : formatValue(trend.total, metric.unit, metric.unit === "currency")}
              delta={trend.delta}
              higherIsBetter={metric.higherIsBetter}
              series={trend.points.map((p) => p.value)}
            />
          ))}
        </div>
        <TrendChart
          title="My Daily Performance"
          series={roleMetrics.map((m) => metricTrend(m, metrics, entries, prevEntries, dates))}
          defaultKey={HEADLINE[role][0]!.key}
        />
      </div>
      <ActivityFeed items={toFeed(feed)} className="xl:h-0 xl:min-h-full" />
      <div className="grid min-w-0 gap-3 xl:col-span-2 2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="KPI Breakdown" icon={GaugeIcon} iconPosition="left" bodyClassName="p-1.5">
          <KpiBreakdownTable results={card?.results ?? []} />
        </Panel>
        <Panel
          title="My Open Tasks"
          icon={ListTodoIcon}
          iconPosition="left"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/tasks">View all</Link>
            </Button>
          }
        >
          {myTasks.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No open tasks. Nice work!</p>
          ) : (
            <ul className="divide-y">
              {myTasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{t.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.dueDate ? `Due ${formatDate(t.dueDate, { day: "2-digit", month: "short" })}` : "No due date"}
                    </span>
                  </span>
                  <Badge variant={t.priority === "urgent" ? "destructive" : t.priority === "high" ? "warning" : "secondary"} className="capitalize">
                    {t.priority}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
