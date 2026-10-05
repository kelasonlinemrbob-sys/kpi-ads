import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { adAccounts, adCreatives, creativeMetrics, creativeSyncs } from "@/db/schema";
import { saveCreativeSnapshot } from "./creative-sync";
import type { AdContent } from "./meta-creatives-api";
after(async () => { await db.$client.end(); });
const ad: AdContent = { adId: "1", adName: "Old creative still delivering", campaignId: "10", campaignName: "Test", objective: null, postId: null, permalink: null, thumbnailUrl: null, format: "video", status: "active", platformStatus: "ACTIVE", createdAt: "2020-01-01T00:00:00Z", impressions: 70, reach: 50, videoViews: 30, thruplays: 10, avgPlayTime: 4, spend: 70000, clicks: 7, leads: 1 };
test("period snapshots isolated; notes preserved; no false deletes; empty sync tracked; failure rolls back; older sync cannot overwrite", async () => {
  const rollback = new Error("ROLLBACK_TEST");
  try { await db.transaction(async (tx) => {
    const [account] = await tx.insert(adAccounts).values({ platform: "meta", name: "Creative fixture", accountId: String(Date.now()) }).returning();
    const time = (minute: number) => new Date(`2030-10-05T10:${String(minute).padStart(2,"0")}:00Z`);
    await saveCreativeSnapshot(account.id, "2030-09-29", "2030-10-05", [ad], time(1), tx);
    const [creative] = await tx.select().from(adCreatives).where(eq(adCreatives.adAccountId, account.id));
    await tx.update(adCreatives).set({ label: "winning", note: "Keep team notes", formatOverride: "grafis" }).where(eq(adCreatives.id, creative.id));
    await saveCreativeSnapshot(account.id, "2030-09-22", "2030-10-05", [{ ...ad, impressions: 140 }], time(2), tx);
    const rows = () => tx.select({ start: creativeSyncs.periodStart, metrics: creativeMetrics }).from(creativeMetrics).innerJoin(creativeSyncs, eq(creativeSyncs.id, creativeMetrics.syncId)).where(eq(creativeSyncs.adAccountId, account.id));
    let snapshots = await rows(); assert.equal(snapshots.length, 2);
    assert.equal(snapshots.find((s) => s.start === "2030-09-29")!.metrics.impressions, 70);
    assert.equal(snapshots.find((s) => s.start === "2030-09-22")!.metrics.impressions, 140);
    await assert.rejects(saveCreativeSnapshot(account.id, "2030-09-29", "2030-10-05", [{ ...ad, impressions: 1.5 }], time(3), tx));
    assert.equal((await rows()).find((s) => s.start === "2030-09-29")!.metrics.impressions, 70);
    await saveCreativeSnapshot(account.id, "2030-09-29", "2030-10-05", [], time(4), tx);
    assert.equal((await rows()).length, 1);
    const syncs = await tx.select().from(creativeSyncs).where(eq(creativeSyncs.adAccountId, account.id)); assert.equal(syncs.length, 2);
    assert.equal(await saveCreativeSnapshot(account.id, "2030-09-29", "2030-10-05", [ad], time(1), tx), false);
    const [saved] = await tx.select().from(adCreatives).where(eq(adCreatives.id, creative.id));
    assert.equal(saved.status, "active"); assert.equal(saved.label, "winning"); assert.equal(saved.note, "Keep team notes"); assert.equal(saved.formatOverride, "grafis");
    const nextDay = await tx.select().from(creativeSyncs).where(and(eq(creativeSyncs.adAccountId, account.id), eq(creativeSyncs.periodEnd, "2030-10-06"))); assert.equal(nextDay.length, 0);
    throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; }
});
