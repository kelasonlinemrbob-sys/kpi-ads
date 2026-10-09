import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { adAccounts, adCampaigns, campaigns, users, type Role } from "@/db/schema";
import { matchProduct } from "./ads-matching";
import { adsScopeFor, visibleTo } from "./ads-scope";

/**
 * Ad campaigns (Campaigns → Campaign Ads) with their account and product, keeping only those this user
 * may see: the same rule as the table, so opening a level or analysing a campaign never reaches another
 * advertiser's data. Unknown or hidden ids are left out.
 */
export async function loadVisibleAdCampaigns(user: { id: number; role: Role }, adCampaignIds: number[]) {
  const ids = [...new Set(adCampaignIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return [];
  const rows = await db
    .select({ campaign: adCampaigns, account: adAccounts })
    .from(adCampaigns)
    .innerJoin(adAccounts, eq(adAccounts.id, adCampaigns.adAccountId))
    .where(inArray(adCampaigns.id, ids));
  const accountIds = [...new Set(rows.map((r) => r.account.id))];
  const [linked, scope] = await Promise.all([
    accountIds.length
      ? db.select({ campaign: campaigns, ownerName: users.name }).from(campaigns).innerJoin(users, eq(users.id, campaigns.ownerId))
          .where(and(inArray(campaigns.adAccountId, accountIds), isNotNull(campaigns.matchKeyword)))
      : [],
    adsScopeFor(user),
  ]);
  return rows.flatMap((row) => {
    if (row.account.platform !== "meta" && row.account.platform !== "google") return [];
    const products = linked.filter((p) => p.campaign.adAccountId === row.account.id && p.campaign.matchKeyword?.trim()).map((p) => ({ ...p, keyword: p.campaign.matchKeyword! }));
    const product = matchProduct(row.campaign.name, products);
    if (!visibleTo(scope, { adAccountId: row.account.id, ownerId: product?.campaign.ownerId ?? null })) return [];
    return [{
      campaign: row.campaign,
      account: { ...row.account, platform: row.account.platform as "meta" | "google" },
      product: product
        ? { id: product.campaign.id, name: product.campaign.product?.trim() || product.campaign.name, ownerId: product.campaign.ownerId, ownerName: product.ownerName, registrationPackages: product.campaign.registrationPackages }
        : null,
    }];
  });
}

export async function loadVisibleAdCampaign(user: { id: number; role: Role }, adCampaignId: number) {
  return (await loadVisibleAdCampaigns(user, [adCampaignId]))[0] ?? null;
}
export type VisibleAdCampaign = NonNullable<Awaited<ReturnType<typeof loadVisibleAdCampaign>>>;
