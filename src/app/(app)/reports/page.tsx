import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, gte, inArray, lte, ne, type SQL } from "drizzle-orm";
import { CalendarIcon, ClipboardPenIcon, MessageCircleIcon, UserIcon } from "lucide-react";
import { db } from "@/db";
import { dailyReports, kpiEntries, users, waSessions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getMembers, getMetrics } from "@/lib/data";
import { periodRange, todayISO } from "@/lib/kpi";
import { resolveReportRange } from "@/lib/reporting";
import { resolvePeriod } from "@/lib/period";
import { cn, formatValue } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/panel";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { UrlSelect } from "@/components/dashboard/url-select";
import { AdvertiserReports } from "./advertiser-reports";
import { ReportsTable, type ReportRow } from "./reports-table";

export const metadata: Metadata = { title: "Daily Reports" };

const PAGE_SIZE = 50;
const STATUSES = [
  { value: "all", label: "All" },
  { value: "submitted", label: "Pending Review" },
  { value: "approved", label: "Approved" },
  { value: "revision", label: "Needs Revision" },
] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { period, options } = resolvePeriod(sp.period);
  const { start, end } = periodRange(period);
  const status = STATUSES.some((s) => s.value === sp.status) ? (sp.status as (typeof STATUSES)[number]["value"]) : "all";
  const isSupervisor = user.role === "supervisor";
  const memberFilter = isSupervisor ? (sp.user ? Number(sp.user) : null) : user.id;
  const page = Math.max(1, Number(sp.page) || 1);

  if (user.role === "advertiser") {
    const filter = sp.filter === "todo" ? "todo" : "all";
    const { range, options: rangeOptions } = resolveReportRange(sp.range, todayISO());
    const [wa] = await db.select().from(waSessions).where(eq(waSessions.userId, user.id));
    const waReady = wa?.status === "connected" && !!wa.groupJid && wa.autoSend;
    const href = (next: "all" | "todo") => {
      const params = new URLSearchParams(sp.range ? { range: sp.range } : {});
      if (next === "todo") params.set("filter", "todo");
      const qs = params.toString();
      return qs ? `/reports?${qs}` : "/reports";
    };
    return (
      <>
        <PageHeader
          title="My Reports"
          description="Laporan iklan harianmu per hari kerja. Lengkapi periode yang belum diisi sebelum lewat 7 hari."
          actions={
            <>
              <Button asChild variant="outline" className="h-8">
                <Link href="/settings#whatsapp" title={waReady ? `Laporan otomatis dikirim ke ${wa?.groupName}` : "Hubungkan WhatsApp"}>
                  <MessageCircleIcon className={waReady ? "text-success" : "text-muted-foreground"} />
                  {waReady ? "WA aktif" : "Hubungkan WA"}
                </Link>
              </Button>
              <UrlSelect
                param="range"
                label="Rentang tanggal"
                value={range.value}
                options={rangeOptions.map(({ value, label }) => ({ value, label }))}
                icon={<CalendarIcon className="size-4 text-foreground/70" />}
              />
              <Button asChild className="h-8">
                <Link href="/reports/new">
                  <ClipboardPenIcon /> Submit report
                </Link>
              </Button>
            </>
          }
        />
        <AdvertiserReports
          userId={user.id}
          start={range.start}
          end={range.end}
          rangeLabel={range.label}
          filter={filter}
          filterHref={href}
        />
      </>
    );
  }

  const where: SQL[] = [gte(dailyReports.date, start), lte(dailyReports.date, end)];
  if (memberFilter) where.push(eq(dailyReports.userId, memberFilter));
  const base = and(...where);
  const statusCondition =
    status === "all"
      ? undefined
      : status === "submitted" && isSupervisor
        ? and(eq(dailyReports.status, status), ne(users.role, "advertiser"))
        : eq(dailyReports.status, status);
  const filtered = statusCondition ? and(base, statusCondition) : base;

  const [metrics, members, statusCounts, [{ total }], reports] = await Promise.all([
    getMetrics(),
    isSupervisor ? getMembers(true) : Promise.resolve([]),
    db
      .select({ status: dailyReports.status, role: users.role, n: count() })
      .from(dailyReports)
      .innerJoin(users, eq(users.id, dailyReports.userId))
      .where(base)
      .groupBy(dailyReports.status, users.role),
    db
      .select({ total: count() })
      .from(dailyReports)
      .innerJoin(users, eq(users.id, dailyReports.userId))
      .where(filtered),
    db
      .select({
        id: dailyReports.id,
        date: dailyReports.date,
        status: dailyReports.status,
        summary: dailyReports.summary,
        userId: users.id,
        name: users.name,
        role: users.role,
        createdAt: dailyReports.createdAt,
      })
      .from(dailyReports)
      .innerJoin(users, eq(users.id, dailyReports.userId))
      .where(filtered)
      .orderBy(desc(dailyReports.date), desc(dailyReports.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  const entries = reports.length
    ? await db
        .select()
        .from(kpiEntries)
        .where(inArray(kpiEntries.reportId, reports.map((r) => r.id)))
    : [];
  const metricById = new Map(metrics.map((m) => [m.id, m]));
  const rows: ReportRow[] = reports.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    highlights: entries
      .filter((e) => e.reportId === r.id)
      .map((e) => ({ metric: metricById.get(e.metricId)!, value: e.value }))
      .filter((x) => x.metric && x.metric.weight > 0)
      .sort((a, b) => a.metric.sortOrder - b.metric.sortOrder)
      .slice(0, 3)
      .map((x) => ({ label: x.metric.name, value: formatValue(x.value, x.metric.unit, true) })),
  }));

  const countOf = (s: string) => {
    const matching = statusCounts.filter(
      (count) => count.status === s && !(isSupervisor && s === "submitted" && count.role === "advertiser"),
    );
    return s === "all" ? statusCounts.reduce((total, count) => total + count.n, 0) : matching.reduce((total, count) => total + count.n, 0);
  };
  const visibleStatuses = STATUSES;
  const qs = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]);
    for (const [k, v] of Object.entries(patch)) (v === null ? next.delete(k) : next.set(k, v));
    next.delete("page");
    for (const [k, v] of Object.entries(patch)) if (k === "page" && v) next.set("page", v);
    const s = next.toString();
    return s ? `/reports?${s}` : "/reports";
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title={isSupervisor ? "Daily Reports" : "My Reports"}
        description={
          isSupervisor
            ? "Pantau laporan harian tim. Laporan advertiser langsung tercatat tanpa approval."
            : "Your daily KPI submissions. Reports can be edited until they are approved."
        }
        actions={
          <>
            {isSupervisor && (
              <UrlSelect
                param="user"
                label="Member"
                value={memberFilter ? String(memberFilter) : "all"}
                options={[{ value: "all", label: "All members" }, ...members.map((m) => ({ value: String(m.id), label: m.name }))]}
                icon={<UserIcon className="size-4 text-foreground/70" />}
              />
            )}
            <PeriodSelect value={period} options={options} />
            {!isSupervisor && (
              <Button asChild className="h-8">
                <Link href="/reports/new">
                  <ClipboardPenIcon /> Submit report
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl border bg-muted/50 p-1 sm:w-fit">
        {visibleStatuses.map((s) => (
          <Link
            key={s.value}
            href={qs({ status: s.value === "all" ? null : s.value })}
            className={cn(
              "flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition-colors",
              status === s.value ? "bg-card font-medium shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
            <span className="rounded-md bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{countOf(s.value)}</span>
          </Link>
        ))}
      </div>

      <ReportsTable rows={rows} canApprove={isSupervisor} showMember={isSupervisor} />

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {pages} · {total} reports
          </span>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className={cn(page <= 1 && "pointer-events-none opacity-50")}>
              <Link href={qs({ page: String(page - 1) })}>Previous</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className={cn(page >= pages && "pointer-events-none opacity-50")}>
              <Link href={qs({ page: String(page + 1) })}>Next</Link>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
