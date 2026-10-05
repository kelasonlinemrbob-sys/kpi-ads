import "server-only";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { adCreatives, creativeMetrics, creativeSyncs } from "@/db/schema";
import type { AdContent } from "./meta-creatives-api";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Replace a complete account/window atomically. Manual fields and other windows are preserved. */
export async function saveCreativeSnapshot(accountId: number, start: string, end: string, ads: AdContent[], startedAt: Date, database: typeof db | Transaction = db) {
  return database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(20261006, ${accountId})`);
    const condition = and(eq(creativeSyncs.adAccountId, accountId), eq(creativeSyncs.periodStart, start), eq(creativeSyncs.periodEnd, end));
    const [previous] = await tx.select().from(creativeSyncs).where(condition);
    if (previous && previous.syncedAt > startedAt) return false; // A newer sync already finished.
    const [snapshot] = await tx.insert(creativeSyncs).values({ adAccountId: accountId, periodStart: start, periodEnd: end, syncedAt: startedAt })
      .onConflictDoUpdate({ target: [creativeSyncs.adAccountId, creativeSyncs.periodStart, creativeSyncs.periodEnd], set: { syncedAt: startedAt } }).returning();
    await tx.delete(creativeMetrics).where(eq(creativeMetrics.syncId, snapshot.id));
    for (let i = 0; i < ads.length; i += 100) {
      const chunk = ads.slice(i, i + 100);
      await tx.insert(adCreatives).values(chunk.map((ad) => ({
        adAccountId: accountId, externalAdId: ad.adId, adName: ad.adName.slice(0, 255), campaignExternalId: ad.campaignId,
        campaignName: ad.campaignName?.slice(0, 255) ?? null, objective: ad.objective, postId: ad.postId, permalink: ad.permalink,
        thumbnailUrl: ad.thumbnailUrl, format: ad.format, status: ad.status, platformStatus: ad.platformStatus,
        adCreatedAt: ad.createdAt ? new Date(ad.createdAt) : null, syncedAt: startedAt,
      }))).onConflictDoUpdate({ target: [adCreatives.adAccountId, adCreatives.externalAdId], setWhere: lte(adCreatives.syncedAt, startedAt), set: {
        adName: sql`excluded.ad_name`, campaignExternalId: sql`excluded.campaign_external_id`, campaignName: sql`excluded.campaign_name`,
        objective: sql`excluded.objective`, postId: sql`excluded.post_id`, permalink: sql`excluded.permalink`, thumbnailUrl: sql`excluded.thumbnail_url`,
        format: sql`excluded.format`, status: sql`excluded.status`, platformStatus: sql`excluded.platform_status`, adCreatedAt: sql`excluded.ad_created_at`, syncedAt: sql`excluded.synced_at`,
      } });
      const rows = await tx.select({ id: adCreatives.id, externalId: adCreatives.externalAdId }).from(adCreatives)
        .where(and(eq(adCreatives.adAccountId, accountId), inArray(adCreatives.externalAdId, chunk.map((a) => a.adId))));
      const ids = new Map(rows.map((r) => [r.externalId, r.id]));
      await tx.insert(creativeMetrics).values(chunk.map((ad) => ({ syncId: snapshot.id, creativeId: ids.get(ad.adId)!,
        impressions: ad.impressions, reach: ad.reach, videoViews: ad.videoViews, thruplays: ad.thruplays, avgPlayTime: ad.avgPlayTime,
        spend: ad.spend, clicks: ad.clicks, leads: ad.leads,
      })));
    }
    // An ad absent from a limited reporting window is NOT necessarily deleted or paused on Meta.
    return true;
  });
}
