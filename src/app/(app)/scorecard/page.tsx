import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gte, lte } from "drizzle-orm";
import { CalendarCheckIcon, GaugeIcon, UserIcon } from "lucide-react";
import type { Role } from "@/db/schema";
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
  shiftPeriod,
  todayISO,
  workingDays,
} from "@/lib/kpi";
import { resolvePeriod } from "@/lib/period";
import { ROLE_LABEL } from "@/lib/roles";
import { cn, formatNumber, parseISODate } from "@/lib/utils";
import { KpiBreakdownTable } from "@/components/dashboard/kpi-breakdown";
import { KpiStatusLabel } from "@/components/dashboard/kpi-status";
import { MonoDelta, MonoMeter } from "@/components/dashboard/mono";
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
  // Score of the five months before, for the 6-month trend (months without reports stay empty).
  const history = [
    ...(await Promise.all(
      [5, 4, 3, 2, 1].map(async (back) => {
        const month = shiftPeriod(period, -back);
        const [c] = await getScorecards(month, [card.member]);
        return { period: month, score: c && c.reportsCount > 0 ? c.score : null };
      }),
    )),
    { period, score: card.score },
  ];
  const ranked = [...peerCards].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const rank = ranked.findIndex((c) => c.member.id === target.id) + 1;
  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const roleMetrics = metrics.filter((m) => m.role === target.role);
  const expected = workingDays(start, asOf, target.role === "advertiser");
  const delta = pctDelta(card.score, card.prevScore);
  const days = periodRange(period).days;
  const weighted = card.results
    .filter((r) => r.metric.weight > 0 && r.achievement !== null)
    .sort((a, b) => a.achievement! - b.achievement!);
  const weakest = weighted[0];
  const strongest = weighted.length > 1 ? weighted[weighted.length - 1] : undefined;
  const resultByKey = new Map(card.results.map((r) => [r.metric.key, r]));

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
                {target.title && target.title !== ROLE_LABEL[target.role] ? `${target.title} · ${ROLE_LABEL[target.role]}` : ROLE_LABEL[target.role]}
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
          {ranked.length > 1 && (
            <div className="border-t px-4 py-3">
              <p className="mb-2 text-[11px] text-muted-foreground">Peringkat {ROLE_LABEL[target.role]}</p>
              <ol className="grid gap-2">
                {ranked.slice(0, 5).map((c, i) => {
                  const me = c.member.id === target.id;
                  return (
                    <li key={c.member.id} className={cn("grid grid-cols-[1.25rem_minmax(0,7rem)_1fr_2.5rem] items-center gap-2 text-sm", !me && "text-muted-foreground")}>
                      <span className="tabular-nums">{i + 1}</span>
                      <span className={cn("truncate", me && "font-medium text-foreground")}>{c.member.name}</span>
                      <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${Math.min(100, ((c.score ?? 0) / 120) * 100)}%`, backgroundColor: me ? "var(--foreground)" : "var(--bar-hit)" }}
                        />
                      </span>
                      <span className={cn("text-right tabular-nums", me && "font-medium text-foreground")}>{c.score === null ? "–" : formatNumber(c.score, 0)}</span>
                    </li>
                  );
                })}
              </ol>
              {rank > 5 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  … {target.name} di posisi #{rank} ({card.score === null ? "–" : formatNumber(card.score, 0)})
                </p>
              )}
            </div>
          )}
        </Panel>

        <Panel title="KPI Score" icon={GaugeIcon}>
          <div className="grid gap-4 p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-5xl leading-none font-semibold tracking-tight">{card.score === null ? "–" : formatNumber(card.score, 1)}</p>
              <MonoDelta delta={delta} />
            </div>
            <div className="grid gap-1.5">
              <MonoMeter value={card.score} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <KpiStatusLabel status={card.status} mono className="text-foreground" />
                <span>garis = 100 (tepat target)</span>
              </div>
            </div>
            {(weakest || strongest) && (
              <dl className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
                {strongest && (
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Terkuat</dt>
                    <dd className="truncate font-medium">
                      {strongest.metric.name} <span className="font-normal text-muted-foreground tabular-nums">{formatNumber(strongest.achievement! * 100, 0)}%</span>
                    </dd>
                  </div>
                )}
                {weakest && (
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">{weakest.achievement! < 1 ? "Perlu perhatian" : "Terendah"}</dt>
                    <dd className="truncate font-medium">
                      {weakest.metric.name} <span className="font-normal text-muted-foreground tabular-nums">{formatNumber(weakest.achievement! * 100, 0)}%</span>
                    </dd>
                  </div>
                )}
              </dl>
            )}
            <ScoreHistory history={history} />
          </div>
        </Panel>

        <Panel title="Reporting Calendar" icon={CalendarCheckIcon} className="lg:col-span-2 2xl:col-span-1">
          <ReportCalendar start={start} end={end} reports={reports} role={target.role} />
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
              summable: m.aggregation === "sum",
              target: dailyTarget(resultByKey.get(m.key)?.target ?? null, m.aggregation, days),
            };
          })}
        />
        <Panel title="KPI Breakdown" icon={GaugeIcon} iconPosition="left" bodyClassName="p-1.5">
          <KpiBreakdownTable results={card.results} mono />
        </Panel>
      </div>
    </>
  );
}

/** Target per day: monthly totals are spread over the month (as the score pro-rates them); averages and ratios keep theirs. */
function dailyTarget(target: number | null, aggregation: string, days: number) {
  if (target === null || target <= 0) return null;
  return aggregation === "sum" ? target / days : target;
}

const MONTH_SHORT = (p: string) => parseISODate(`${p}-01`).toLocaleDateString("en-US", { month: "short" });

/** Six months of KPI score as thin columns; the current month in ink, the hairline at 100 = on target. */
function ScoreHistory({ history }: { history: { period: string; score: number | null }[] }) {
  const top = Math.max(120, ...history.map((h) => h.score ?? 0));
  return (
    <div className="border-t pt-3">
      <p className="mb-2 text-[11px] text-muted-foreground">6 bulan terakhir</p>
      <div className="relative flex h-20 items-end gap-2">
        <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/40" style={{ bottom: `${(100 / top) * 100}%` }} />
        {history.map((h, i) => {
          const current = i === history.length - 1;
          const label = `${MONTH_SHORT(h.period)}: ${h.score === null ? "tidak ada data" : formatNumber(h.score, 1)}`;
          return (
            <div key={h.period} className="flex h-full flex-1 flex-col items-center justify-end" title={label} aria-label={label}>
              {h.score !== null && current && <span className="mb-0.5 text-[11px] font-medium tabular-nums">{formatNumber(h.score, 0)}</span>}
              <span
                className="block w-full max-w-6 rounded-t-[4px]"
                style={{
                  height: h.score === null ? 1 : `${Math.max(2, (h.score / top) * 100)}%`,
                  backgroundColor: current ? "var(--foreground)" : "var(--bar-hit)",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2">
        {history.map((h, i) => (
          <span key={h.period} className={cn("flex-1 text-center text-[11px] text-muted-foreground", i === history.length - 1 && "font-medium text-foreground")}>
            {MONTH_SHORT(h.period)}
          </span>
        ))}
      </div>
    </div>
  );
}

type CalStatus = "approved" | "submitted" | "revision";

/**
 * Black & white encodings, so status never depends on colour: solid ink = done, outline = waiting
 * for review, diagonal hatch = revision, dashed = missed.
 */
const CAL_STYLE: Record<CalStatus, { className: string; style?: React.CSSProperties }> = {
  approved: { className: "bg-foreground text-background" },
  submitted: { className: "border border-foreground text-foreground" },
  revision: {
    className: "border border-foreground text-foreground",
    style: {
      backgroundImage: "repeating-linear-gradient(135deg, color-mix(in oklch, var(--foreground) 30%, transparent) 0 1px, transparent 1px 5px)",
      backgroundColor: "var(--card)",
      fontWeight: 600,
    },
  },
};

function ReportCalendar({ start, end, reports, role }: { start: string; end: string; reports: { id: number; date: string; status: CalStatus }[]; role: Role }) {
  const today = todayISO();
  const advertiser = role === "advertiser";
  const byDate = new Map(reports.map((r) => [r.date, r]));
  const lead = (parseISODate(start).getDay() + 6) % 7; // Monday-first grid
  const days = datesBetween(start, end);
  // Advertiser reports are not reviewed: a submitted report is done, and they report Monday–Friday.
  const style = (status: CalStatus) => CAL_STYLE[advertiser && status === "submitted" ? "approved" : status];
  const offDay = (d: string) => {
    const day = parseISODate(d).getDay();
    return day === 0 || (advertiser && day === 6);
  };
  const missed = days.filter((d) => d < today && !offDay(d) && !byDate.has(d)).length;
  const revisions = reports.filter((r) => r.status === "revision").length;
  const due = days.filter((d) => d < today && !offDay(d)).length;
  const onTime = due ? Math.round(((due - missed) / due) * 100) : null;

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
          const off = offDay(d);
          const future = d > today;
          const isToday = d === today;
          const look = r ? style(r.status) : null;
          const cls = look
            ? look.className
            : future || off
              ? "text-muted-foreground/40"
              : isToday
                ? "text-foreground"
                : "border border-dashed border-foreground/35 text-muted-foreground";
          const state = r ? (advertiser && r.status === "submitted" ? "submitted" : r.status) : future ? "upcoming" : off ? "day off" : isToday ? "due today" : "missed";
          const label = `${d}: ${state}`;
          const inner = (
            <span
              className={cn(
                "flex h-8 items-center justify-center rounded-md text-xs tabular-nums transition-opacity",
                cls,
                isToday && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
                r && "hover:opacity-80",
              )}
              style={look?.style}
            >
              {Number(d.slice(8))}
            </span>
          );
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
      <div className="mx-auto mt-4 flex max-w-md items-baseline justify-between gap-3 border-t pt-3 text-sm">
        <span>
          <span className="font-medium tabular-nums">{reports.length}</span> <span className="text-muted-foreground">laporan</span>
          <span className="mx-1.5 text-muted-foreground">·</span>
          <span className="font-medium tabular-nums">{missed}</span> <span className="text-muted-foreground">terlewat</span>
          {(!advertiser || revisions > 0) && (
            <>
              <span className="mx-1.5 text-muted-foreground">·</span>
              <span className="font-medium tabular-nums">{revisions}</span> <span className="text-muted-foreground">revisi</span>
            </>
          )}
        </span>
        {onTime !== null && (
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{onTime}%</span> disiplin
          </span>
        )}
      </div>
      <div className="mx-auto mt-2 flex max-w-md flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <Legend {...CAL_STYLE.approved} label={advertiser ? "Terkirim" : "Approved"} />
        {!advertiser && <Legend {...CAL_STYLE.submitted} label="Pending" />}
        {(!advertiser || revisions > 0) && <Legend {...CAL_STYLE.revision} label="Revision" />}
        <Legend className="border border-dashed border-foreground/35" label="Terlewat" />
        <Legend className="ring-2 ring-foreground ring-offset-1 ring-offset-card" label="Hari ini" />
      </div>
    </div>
  );
}

function Legend({ className, style, label }: { className: string; style?: React.CSSProperties; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-sm", className)} style={style} />
      {label}
    </span>
  );
}
