import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { advertiserReportItems, campaigns, dailyReports, kpiEntries } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getItemCampaigns, getMetrics } from "@/lib/data";
import { todayISO } from "@/lib/kpi";
import { advertiserReportWindows, isAdvertiserReportDay, latestAdvertiserReportDate } from "@/lib/reporting";
import { addDays } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/panel";
import { AdvertiserReportForm } from "./advertiser-report-form";
import { ReportForm } from "./report-form";

export const metadata: Metadata = { title: "Submit Report" };

export default async function NewReportPage({ searchParams }: { searchParams: Promise<{ date?: string; window?: string }> }) {
  const user = await requireUser();
  if (user.role === "supervisor") redirect("/reports");
  const today = todayISO();
  const minDate = addDays(today, -7);
  const { date: requested, window: requestedWindow } = await searchParams;
  const validRequested =
    requested &&
    /^\d{4}-\d{2}-\d{2}$/.test(requested) &&
    requested <= today &&
    requested >= minDate &&
    (user.role !== "advertiser" || isAdvertiserReportDay(requested));
  const date = validRequested ? requested : user.role === "advertiser" ? latestAdvertiserReportDate(today) : today;

  const [existing] = await db
    .select()
    .from(dailyReports)
    .where(and(eq(dailyReports.userId, user.id), eq(dailyReports.date, date)))
    .limit(1);


  if (user.role === "advertiser") {
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
    const itemCampaigns = await getItemCampaigns(existingItems.map((item) => item.id));
    const usedCampaignIds = new Set(existingItems.map((item) => item.campaignId));
    const campaignOptions = ownedCampaigns
      .filter((campaign) => campaign.status !== "ended" || usedCampaignIds.has(campaign.id))
      .map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        product: campaign.product?.trim() || campaign.name,
        platform: campaign.platform,
        status: campaign.status,
        linked:
          (campaign.platform === "meta" || campaign.platform === "google") &&
          campaign.adAccountId !== null &&
          Boolean(campaign.matchKeyword?.trim()),
      }));
    const periods = advertiserReportWindows(date);
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
            advertiserReportWindows(date).length > 2
              ? "Laporan Senin mencakup Jumat, Sabtu, Minggu (sehari penuh) dan Senin sampai 15.30 WIB."
              : "Pilih periode, generate dari Ads atau isi manual, lalu kirim sebelum 15.30 WIB."
          }
        />
        <AdvertiserReportForm
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
            campaigns: (itemCampaigns.get(item.id) ?? []).map((c) => ({
              id: c.externalId,
              name: c.name,
              spent: c.spent,
              impressions: c.impressions,
              clicks: c.clicks,
              leads: c.leads,
            })),
          }))}
        />
      </>
    );
  }

  const metrics = (await getMetrics()).filter((metric) => metric.role === user.role);
  const values = existing ? await db.select().from(kpiEntries).where(eq(kpiEntries.reportId, existing.id)) : [];

  return (
    <>
      <PageHeader
        title={existing ? "Edit Daily Report" : "Submit Daily Report"}
        description="Enter today's numbers and a short summary. Your KPI score updates as soon as you submit."
      />
      <ReportForm
        key={date}
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
