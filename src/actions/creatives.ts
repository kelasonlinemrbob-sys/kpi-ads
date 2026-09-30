"use server";

import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { adAccounts, adCreatives, creativeFormatEnum, creativeLabelEnum, users } from "@/db/schema";
import { fetchMetaAdContents } from "@/lib/ads-api";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data";
import { can } from "@/lib/roles";

/** Pulls every ad (with its post and lifetime numbers) of every Meta ad account into ad_creatives. */
export async function syncCreatives() {
  const user = await requireUser();
  if (!can.viewCreatives(user.role)) return { ok: false as const, error: "Kamu tidak punya akses ke halaman Creative." };
  const accounts = await db.select().from(adAccounts).where(eq(adAccounts.platform, "meta"));
  if (!accounts.length) return { ok: false as const, error: "Belum ada akun Meta. Tambahkan di Campaigns → Akun iklan." };

  const results = await Promise.all(
    accounts.map(async (account) => {
      const startedAt = new Date();
      const res = await fetchMetaAdContents(account.accountId);
      if (!res.ok) return { account: account.name, count: 0, error: res.error };
      if (res.ads.length) {
        for (let i = 0; i < res.ads.length; i += 200) {
          const chunk = res.ads.slice(i, i + 200);
          await db
            .insert(adCreatives)
            .values(
              chunk.map((ad) => ({
                adAccountId: account.id,
                externalAdId: ad.adId,
                adName: ad.adName.slice(0, 255),
                campaignExternalId: ad.campaignId,
                campaignName: ad.campaignName?.slice(0, 255) ?? null,
                objective: ad.objective,
                postId: ad.postId,
                permalink: ad.permalink,
                thumbnailUrl: ad.thumbnailUrl,
                format: ad.format,
                status: ad.status,
                platformStatus: ad.platformStatus,
                impressions: ad.impressions,
                reach: ad.reach,
                videoViews: ad.videoViews,
                thruplays: ad.thruplays,
                avgPlayTime: ad.avgPlayTime,
                spend: ad.spend,
                clicks: ad.clicks,
                leads: ad.leads,
                adCreatedAt: ad.createdAt ? new Date(ad.createdAt) : null,
                syncedAt: startedAt,
              })),
            )
            // Platform fields only: label, format override, creator, editor and note stay as the team set them.
            .onConflictDoUpdate({
              target: [adCreatives.adAccountId, adCreatives.externalAdId],
              set: {
                adName: sql`excluded.ad_name`,
                campaignExternalId: sql`excluded.campaign_external_id`,
                campaignName: sql`excluded.campaign_name`,
                objective: sql`excluded.objective`,
                postId: sql`excluded.post_id`,
                permalink: sql`excluded.permalink`,
                thumbnailUrl: sql`excluded.thumbnail_url`,
                format: sql`excluded.format`,
                status: sql`excluded.status`,
                platformStatus: sql`excluded.platform_status`,
                impressions: sql`excluded.impressions`,
                reach: sql`excluded.reach`,
                videoViews: sql`excluded.video_views`,
                thruplays: sql`excluded.thruplays`,
                avgPlayTime: sql`excluded.avg_play_time`,
                spend: sql`excluded.spend`,
                clicks: sql`excluded.clicks`,
                leads: sql`excluded.leads`,
                adCreatedAt: sql`excluded.ad_created_at`,
                syncedAt: sql`excluded.synced_at`,
              },
            });
        }
      }
      // Ads Meta no longer returns were deleted there.
      await db
        .update(adCreatives)
        .set({ status: "takedown", platformStatus: "DELETED" })
        .where(and(eq(adCreatives.adAccountId, account.id), lt(adCreatives.syncedAt, startedAt)));
      return { account: account.name, count: res.ads.length, error: null };
    }),
  );

  const synced = results.filter((r) => !r.error);
  if (synced.length) {
    await logActivity({
      actorId: user.id,
      subjectUserId: user.id,
      type: "campaign_updated",
      title: "Konten Iklan Disinkron",
      description: `${synced.reduce((sum, r) => sum + r.count, 0)} iklan dari ${synced.length} akun Meta`,
      href: "/creatives",
    });
  }
  revalidatePath("/creatives");
  return {
    ok: true as const,
    synced: synced.reduce((sum, r) => sum + r.count, 0),
    failed: results.filter((r) => r.error).map((r) => ({ account: r.account, error: r.error! })),
  };
}

const patchSchema = z.object({
  label: z.enum(creativeLabelEnum.enumValues).nullable().optional(),
  formatOverride: z.enum(creativeFormatEnum.enumValues).nullable().optional(),
  creatorId: z.number().int().positive().nullable().optional(),
  editorId: z.number().int().positive().nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

/** Saves the team's fields of one ad: Keterangan, format, creator, editor, note. */
export async function updateCreative(id: number, patch: z.infer<typeof patchSchema>) {
  return updateCreatives([id], patch);
}

/** Same, for every ad that runs one content (post). */
export async function updateCreatives(ids: number[], patch: z.infer<typeof patchSchema>) {
  const user = await requireUser();
  if (!can.viewCreatives(user.role)) return { error: "Kamu tidak punya akses ke halaman Creative." };
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const people = [parsed.data.creatorId, parsed.data.editorId].filter((v): v is number => typeof v === "number");
  if (people.length) {
    const found = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, people), eq(users.isActive, true)));
    if (found.length !== new Set(people).size) return { error: "Creator / editor tidak ditemukan." };
  }
  if (!ids.length || ids.length > 500 || !ids.every((id) => Number.isInteger(id) && id > 0)) return { error: "Konten tidak valid." };
  const updated = await db.update(adCreatives).set(parsed.data).where(inArray(adCreatives.id, ids)).returning({ id: adCreatives.id });
  if (!updated.length) return { error: "Konten tidak ditemukan." };
  revalidatePath("/creatives");
  return { ok: true };
}
