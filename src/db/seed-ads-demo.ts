/*
 * Adds demo ad accounts, synced campaigns and generated report breakdowns on top of the regular seed,
 * so the Campaigns page and "Generate dari Ads" data can be explored without API credentials.
 * Additive and idempotent. Run with `--remove` to take everything it added out again.
 */
process.env.TZ = process.env.APP_TIMEZONE || "Asia/Jakarta";

import { and, eq, gte, inArray, like } from "drizzle-orm";
import { advertiserReportWindows } from "../lib/reporting";
import { db } from "./index";
import {
  adAccounts,
  adCampaigns,
  advertiserReportItemCampaigns,
  advertiserReportItems,
  campaigns,
  dailyReports,
  kpiEntries,
  kpiMetrics,
  users,
} from "./schema";

const DEMO_PREFIX = "demo-";

const ACCOUNTS = [
  { key: "meta", platform: "meta" as const, accountId: "900000000001", name: "Demo Meta — Skincare" },
  { key: "google", platform: "google" as const, accountId: "9000000002", name: "Demo Google — Store" },
];

/** Existing seed products (owner email + product name) and the code their platform campaigns carry. */
const PRODUCTS = [
  { email: "rizky@kpi.local", product: "Serum Brightening", keyword: "SERUM", account: "meta" },
  { email: "rizky@kpi.local", product: "Skincare Bundle", keyword: "SKBUNDLE", account: "meta" },
  { email: "dewi@kpi.local", product: "All Products", keyword: "BRAND", account: "google" },
  { email: "dewi@kpi.local", product: "Catalog", keyword: "CATALOG", account: "google" },
];

const AD_CAMPAIGNS = [
  { account: "meta", name: "[SERUM] Retargeting 30D Engagers", status: "active", budget: 350_000, objective: "OUTCOME_LEADS" },
  { account: "meta", name: "[SERUM] Prospecting Broad 25-44", status: "active", budget: 250_000, objective: "OUTCOME_LEADS" },
  { account: "meta", name: "[SKBUNDLE] Promo Gajian — Conversion", status: "active", budget: 750_000, objective: "OUTCOME_SALES" },
  { account: "meta", name: "[SKBUNDLE] Advantage+ Catalog", status: "paused", budget: 300_000, objective: "OUTCOME_SALES" },
  { account: "meta", name: "Brand Awareness Q3", status: "active", budget: 150_000, objective: "OUTCOME_AWARENESS" },
  { account: "google", name: "[BRAND] Search — Brand Keywords", status: "active", budget: 400_000, objective: "SEARCH" },
  { account: "google", name: "[CATALOG] Performance Max — Catalog", status: "active", budget: 600_000, objective: "PERFORMANCE_MAX" },
  { account: "google", name: "[CATALOG] Shopping — Top Sellers", status: "paused", budget: 200_000, objective: "SHOPPING" },
] as const;

const PLATFORM_STATUS = {
  meta: { active: "ACTIVE", paused: "CAMPAIGN_PAUSED" },
  google: { active: "ENABLED", paused: "PAUSED" },
} as const;

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
};

async function remove() {
  const accounts = await db.select().from(adAccounts).where(like(adAccounts.name, "Demo %"));
  const demoItems = await db
    .selectDistinct({ itemId: advertiserReportItemCampaigns.itemId })
    .from(advertiserReportItemCampaigns)
    .where(like(advertiserReportItemCampaigns.externalId, `${DEMO_PREFIX}%`));
  if (demoItems.length) {
    await db.delete(advertiserReportItems).where(inArray(advertiserReportItems.id, demoItems.map((i) => i.itemId)));
  }
  await db
    .update(campaigns)
    .set({ adAccountId: null, matchKeyword: null })
    .where(inArray(campaigns.matchKeyword, PRODUCTS.map((p) => p.keyword)));
  if (accounts.length) await db.delete(adAccounts).where(inArray(adAccounts.id, accounts.map((a) => a.id)));
  console.log(`Removed ${accounts.length} demo accounts and ${demoItems.length} demo report rows.`);
}

async function main() {
  if (process.argv.includes("--remove")) return remove();

  const today = iso(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthStart = iso(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 3));

  // 1. Ad accounts
  const accountIds = new Map<string, number>();
  for (const account of ACCOUNTS) {
    const [existing] = await db
      .select()
      .from(adAccounts)
      .where(and(eq(adAccounts.platform, account.platform), eq(adAccounts.accountId, account.accountId)));
    const row =
      existing ??
      (await db.insert(adAccounts).values({ platform: account.platform, accountId: account.accountId, name: account.name }).returning())[0]!;
    await db.update(adAccounts).set({ lastSyncedAt: new Date(), lastSyncError: null }).where(eq(adAccounts.id, row.id));
    accountIds.set(account.key, row.id);
  }

  // 2. Synced platform campaigns
  for (const [index, c] of AD_CAMPAIGNS.entries()) {
    const adAccountId = accountIds.get(c.account)!;
    await db
      .insert(adCampaigns)
      .values({
        adAccountId,
        externalId: `${DEMO_PREFIX}${c.account}-${index + 1}`,
        name: c.name,
        status: c.status,
        platformStatus: PLATFORM_STATUS[c.account][c.status],
        objective: c.objective,
        dailyBudget: c.budget,
        startDate: lastMonthStart,
      })
      .onConflictDoNothing();
  }

  // 3. Link the seed products to the accounts with their product code
  const productIds = new Map<string, { id: number; platform: "meta" | "google" }>();
  for (const p of PRODUCTS) {
    const [row] = await db
      .select({ id: campaigns.id, platform: campaigns.platform })
      .from(campaigns)
      .innerJoin(users, eq(users.id, campaigns.ownerId))
      .where(and(eq(users.email, p.email), eq(campaigns.product, p.product)));
    if (!row) {
      console.warn(`Skipping ${p.product}: product not found for ${p.email} (run pnpm db:seed first).`);
      continue;
    }
    await db
      .update(campaigns)
      .set({ adAccountId: accountIds.get(p.account)!, matchKeyword: p.keyword })
      .where(eq(campaigns.id, row.id));
    productIds.set(p.keyword, { id: row.id, platform: row.platform as "meta" | "google" });
  }

  // 4. Generated report rows (+ per-campaign breakdown) for every period of this month's reports
  //    that have none yet; the report's KPI entries are aligned with the full-day totals.
  const metrics = await db.select().from(kpiMetrics).where(inArray(kpiMetrics.key, ["ad_spend", "leads"]));
  let added = 0;
  for (const email of [...new Set(PRODUCTS.map((p) => p.email))]) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) continue;
    const reports = await db
      .select()
      .from(dailyReports)
      .where(and(eq(dailyReports.userId, user.id), gte(dailyReports.date, addDays(monthStart, 1))));
    for (const report of reports) {
      const [hasItems] = await db
        .select({ id: advertiserReportItems.id })
        .from(advertiserReportItems)
        .where(eq(advertiserReportItems.reportId, report.id))
        .limit(1);
      if (hasItems) continue;

      const fullDay = { spent: 0, leads: 0 };
      for (const period of advertiserReportWindows(report.date))
      for (const p of PRODUCTS.filter((x) => x.email === email)) {
        const product = productIds.get(p.keyword);
        if (!product) continue;
        const running = AD_CAMPAIGNS.map((c, i) => ({ ...c, externalId: `${DEMO_PREFIX}${c.account}-${i + 1}` })).filter(
          (c) => c.account === p.account && c.name.includes(`[${p.keyword}]`) && c.status === "active",
        );
        const breakdown = running.map((c) => {
          // The report-day period only runs until 15.30, so roughly 60% of a day's delivery.
          const share = period.key === "today_to_cutoff" ? 0.6 : 1;
          const spent = Math.round((c.budget * share * (0.75 + rand() * 0.3)) / 1000) * 1000;
          const impressions = Math.round(spent / (18 + rand() * 12));
          const clicks = Math.round(impressions * (0.012 + rand() * 0.02));
          const leads = Math.max(0, Math.round(spent / (32_000 + rand() * 30_000)));
          return { externalId: c.externalId, name: c.name, spent, impressions, clicks, leads };
        });
        const sum = (key: "spent" | "impressions" | "clicks" | "leads") => breakdown.reduce((t, b) => t + b[key], 0);
        const [item] = await db
          .insert(advertiserReportItems)
          .values({
            reportId: report.id,
            campaignId: product.id,
            window: period.key,
            performanceDate: period.performanceDate,
            platform: product.platform,
            product: p.product,
            spent: sum("spent"),
            impressions: sum("impressions"),
            clicks: sum("clicks"),
            leads: sum("leads"),
          })
          .returning();
        if (breakdown.length) {
          await db.insert(advertiserReportItemCampaigns).values(breakdown.map((b) => ({ itemId: item!.id, ...b })));
        }
        if (period.key === "previous_day") {
          fullDay.spent += sum("spent");
          fullDay.leads += sum("leads");
        }
        added++;
      }
      for (const metric of metrics) {
        await db
          .update(kpiEntries)
          .set({ value: metric.key === "ad_spend" ? fullDay.spent : fullDay.leads })
          .where(and(eq(kpiEntries.reportId, report.id), eq(kpiEntries.metricId, metric.id)));
      }
    }
  }

  console.log(`Demo ads data ready: ${AD_CAMPAIGNS.length} campaigns, ${added} report rows added.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
