import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gte, lte } from "drizzle-orm";
import { CalendarCheckIcon, GaugeIcon, UserIcon } from "lucide-react";
import { db } from "@/db";
import { dailyReports } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getEntries, getMembers, getMetrics, getScorecards } from "@/lib/data";
import {
  aggregate,
  comparableRange,
  dailySeries,
  datesBetween,
  pctDelta,
  periodAsOf,
  periodRange,
  STATUS_META,
  todayISO,
  workingDays,
} from "@/lib/kpi";
import { resolvePeriod } from "@/lib/period";
import { ROLE_LABEL } from "@/lib/roles";
import { cn, formatDelta, formatNumber, parseISODate } from "@/lib/utils";
import { KpiBreakdownTable } from "@/components/dashboard/kpi-breakdown";
import { KpiStatusLabel, TONE_BAR } from "@/components/dashboard/kpi-status";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/panel";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { UrlSelect } from "@/components/dashboard/url-select";
import { UserAvatar } from "@/components/user-avatar";

export const metadata: Metadata = { title: "KPI Scorecard" };

export default async function ScorecardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { period, options } = resolvePeriod(sp.period);
  const members = user.role === "supervisor" ? await getMembers() : [];
  const target =
    user.role === "supervisor"
      ? (members.find((m) => m.id === Number(sp.user)) ?? members[0])
      : { id: user.id, name: user.name, email: user.email, role: user.role, title: user.title };

  const memberPicker =
    user.role === "supervisor" && members.length > 0 ? (
      <UrlSelect
        param="user"
        label="Member"
        value={String(target?.id)}
        options={members.map((m) => ({ value: String(m.id), label: `${m.name} · ${ROLE_LABEL[m.role]}` }))}
        icon={<UserIcon className="size-4 text-foreground/70" />}
      />
    ) : null;

  if (!target) {
    return (
      <>
        <PageHeader title="KPI Scorecard" />
        <EmptyState icon={GaugeIcon} title="No team members yet" description="Add members from the Team page." />
      </>
    );
  }

  const asOf = periodAsOf(period);
  const { start, end } = periodRange(period);
  const prev = comparableRange(period, asOf);
  const dates = datesBetween(start, asOf);
  const peers = user.role === "supervisor" ? members.filter((m) => m.role === target.role) : (await getMembers()).filter((m) => m.role === target.role);
  const [metrics, peerCards, entries, prevEntries, reports] = await Promise.all([
    getMetrics(),
    getScorecards(period, peers.some((p) => p.id === target.id) ? peers : [...peers, target]),
    getEntries(start, asOf, [target.id]),
    getEntries(prev.start, prev.end, [target.id]),
    db
      .select({ id: dailyReports.id, date: dailyReports.date, status: dailyReports.status })
      .from(dailyReports)
      .where(and(eq(dailyReports.userId, target.id), gte(dailyReports.date, start), lte(dailyReports.date, end))),
  ]);
  const card = peerCards.find((c) => c.member.id === target.id)!;
  const ranked = [...peerCards].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const rank = ranked.findIndex((c) => c.member.id === target.id) + 1;
  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const roleMetrics = metrics.filter((m) => m.role === target.role);
  const expected = workingDays(start, asOf, target.role === "advertiser");
  const delta = pctDelta(card.score, card.prevScore);
  const tone = STATUS_META[card.status].tone;

  return (
    <>
      <PageHeader
        title="KPI Scorecard"
        description={user.role === "supervisor" ? "Drill into one member's KPI, reporting discipline and trend." : "Your KPI for the selected month."}
        actions={
          <>
            {memberPicker}
            <PeriodSelect value={period} options={options} />
          </>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Member" icon={UserIcon}>
          <div className="flex items-center gap-3 p-4">
            <UserAvatar name={target.name} className="size-12" />
            <div className="min-w-0">
              <p className="truncate text-lg font-medium">{target.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {target.title ?? ROLE_LABEL[target.role]} · {ROLE_LABEL[target.role]}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 border-t">
            <div className="border-r p-4">
              <p className="text-xs text-muted-foreground">Rank in role</p>
              <p className="mt-1 text-xl font-medium tabular-nums">
                #{rank} <span className="text-sm font-normal text-muted-foreground">of {peerCards.length}</span>
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs text-muted-foreground">Reports</p>
              <p className="mt-1 text-xl font-medium tabular-nums">
                {card.reportsCount} <span className="text-sm font-normal text-muted-foreground">/ {expected} days</span>
              </p>
            </div>
          </div>
        </Panel>

        <Panel title="KPI Score" icon={GaugeIcon}>
          <div className="p-4">
            <div className="flex items-baseline gap-3">
              <p className="text-4xl font-medium tracking-tight tabular-nums">{card.score === null ? "–" : formatNumber(card.score, 1)}</p>
              <p className="text-sm">
                <span className={cn(delta === null ? "text-muted-foreground" : delta >= 0 ? "text-success" : "text-destructive")}>{formatDelta(delta)}</span>
                <span className="ml-1.5 text-muted-foreground">vs last month</span>
              </p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", TONE_BAR[tone])} style={{ width: `${Math.min(100, card.score ?? 0)}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <KpiStatusLabel status={card.status} />
              <span className="text-muted-foreground">100 = on target</span>
            </div>
          </div>
        </Panel>

        <Panel title="Reporting Calendar" icon={CalendarCheckIcon} className="lg:col-span-2 2xl:col-span-1">
          <ReportCalendar start={start} end={end} reports={reports} />
        </Panel>
      </div>

      <div className="mt-3 grid gap-3">
        <TrendChart
          title="Daily Trend"
          defaultKey={roleMetrics.find((m) => m.weight > 0 && m.aggregation !== "ratio")?.key}
          series={roleMetrics.map((m) => {
            const total = aggregate(m, entries, byKey);
            return {
              key: m.key,
              label: m.name,
              unit: m.unit,
              higherIsBetter: m.higherIsBetter,
              total,
              delta: pctDelta(total, aggregate(m, prevEntries, byKey)),
              points: dailySeries(m, entries, metrics, dates),
            };
          })}
        />
        <Panel title="KPI Breakdown" icon={GaugeIcon} iconPosition="left" bodyClassName="p-1.5">
          <KpiBreakdownTable results={card.results} />
        </Panel>
      </div>
    </>
  );
}

const CAL_TONE = {
  approved: "bg-success/85 text-white",
  submitted: "bg-warning/80 text-white",
  revision: "bg-destructive/80 text-white",
};

function ReportCalendar({ start, end, reports }: { start: string; end: string; reports: { id: number; date: string; status: keyof typeof CAL_TONE }[] }) {
  const today = todayISO();
  const byDate = new Map(reports.map((r) => [r.date, r]));
  const lead = (parseISODate(start).getDay() + 6) % 7; // Monday-first grid
  const days = datesBetween(start, end);
  return (
    <div className="p-4">
      <div className="mx-auto grid max-w-md grid-cols-7 gap-1.5 text-center text-[11px] text-muted-foreground">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} />
        ))}
        {days.map((d) => {
          const r = byDate.get(d);
          const sunday = parseISODate(d).getDay() === 0;
          const future = d > today;
          const cls = r
            ? CAL_TONE[r.status]
            : future || sunday
              ? "text-muted-foreground/50"
              : "border border-dashed border-destructive/40 text-muted-foreground";
          const label = `${d}: ${r ? r.status : future ? "upcoming" : sunday ? "day off" : "missed"}`;
          const inner = <span className={cn("flex h-8 items-center justify-center rounded-md text-xs tabular-nums", cls)}>{Number(d.slice(8))}</span>;
          return r ? (
            <Link key={d} href={`/reports/${r.id}`} title={label} aria-label={label}>
              {inner}
            </Link>
          ) : (
            <span key={d} title={label} aria-label={label}>
              {inner}
            </span>
          );
        })}
      </div>
      <div className="mx-auto mt-3 flex max-w-md flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <Legend className="bg-success/85" label="Approved" />
        <Legend className="bg-warning/80" label="Pending" />
        <Legend className="bg-destructive/80" label="Revision" />
        <Legend className="border border-dashed border-destructive/40" label="Missed" />
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-sm", className)} />
      {label}
    </span>
  );
}
