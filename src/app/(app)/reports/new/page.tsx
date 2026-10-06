import type { Metadata } from "next";
import { getFormLeadCounts } from "@/lib/form-lead-metrics";
import { and, asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { advertiserReportItems, campaigns, dailyReports, kpiEntries } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getItemCampaigns, getMetrics } from "@/lib/data";
import { getWebmasterTaskOptions } from "@/lib/webmaster-report-data";
import { getSeoDailyTargets } from "@/lib/seo-report-data";
import { todayISO } from "@/lib/kpi";
import { advertiserReportWindows, formatCutoff, isAdvertiserReportDay, latestAdvertiserReportDate } from "@/lib/reporting";
import { getReportRules } from "@/lib/report-rules";
import { addDays } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/panel";
import { memberRoles } from "@/lib/member-roles";
import { ROLE_LABEL } from "@/lib/roles";
import { TabLink } from "../../campaigns/ad-campaigns-table";
import { AdvertiserReportForm } from "./advertiser-report-form";
import { ReportForm } from "./report-form";

export const metadata: Metadata = { title: "Submit Report" };

export default async function NewReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; window?: string; role?: string }>;
}) {
  const user = await requireUser();
  const today = todayISO();
  const rules = await getReportRules();
  const cut = formatCutoff(rules.cutoff);
  const minDate = addDays(today, -rules.backfillDays);
  const { date: requested, window: requestedWindow, role: requestedRole } = await searchParams;
  // A dual-role member reports each role on its own tab; both parts share one daily report.
  const roles = memberRoles(user);
  const dualRole = roles.length > 1;
  const role = roles.find((r) => r === requestedRole) ?? roles[0]!;
  const validRequested =
    requested &&
    /^\d{4}-\d{2}-\d{2}$/.test(requested) &&
    requested <= today &&
    requested >= minDate &&
    (role !== "advertiser" || isAdvertiserReportDay(requested));
  const date = validRequested ? requested : role === "advertiser" ? latestAdvertiserReportDate(today) : today;
  const roleTabs = dualRole ? (
    <div className="mb-3 inline-flex rounded-lg bg-muted p-1">
      {roles.map((r) => (
        <TabLink key={r} href={`/reports/new?date=${date}&role=${r}`} active={r === role}>
          {r === "advertiser" ? "Laporan Iklan" : `Laporan ${ROLE_LABEL[r]}`}
        </TabLink>
      ))}
    </div>
  ) : null;

  const [existing] = await db
    .select()
    .from(dailyReports)
    .where(and(eq(dailyReports.userId, user.id), eq(dailyReports.date, date)))
    .limit(1);


  if (existing?.source === "legacy_csv") redirect(`/reports/${existing.id}`);

  if (role === "advertiser") {
    const [ownedCampaigns, existingItems] = await Promise.all([
      db.select().from(campaigns).where(eq(campaigns.ownerId, user.id)).orderBy(asc(campaigns.product), asc(campaigns.name)),
      existing
        ? db
            .select()
            .from(advertiserReportItems)
            .where(eq(advertiserReportItems.reportId, existing.id))
            .orderBy(asc(advertiserReportItems.performanceDate), asc(advertiserReportItems.id))
        : Promise.resolve([]),
    ]);
    const reportDates = advertiserReportWindows(date,rules.cutoff).map(p=>p.performanceDate).sort();
    const formCounts = await getFormLeadCounts(reportDates[0],reportDates.at(-1)!,[user.id],db,{date,cutoff:rules.cutoff});
    const itemCampaigns = await getItemCampaigns(existingItems.map((item) => item.id));
    const usedCampaignIds = new Set(existingItems.map((item) => item.campaignId));
    const campaignOptions = ownedCampaigns
      .filter((campaign) => campaign.status !== "ended" || usedCampaignIds.has(campaign.id))
      .map((campaign) => ({
        id: campaign.id,
        formLeadSince: campaign.formLeadSince,
        formLeads: Object.fromEntries(formCounts.filter(r=>r.campaignId===campaign.id).map(r=>[r.date,r.leads])),
        name: campaign.name,
        product: campaign.product?.trim() || campaign.name,
        platform: campaign.platform,
        status: campaign.status,
        linked:
          (campaign.platform === "meta" || campaign.platform === "google") &&
          campaign.adAccountId !== null &&
          Boolean(campaign.matchKeyword?.trim()),
      }));
    const periods = advertiserReportWindows(date, rules.cutoff);
    const savedPeriods = new Set(existingItems.map((item) => item.performanceDate));
    // Open the requested period (?window=YYYY-MM-DD, or previous_day / today_to_cutoff),
    // otherwise the first one that is still empty.
    const requestedPeriod =
      periods.find((period) => period.performanceDate === requestedWindow) ??
      periods.find((period) => period.key === requestedWindow && requestedWindow === "today_to_cutoff") ??
      (requestedWindow === "previous_day" ? periods[0] : undefined);
    const initialPeriod = (requestedPeriod ?? periods.find((period) => !savedPeriods.has(period.performanceDate)) ?? periods[0]!)
      .performanceDate;

    return (
      <>
        <PageHeader
          title={existing ? "Edit Laporan Harian Advertiser" : "Laporan Harian Advertiser"}
          description={
            periods.length > 2
              ? `Laporan Senin mencakup Jumat, Sabtu, Minggu (sehari penuh) dan Senin sampai ${cut} WIB.`
              : `Pilih periode, generate dari Ads atau isi manual, lalu kirim sebelum ${cut} WIB.`
          }
        />
        {roleTabs}
        <AdvertiserReportForm
          dualRole={dualRole}
          cutoff={rules.cutoff}
          backfillDays={rules.backfillDays}
          key={date}
          date={date}
          minDate={minDate}
          maxDate={today}
          initialPeriod={initialPeriod}
          campaigns={campaignOptions}
          existing={
            existing
              ? {
                  status: existing.status,
                  summary: existing.summary,
                  reviewNote: existing.reviewNote,
                }
              : null
          }
          existingItems={existingItems.map((item) => ({
            id: item.id,
            campaignId: item.campaignId,
            performanceDate: item.performanceDate,
            platform: item.platform,
            spent: item.spent,
            impressions: item.impressions,
            clicks: item.clicks,
            leads: item.leads,
            adsLeads: item.adsLeads,
            leadSource: item.leadSource,
            landingPageViews: item.landingPageViews,
            campaigns: (itemCampaigns.get(item.id) ?? []).map((c) => ({
              id: c.externalId,
              name: c.name,
              spent: c.spent,
              impressions: c.impressions,
              clicks: c.clicks,
              leads: c.leads,
              landingPageViews: c.landingPageViews,
            })),
          }))}
        />
      </>
    );
  }

  const metrics = (await getMetrics()).filter((metric) => metric.role === role);
  const webmasterOptions = role === "webmaster" ? await getWebmasterTaskOptions(user, date) : [];
  const seoTargets = role === "seo" ? await getSeoDailyTargets(user.id, date) : [];
  const values = existing ? await db.select().from(kpiEntries).where(eq(kpiEntries.reportId, existing.id)) : [];

  return (
    <>
      <PageHeader
        title={role === "seo" ? existing ? "Edit Laporan Harian SEO" : "Laporan Harian SEO" : role === "webmaster" ? existing ? "Edit Laporan Harian Webmaster" : "Laporan Harian Webmaster" : existing ? "Edit Daily Report" : "Submit Daily Report"}
        description={
          dualRole
            ? `Isi angka KPI ${ROLE_LABEL[role]} hari ini. Bagian ini masuk ke laporan harian yang sama dengan role lainnya dan direview supervisor.`
            : role === "seo" ? "Laporkan SEO Score, artikel, impression, dan klik hari ini. Pantau pencapaian target sebelum mengirim." : role === "webmaster" ? "Catat task harian, status pengerjaan, kategori, dan hasil pekerjaan. Target penyelesaian task 100%." : "Enter today's numbers and a short summary. Your KPI score updates as soon as you submit."
        }
      />
      {roleTabs}
      <ReportForm
        role={role}
        seoTargets={seoTargets}
        webmasterOptions={webmasterOptions}
        webmasterSnapshots={existing?.webmasterTasks ?? []}
        dualRole={dualRole}
        key={`${role}-${date}`}
        date={date}
        minDate={minDate}
        maxDate={today}
        metrics={metrics.map((m) => ({
          key: m.key,
          name: m.name,
          description: m.description,
          unit: m.unit,
          aggregation: m.aggregation,
          numeratorKey: m.numeratorKey,
          denominatorKey: m.denominatorKey,
          higherIsBetter: m.higherIsBetter,
          value: values.find((v) => v.metricId === m.id)?.value ?? null,
        }))}
        existing={
          existing
            ? {
                status: existing.status,
                summary: existing.summary,
                blockers: existing.blockers,
                planTomorrow: existing.planTomorrow,
                reviewNote: existing.reviewNote,
              }
            : null
        }
      />
    </>
  );
}
