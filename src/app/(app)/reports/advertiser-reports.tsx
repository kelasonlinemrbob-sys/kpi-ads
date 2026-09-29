import Link from "next/link";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { ChevronRightIcon, CircleCheckIcon, CoinsIcon, EyeIcon, MousePointerClickIcon, TargetIcon, UsersIcon } from "lucide-react";
import { db } from "@/db";
import { advertiserReportItems, dailyReports } from "@/db/schema";
import { cpr, ctr, formatId, formatPct, formatRp } from "@/lib/ad-metrics";
import { getReportDayMetrics, type ReportDayMetrics } from "@/lib/data";
import { todayISO } from "@/lib/kpi";
import { advertiserReportWindows, isAdvertiserReportDay } from "@/lib/reporting";
import { getReportRules } from "@/lib/report-rules";
import { addDays, cn, formatDate, formatLongDateId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/dashboard/panel";

const DAY_SHORT: Record<string, string> = { Jumat: "Jum", Sabtu: "Sab", Minggu: "Min" };

type DayState = "complete" | "partial" | "missing" | "missed";


type DayRow = {
  date: string;
  editable: boolean;
  reportId: number | null;
  summary: string | null;
  periods: { label: string; performanceDate: string; saved: boolean }[];
  products: number;
  metrics: ReportDayMetrics | null;
  state: DayState;
};

/** Advertiser view of "My Reports": one row per working day, including days not reported yet. */
export async function AdvertiserReports({
  userId,
  start,
  end,
  rangeLabel,
  filter,
  filterHref,
}: {
  userId: number;
  start: string;
  end: string;
  rangeLabel: string;
  filter: "all" | "todo";
  filterHref: (filter: "all" | "todo") => string;
}) {
  const today = todayISO();
  const last = end < today ? end : today;
  const { backfillDays, cutoff } = await getReportRules();
  const editableFrom = addDays(today, -backfillDays);

  const reports = await db
    .select({ id: dailyReports.id, date: dailyReports.date, summary: dailyReports.summary })
    .from(dailyReports)
    .where(and(eq(dailyReports.userId, userId), gte(dailyReports.date, start), lte(dailyReports.date, end)));
  const reportIds = reports.map((r) => r.id);
  const [items, metricsByReport] = await Promise.all([
    reportIds.length
      ? db
          .select({
            reportId: advertiserReportItems.reportId,
            performanceDate: advertiserReportItems.performanceDate,
            campaignId: advertiserReportItems.campaignId,
          })
          .from(advertiserReportItems)
          .where(inArray(advertiserReportItems.reportId, reportIds))
      : Promise.resolve([]),
    getReportDayMetrics(reportIds),
  ]);

  const reportByDate = new Map(reports.map((r) => [r.date, r]));
  const dates = new Set(reports.map((r) => r.date));
  for (let d = start; d <= last; d = addDays(d, 1)) if (isAdvertiserReportDay(d)) dates.add(d);

  const days: DayRow[] = [...dates]
    .sort((a, b) => b.localeCompare(a))
    .map((date) => {
      const report = reportByDate.get(date) ?? null;
      const reportItems = report ? items.filter((i) => i.reportId === report.id) : [];
      const savedDates = new Set(reportItems.map((i) => i.performanceDate));
      const metrics = report ? (metricsByReport.get(report.id) ?? null) : null;
      const periods = advertiserReportWindows(date, cutoff).map((p) => ({
        label: DAY_SHORT[p.label] ?? p.label,
        performanceDate: p.performanceDate,
        // Older reports without item rows count as complete: they were filled in the previous format.
        saved: report !== null && (reportItems.length === 0 || savedDates.has(p.performanceDate)),
      }));
      const savedCount = periods.filter((p) => p.saved).length;
      const state: DayState = !report
        ? date < editableFrom
          ? "missed"
          : "missing"
        : savedCount === periods.length
          ? "complete"
          : "partial";
      return {
        date,
        editable: date >= editableFrom,
        reportId: report?.id ?? null,
        summary: report?.summary ?? null,
        periods,
        products: new Set(reportItems.map((i) => i.campaignId)).size,
        metrics,
        state,
      };
    });

  const withMetrics = days.flatMap((d) => (d.metrics ? [d.metrics] : []));
  const total = {
    spent: withMetrics.reduce((sum, m) => sum + m.spent, 0),
    leads: withMetrics.reduce((sum, m) => sum + m.leads, 0),
    impressions: withMetrics.reduce((sum, m) => sum + (m.impressions ?? 0), 0),
    clicks: withMetrics.reduce((sum, m) => sum + (m.clicks ?? 0), 0),
  };
  const workdays = days.filter((d) => isAdvertiserReportDay(d.date));
  const complete = workdays.filter((d) => d.state === "complete").length;
  const todo = days.filter((d) => (d.state === "missing" || d.state === "partial") && d.editable);
  const visible = filter === "todo" ? todo : days;

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat title="Spend" icon={CoinsIcon} value={formatRp(total.spent)} />
        <Stat title="Impression" icon={EyeIcon} value={formatId(total.impressions)} />
        <Stat title="Click" icon={MousePointerClickIcon} value={formatId(total.clicks)} hint={`CTR ${formatPct(ctr(total))}`} />
        <Stat title="Lead" icon={UsersIcon} value={formatId(total.leads)} />
        <Stat title="CPR" icon={TargetIcon} value={formatRp(cpr(total))} />
        <Stat
          title="Kelengkapan"
          icon={CircleCheckIcon}
          value={`${complete}/${workdays.length}`}
          hint={workdays.length ? `${Math.round((complete / workdays.length) * 100)}% hari kerja lengkap` : undefined}
        />
      </div>

      <div className="mb-3 flex gap-1 rounded-xl border bg-muted/50 p-1 sm:w-fit">
        {(
          [
            { value: "all", label: "Semua", n: days.length },
            { value: "todo", label: "Perlu dilengkapi", n: todo.length },
          ] as const
        ).map((tab) => (
          <Link
            key={tab.value}
            href={filterHref(tab.value)}
            className={cn(
              "flex h-8 items-center gap-2 rounded-lg px-3 text-sm transition-colors",
              filter === tab.value ? "bg-card font-medium shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            <span
              className={cn(
                "rounded-md px-1.5 text-xs tabular-nums",
                tab.value === "todo" && tab.n > 0 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
              )}
            >
              {tab.n}
            </span>
          </Link>
        ))}
      </div>

      <Panel title={`${visible.length} hari · ${rangeLabel}`}>
        {visible.length === 0 ? (
          <EmptyState
            icon={CircleCheckIcon}
            title={filter === "todo" ? "Semua laporan sudah lengkap" : "Belum ada laporan pada rentang ini"}
            description={filter === "todo" ? "Tidak ada laporan yang perlu dilengkapi." : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-sm [&_td]:border [&_th]:border [&_td]:border-border [&_th]:border-border">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="min-w-56 px-3 py-2 text-left font-medium">Tanggal</th>
                  <th className="px-3 py-2 text-left font-medium">Periode</th>
                  <th className="px-3 py-2 text-right font-medium">Spend (Rp)</th>
                  <th className="px-3 py-2 text-right font-medium">Impression</th>
                  <th className="px-3 py-2 text-right font-medium">Click</th>
                  <th className="px-3 py-2 text-right font-medium">CTR</th>
                  <th className="px-3 py-2 text-right font-medium">Lead</th>
                  <th className="px-3 py-2 text-right font-medium">CPR (Rp)</th>
                  <th className="w-32 px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {visible.map((day) => (
                  <DayItem key={day.date} day={day} />
                ))}
              </tbody>
              <tfoot className="bg-muted/40 font-medium">
                <tr>
                  <td className="px-3 py-2" colSpan={2}>
                    Total
                  </td>
                  <Num>{formatId(total.spent)}</Num>
                  <Num>{formatId(total.impressions)}</Num>
                  <Num>{formatId(total.clicks)}</Num>
                  <Num>{formatPct(ctr(total))}</Num>
                  <Num>{formatId(total.leads)}</Num>
                  <Num>{formatId(cpr(total))}</Num>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-2 text-xs text-muted-foreground">
        Angka dihitung dari periode sehari penuh. Klik tanggal untuk melihat semua product dan campaign pada hari itu.
        Laporan dapat diisi atau diedit hingga {backfillDays} hari.
      </p>
    </>
  );
}

function DayItem({ day }: { day: DayRow }) {
  const m = day.metrics;
  const firstMissing = day.periods.find((p) => !p.saved);
  const action =
    day.state === "missing"
      ? { label: "Isi laporan", href: `/reports/new?date=${day.date}` }
      : day.state === "partial" && firstMissing && day.editable
        ? { label: "Lengkapi", href: `/reports/new?date=${day.date}&window=${firstMissing.performanceDate}` }
        : null;
  const dateLabel = formatLongDateId(day.date);

  return (
    <tr className={cn("transition-colors hover:bg-muted/30", !day.reportId && "bg-muted/20")}>
      <td className="px-3 py-2">
        {day.reportId ? (
          <Link href={`/reports/day/${day.date}`} className="font-medium underline-offset-4 hover:underline">
            {dateLabel}
          </Link>
        ) : (
          <span className="font-medium text-muted-foreground">{dateLabel}</span>
        )}
        <p className="text-xs text-muted-foreground">
          {day.state === "missed" ? (
            <span className="text-destructive">Terlewat</span>
          ) : day.state === "missing" ? (
            <span className="text-warning">Belum dikirim</span>
          ) : day.state === "partial" && !day.editable ? (
            "Tidak lengkap"
          ) : day.products > 0 ? (
            `${day.products} product`
          ) : null}
        </p>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {day.periods.map((p) => (
            <span
              key={p.performanceDate}
              title={`${p.label} ${formatDate(p.performanceDate, { day: "numeric", month: "short" })} · ${p.saved ? "tersimpan" : "belum diisi"}`}
              className={cn(
                "rounded-md border px-1.5 py-0.5 text-xs",
                p.saved ? "border-success/25 bg-success/10 text-success" : "border-dashed text-muted-foreground",
              )}
            >
              {p.label}
            </span>
          ))}
        </div>
      </td>
      <Num>{m ? formatId(m.spent) : "—"}</Num>
      <Num>{formatId(m?.impressions ?? null)}</Num>
      <Num>{formatId(m?.clicks ?? null)}</Num>
      <Num>{m && m.impressions !== null && m.clicks !== null ? formatPct(ctr({ clicks: m.clicks, impressions: m.impressions })) : "—"}</Num>
      <Num>{m ? formatId(m.leads) : "—"}</Num>
      <Num>{m ? formatId(cpr(m)) : "—"}</Num>
      <td className="px-3 py-2 text-right">
        {action ? (
          <Button asChild size="sm" variant={day.state === "missing" ? "default" : "outline"}>
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : day.reportId ? (
          <Link
            href={`/reports/day/${day.date}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            title={day.summary ?? undefined}
          >
            Lihat <ChevronRightIcon className="size-3.5" />
          </Link>
        ) : null}
      </td>
    </tr>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-right tabular-nums">{children}</td>;
}

function Stat({
  title,
  icon: Icon,
  value,
  hint,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="flex items-center justify-between text-sm text-muted-foreground">
        {title}
        <Icon className="size-4" />
      </p>
      <p className="mt-1 text-xl font-medium tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
