import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { CalendarIcon, ClipboardPenIcon, NotebookPenIcon, PencilIcon, SearchIcon } from "lucide-react";
import { db } from "@/db";
import { dailyReports } from "@/db/schema";
import { cpr, formatId } from "@/lib/ad-metrics";
import { requireUser } from "@/lib/auth";
import { getReportDayMetrics } from "@/lib/data";
import { todayISO } from "@/lib/kpi";
import { getReportRules } from "@/lib/report-rules";
import { resolveReportRange } from "@/lib/reporting";
import { addDays, formatLongDateId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/panel";
import { UrlSelect } from "@/components/dashboard/url-select";

export const metadata: Metadata = { title: "Catatan Harian" };


/** The notes advertisers write with each daily ads report, next to that day's spend and results. */
export default async function DailyNotesPage({ searchParams }: { searchParams: Promise<{ range?: string; q?: string }> }) {
  const user = await requireUser();
  if (user.role !== "advertiser") redirect("/reports");
  const sp = await searchParams;
  const today = todayISO();
  const { range, options } = resolveReportRange(sp.range, today);
  const q = sp.q?.trim() ?? "";
  const editableFrom = addDays(today, -(await getReportRules()).backfillDays);

  const reports = await db
    .select({ id: dailyReports.id, date: dailyReports.date, summary: dailyReports.summary, updatedAt: dailyReports.updatedAt })
    .from(dailyReports)
    .where(
      and(
        eq(dailyReports.userId, user.id),
        gte(dailyReports.date, range.start),
        lte(dailyReports.date, range.end),
        q ? ilike(dailyReports.summary, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined,
      ),
    )
    .orderBy(desc(dailyReports.date));
  const metrics = await getReportDayMetrics(reports.map((r) => r.id));

  return (
    <>
      <PageHeader
        title="Catatan Harian"
        description="Catatan optimasi, kendala dan insight dari setiap laporan iklan harian, lengkap dengan spend dan hasilnya."
        actions={
          <>
            <UrlSelect
              param="range"
              label="Rentang tanggal"
              value={range.value}
              options={options.map(({ value, label }) => ({ value, label }))}
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

      <form className="mb-3 flex max-w-md gap-2" role="search">
        {sp.range && <input type="hidden" name="range" value={sp.range} />}
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Cari catatan…" className="pl-8" aria-label="Cari catatan" />
        </div>
        <Button type="submit" variant="outline">
          Cari
        </Button>
      </form>

      <Panel title={`${reports.length} catatan · ${range.label}${q ? ` · “${q}”` : ""}`}>
        {reports.length === 0 ? (
          <EmptyState
            icon={NotebookPenIcon}
            title={q ? "Tidak ada catatan yang cocok" : "Belum ada catatan pada rentang ini"}
            description={q ? "Coba kata kunci lain atau ubah rentang tanggal." : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm [&_td]:border [&_th]:border [&_td]:border-border [&_th]:border-border">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="w-12 px-3 py-2 text-right font-medium">No</th>
                  <th className="w-60 px-3 py-2 text-left font-medium">Tanggal</th>
                  <th className="px-3 py-2 text-left font-medium">Catatan</th>
                  <th className="w-32 px-3 py-2 text-right font-medium">Spend (Rp)</th>
                  <th className="w-20 px-3 py-2 text-right font-medium">Lead</th>
                  <th className="w-28 px-3 py-2 text-right font-medium">CPR (Rp)</th>
                  <th className="w-36 px-3 py-2 text-left font-medium">Diperbarui</th>
                  <th className="w-20 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {reports.map((report, index) => {
                  const m = metrics.get(report.id);
                  return (
                    <tr key={report.id} className="align-top transition-colors hover:bg-muted/30">
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{index + 1}</td>
                      <td className="px-3 py-2.5">
                        <Link href={`/reports/day/${report.date}`} className="font-medium underline-offset-4 hover:underline">
                          {formatLongDateId(report.date)}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 whitespace-pre-line">{report.summary}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{m ? formatId(m.spent) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{m ? formatId(m.leads) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{m ? formatId(cpr(m)) : "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {report.updatedAt.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {report.date >= editableFrom && (
                          <Button asChild variant="ghost" size="icon-sm" aria-label="Edit catatan">
                            <Link href={`/reports/new?date=${report.date}`}>
                              <PencilIcon />
                            </Link>
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-2 text-xs text-muted-foreground">
        Spend, lead dan CPR dari periode sehari penuh. Klik tanggal untuk melihat semua product dan campaign hari itu.
      </p>
    </>
  );
}
