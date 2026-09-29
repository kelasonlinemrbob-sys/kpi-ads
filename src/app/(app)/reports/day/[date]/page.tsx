import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CoinsIcon,
  EyeIcon,
  FileTextIcon,
  MousePointerClickIcon,
  PencilIcon,
  TargetIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { db } from "@/db";
import { advertiserReportItems, dailyReports, users } from "@/db/schema";
import { cpr, ctr, formatId, formatPct, formatRp, sumMetrics, type AdMetrics } from "@/lib/ad-metrics";
import { requireUser } from "@/lib/auth";
import { getItemCampaigns, getMembers } from "@/lib/data";
import { todayISO } from "@/lib/kpi";
import { PLATFORM_DOT, PLATFORM_LABEL } from "@/lib/labels";
import { advertiserReportWindows, isAdvertiserReportDay } from "@/lib/reporting";
import { addDays, cn, formatLongDateId, parseISODate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/panel";
import { UrlSelect } from "@/components/dashboard/url-select";

export const metadata: Metadata = { title: "Laporan Harian" };

type Row = AdMetrics & {
  key: string;
  advertiser: string;
  platform: keyof typeof PLATFORM_LABEL;
  name: string;
  detail: string | null;
  manual?: boolean;
};

/** Everything reported on one report date: every period, per product or per platform campaign. */
export default async function ReportDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ view?: string; user?: string }>;
}) {
  const user = await requireUser();
  if (user.role !== "advertiser" && user.role !== "supervisor") redirect("/reports");
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const sp = await searchParams;
  const view = sp.view === "campaign" ? "campaign" : "product";
  const isSupervisor = user.role === "supervisor";
  const memberFilter = isSupervisor ? (sp.user ? Number(sp.user) : null) : user.id;

  const [reports, members] = await Promise.all([
    db
      .select({ id: dailyReports.id, summary: dailyReports.summary, userId: users.id, name: users.name })
      .from(dailyReports)
      .innerJoin(users, eq(users.id, dailyReports.userId))
      .where(
        and(
          eq(dailyReports.date, date),
          eq(users.role, "advertiser"),
          memberFilter ? eq(dailyReports.userId, memberFilter) : undefined,
        ),
      )
      .orderBy(asc(users.name)),
    isSupervisor ? getMembers(true).then((m) => m.filter((x) => x.role === "advertiser")) : Promise.resolve([]),
  ]);
  const items = reports.length
    ? await db
        .select()
        .from(advertiserReportItems)
        .where(inArray(advertiserReportItems.reportId, reports.map((r) => r.id)))
        .orderBy(asc(advertiserReportItems.product))
    : [];
  const breakdown = await getItemCampaigns(items.map((i) => i.id));
  const nameByReport = new Map(reports.map((r) => [r.id, r.name]));

  const periods = advertiserReportWindows(date).map((period) => {
    const periodItems = items.filter((i) => i.performanceDate === period.performanceDate);
    const rows: Row[] =
      view === "product"
        ? periodItems.map((i) => ({
            key: `p-${i.id}`,
            advertiser: nameByReport.get(i.reportId)!,
            platform: i.platform,
            name: i.product,
            detail: breakdown.get(i.id)?.length ? `${breakdown.get(i.id)!.length} campaign` : "Input manual",
            spent: i.spent,
            impressions: i.impressions,
            clicks: i.clicks,
            leads: i.leads,
          }))
        : periodItems.flatMap((i): Row[] => {
            const campaigns = breakdown.get(i.id) ?? [];
            const base = { advertiser: nameByReport.get(i.reportId)!, platform: i.platform, detail: i.product };
            // Rows typed in by hand have no campaign breakdown; keep them so totals still match.
            if (!campaigns.length) {
              return [{ ...base, key: `m-${i.id}`, name: "Input manual", manual: true, spent: i.spent, impressions: i.impressions, clicks: i.clicks, leads: i.leads }];
            }
            return campaigns.map((c) => ({ ...base, key: `c-${c.id}`, name: c.name, spent: c.spent, impressions: c.impressions, clicks: c.clicks, leads: c.leads }));
          });
    return { ...period, rows: rows.sort((a, b) => b.spent - a.spent), total: sumMetrics(periodItems) };
  });

  const fullDay = sumMetrics(periods.filter((p) => p.key === "previous_day").map((p) => p.total));
  const todayPeriod = periods.find((p) => p.key === "today_to_cutoff")!;
  const today = todayISO();
  const editable = !isSupervisor && date <= today && date >= addDays(today, -7) && isAdvertiserReportDay(date);
  const ownReport = !isSupervisor ? reports[0] : undefined;

  const step = (from: string, dir: 1 | -1) => {
    let d = addDays(from, dir);
    while (!isAdvertiserReportDay(d)) d = addDays(d, dir);
    return d;
  };
  const prev = step(date, -1);
  const next = step(date, 1);
  const href = (patch: Record<string, string | null>, path = `/reports/day/${date}`) => {
    const query = new URLSearchParams(Object.entries({ view: sp.view, user: sp.user }).filter(([, v]) => v) as [string, string][]);
    for (const [k, v] of Object.entries(patch)) (v === null ? query.delete(k) : query.set(k, v));
    const qs = query.toString();
    return qs ? `${path}?${qs}` : path;
  };
  const showAdvertiser = isSupervisor && !memberFilter;
  const columns = 8 + (showAdvertiser ? 1 : 0);

  return (
    <>
      <PageHeader
        title={formatLongDateId(date)}
        description={
          periods.length > 2
            ? "Laporan Senin: Jumat, Sabtu, Minggu (sehari penuh) dan Senin sampai 15.30 WIB."
            : "Semua product dan campaign yang dilaporkan untuk kemarin dan hari ini."
        }
        actions={
          <>
            {isSupervisor && (
              <UrlSelect
                param="user"
                label="Advertiser"
                value={memberFilter ? String(memberFilter) : "all"}
                options={[{ value: "all", label: "Semua advertiser" }, ...members.map((m) => ({ value: String(m.id), label: m.name }))]}
                icon={<UserIcon className="size-4 text-foreground/70" />}
              />
            )}
            <div className="flex">
              <Button asChild variant="outline" size="icon" className="h-8 rounded-r-none" aria-label="Hari kerja sebelumnya">
                <Link href={href({}, `/reports/day/${prev}`)}>
                  <ChevronLeftIcon />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="icon"
                className={cn("-ml-px h-8 rounded-l-none", next > today && "pointer-events-none opacity-50")}
                aria-label="Hari kerja berikutnya"
              >
                <Link href={href({}, `/reports/day/${next}`)}>
                  <ChevronRightIcon />
                </Link>
              </Button>
            </div>
            {editable && (
              <Button asChild className="h-8">
                <Link href={`/reports/new?date=${date}`}>
                  <PencilIcon /> {ownReport ? "Edit laporan" : "Isi laporan"}
                </Link>
              </Button>
            )}
          </>
        }
      />

      {reports.length === 0 ? (
        <Panel>
          <EmptyState
            icon={FileTextIcon}
            title="Belum ada laporan pada tanggal ini"
            action={
              editable ? (
                <Button asChild size="sm">
                  <Link href={`/reports/new?date=${date}`}>Isi laporan</Link>
                </Button>
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <>
          <div className="mb-1 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Stat title="Spend" icon={CoinsIcon} value={formatRp(fullDay.spent)} />
            <Stat title="Impression" icon={EyeIcon} value={formatId(fullDay.impressions)} />
            <Stat title="Click" icon={MousePointerClickIcon} value={formatId(fullDay.clicks)} hint={`CTR ${formatPct(ctr(fullDay))}`} />
            <Stat title="Lead" icon={UsersIcon} value={formatId(fullDay.leads)} />
            <Stat title="CPR" icon={TargetIcon} value={formatRp(cpr(fullDay))} />
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Ringkasan dari periode sehari penuh. Hari ini s/d 15.30: {formatRp(todayPeriod.total.spent)} ·{" "}
            {formatId(todayPeriod.total.leads)} lead · CPR {formatRp(cpr(todayPeriod.total))}
          </p>

          <div className="mb-3 inline-flex rounded-lg bg-muted p-1">
            {(
              [
                { value: "product", label: "Per product" },
                { value: "campaign", label: "Per campaign" },
              ] as const
            ).map((tab) => (
              <Link
                key={tab.value}
                href={href({ view: tab.value === "product" ? null : tab.value })}
                className={cn(
                  "rounded-md px-3 py-1 text-sm transition-colors",
                  view === tab.value ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            ))}
          </div>

          <Panel>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm [&_td]:border [&_th]:border [&_td]:border-border [&_th]:border-border">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    {showAdvertiser && <th className="px-3 py-2 text-left font-medium">Advertiser</th>}
                    <th className="px-3 py-2 text-left font-medium">{view === "product" ? "Product" : "Campaign"}</th>
                    <th className="px-3 py-2 text-left font-medium">{view === "product" ? "Sumber" : "Product"}</th>
                    <th className="px-3 py-2 text-right font-medium">Spend (Rp)</th>
                    <th className="px-3 py-2 text-right font-medium">Impression</th>
                    <th className="px-3 py-2 text-right font-medium">Click</th>
                    <th className="px-3 py-2 text-right font-medium">CTR</th>
                    <th className="px-3 py-2 text-right font-medium">Lead</th>
                    <th className="px-3 py-2 text-right font-medium">CPR (Rp)</th>
                  </tr>
                </thead>
                {periods.map((period) => (
                  <tbody key={period.performanceDate}>
                    <tr className="bg-muted/30">
                      <td colSpan={columns} className="px-3 py-1.5 text-xs font-medium">
                        {period.title}{" "}
                        <span className="font-normal text-muted-foreground">
                          · {parseISODate(period.performanceDate).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} ·{" "}
                          {period.timeRange}
                        </span>
                      </td>
                    </tr>
                    {period.rows.length === 0 ? (
                      <tr>
                        <td colSpan={columns} className="px-3 py-3 text-center text-muted-foreground">
                          Periode ini belum dilaporkan.
                        </td>
                      </tr>
                    ) : (
                      period.rows.map((row) => (
                        <tr key={row.key} className="hover:bg-muted/20">
                          {showAdvertiser && <td className="px-3 py-2">{row.advertiser}</td>}
                          <td className={cn("max-w-80 truncate px-3 py-2", row.manual ? "italic text-muted-foreground" : "font-medium")} title={row.name}>
                            <span className="inline-flex items-center gap-2">
                              <span className={cn("size-2 shrink-0 rounded-full", PLATFORM_DOT[row.platform])} title={PLATFORM_LABEL[row.platform]} />
                              {row.name}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{row.detail}</td>
                          <Num>{formatId(row.spent)}</Num>
                          <Num>{formatId(row.impressions)}</Num>
                          <Num>{formatId(row.clicks)}</Num>
                          <Num>{formatPct(ctr(row))}</Num>
                          <Num>{formatId(row.leads)}</Num>
                          <Num>{formatId(cpr(row))}</Num>
                        </tr>
                      ))
                    )}
                    {period.rows.length > 0 && (
                      <tr className="font-medium">
                        <td colSpan={showAdvertiser ? 3 : 2} className="px-3 py-2 text-xs text-muted-foreground">
                          Subtotal
                        </td>
                        <Num>{formatId(period.total.spent)}</Num>
                        <Num>{formatId(period.total.impressions)}</Num>
                        <Num>{formatId(period.total.clicks)}</Num>
                        <Num>{formatPct(ctr(period.total))}</Num>
                        <Num>{formatId(period.total.leads)}</Num>
                        <Num>{formatId(cpr(period.total))}</Num>
                      </tr>
                    )}
                  </tbody>
                ))}
              </table>
            </div>
          </Panel>

          <Panel title="Catatan" className="mt-3" bodyClassName="divide-y">
            {reports.map((report) => (
              <div key={report.id} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                <p>
                  {isSupervisor && <span className="font-medium">{report.name}: </span>}
                  <span className="text-muted-foreground">{report.summary}</span>
                </p>
                <Link href={`/reports/${report.id}`} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
                  Detail laporan →
                </Link>
              </div>
            ))}
          </Panel>
        </>
      )}
    </>
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
