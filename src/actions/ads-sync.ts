"use server";
import { getFormLeadCounts } from "@/lib/form-lead-metrics";

import { and, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { adAccounts, campaigns } from "@/db/schema";
import { fetchAccountCampaigns, type AdsCampaignMetrics, type AdsMetrics } from "@/lib/ads-api";
import { sumLandingPageViews } from "@/lib/ads-lpv";
import { matchProduct } from "@/lib/ads-matching";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { todayISO } from "@/lib/kpi";
import { getReportRules } from "@/lib/report-rules";
import { PLATFORM_LABEL } from "@/lib/labels";
import { advertiserReportWindows } from "@/lib/reporting";
import { addDays } from "@/lib/utils";

export type GeneratedAdsReport =
  | {
      ok: true;
      performanceDate: string;
      /** One row per product the advertiser owns, summed over every matching platform campaign. */
      rows: ({ campaignId: number; platform: "meta" | "google"; campaigns: AdsCampaignMetrics[]; adsLeads?: number; leadSource?: string } & AdsMetrics)[];
      /** Campaigns with delivery that don't carry any product code, per account. */
      unmapped: { account: string; spent: number; campaigns: { name: string; spent: number }[] }[];
      errors: { account: string; error: string }[];
      warnings: { account: string; message: string }[];
    }
  | { ok: false; error: string };

const ZERO: AdsMetrics = { landingPageViews: null, spent: 0, impressions: 0, clicks: 0, leads: 0 };

/**
 * Pulls every campaign of the ad accounts the advertiser's products run in, then groups them
 * per product by the product code in the campaign name.
 */
export async function generateAdsReport(date: string, performanceDate: string): Promise<GeneratedAdsReport> {
  const user = await requireUser();
  if (!can.runAds(user.role)) return { ok: false, error: "Hanya advertiser yang dapat generate laporan iklan." };
  const today = todayISO();
  const { backfillDays, cutoff } = await getReportRules();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || date < addDays(today, -backfillDays)) {
    return { ok: false, error: "Tanggal laporan tidak valid." };
  }
  if (!advertiserReportWindows(date).some((period) => period.performanceDate === performanceDate)) {
    return { ok: false, error: "Periode laporan tidak valid." };
  }

  // Every linked product in the relevant accounts (any owner), so another advertiser's campaigns
  // in a shared account are recognised instead of being reported as unmapped.
  const linkedProducts = (
    await db
      .select()
      .from(campaigns)
      .where(
        and(
          inArray(campaigns.platform, ["meta", "google"]),
          isNotNull(campaigns.adAccountId),
          isNotNull(campaigns.matchKeyword),
          notInArray(campaigns.status, ["draft", "ended"]),
        ),
      )
  )
    .filter((product) => product.matchKeyword?.trim())
    .map((product) => ({ ...product, keyword: product.matchKeyword! }));
  const mine = linkedProducts.filter((product) => product.ownerId === user.id);
  if (!mine.length) {
    return {
      ok: false,
      error: "Belum ada product yang terhubung ke akun iklan. Isi akun iklan dan kode product di halaman Campaigns.",
    };
  }

  const accountIds = [...new Set(mine.map((product) => product.adAccountId!))];
  const accounts = await db.select().from(adAccounts).where(inArray(adAccounts.id, accountIds));

  const totals = new Map<number, AdsMetrics & { campaigns: AdsCampaignMetrics[] }>(
    mine.map((product) => [product.id, { ...ZERO, campaigns: [] }]),
  );
  const unmapped: Extract<GeneratedAdsReport, { ok: true }>["unmapped"] = [];
  const errors: Extract<GeneratedAdsReport, { ok: true }>["errors"] = [];
  const warnings: { account: string; message: string }[] = [];
  const failedAccounts = new Set<number>();

  await Promise.all(
    accounts.map(async (account) => {
      const label = `${account.name} (${PLATFORM_LABEL[account.platform]})`;
      if (account.platform !== "meta" && account.platform !== "google") return;
      const result = await fetchAccountCampaigns({ platform: account.platform, accountId: account.accountId, lpvConversionAction: account.lpvConversionAction }, performanceDate);
      if (!result.ok) {
        failedAccounts.add(account.id);
        errors.push({ account: label, error: result.error });
        return;
      }
      for (const message of result.warnings ?? []) warnings.push({ account: label, message });
      const products = linkedProducts.filter((product) => product.adAccountId === account.id);
      const orphans: { name: string; spent: number }[] = [];
      for (const campaign of result.campaigns) {
        const product = matchProduct(campaign.name, products);
        if (!product) {
          if (campaign.spent > 0 || campaign.impressions > 0) orphans.push({ name: campaign.name, spent: Math.round(campaign.spent) });
          continue;
        }
        const total = totals.get(product.id);
        if (!total) continue; // belongs to another advertiser
        // Round per campaign first so the product total always equals the sum of its saved breakdown.
        const rounded = { ...campaign, spent: Math.round(campaign.spent), leads: Math.round(campaign.leads) };
        total.spent += rounded.spent;
        total.impressions += rounded.impressions;
        total.clicks += rounded.clicks;
        total.leads += rounded.leads;
        total.campaigns.push(rounded);
      }
      for (const product of products) {
        const total = totals.get(product.id);
        if (total) total.landingPageViews = sumLandingPageViews(total.campaigns, result.lpvAvailable ? 0 : null);
      }
      if (orphans.length) {
        unmapped.push({ account: label, spent: orphans.reduce((sum, c) => sum + c.spent, 0), campaigns: orphans });
      }
    }),
  );

  const formCounts = await getFormLeadCounts(performanceDate,performanceDate,[user.id],db,{date,cutoff});
  return {
    ok: true,
    performanceDate,
    rows: mine
      .filter((product) => !failedAccounts.has(product.adAccountId!))
      .map((product) => {
        const total = totals.get(product.id)!;
        return {
          campaignId: product.id,
          platform: product.platform as "meta" | "google",
          campaigns: total.campaigns.sort((a, b) => b.spent - a.spent),
          spent: total.spent,
          impressions: total.impressions,
          clicks: total.clicks,
          adsLeads: total.leads,
          leadSource: product.formLeadSince && performanceDate >= product.formLeadSince ? "form" : "ads",
          leads: product.formLeadSince && performanceDate >= product.formLeadSince ? formCounts.find(r=>r.campaignId===product.id)?.leads??0 : total.leads,
          landingPageViews: total.landingPageViews,
        };
      }),
    unmapped,
    errors,
    warnings,
  };
}
