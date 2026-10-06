"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { adAccounts, adCreatives, creativeFormatEnum, creativeLabelEnum, users } from "@/db/schema";
import { creativePeriod, CREATIVE_PERIODS } from "@/lib/creative-period";
import { saveCreativeSnapshot } from "@/lib/creative-sync";
import { fetchMetaAdContents } from "@/lib/ads-api";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data";
import { can } from "@/lib/roles";

/** Sync only ads with insights in the selected reporting window, preserving team annotations. */
export async function syncCreatives(periodKey: string = "7d") {
  const user = await requireUser();
  if (!can.viewCreatives(user.role)) return { ok: false as const, error: "Kamu tidak punya akses ke halaman Creative." };
  if (!CREATIVE_PERIODS.some((p) => p.value === periodKey)) return { ok: false as const, error: "Pilih periode 7, 14, atau 30 hari." };
  const period = creativePeriod(periodKey);
  const accounts = await db.select().from(adAccounts).where(and(eq(adAccounts.platform, "meta"), user.role === "advertiser" ? eq(adAccounts.createdById, user.id) : undefined));
  if (!accounts.length) return { ok: false as const, error: "Belum ada akun Meta. Tambahkan di Campaigns → Akun iklan." };
  const results: { account: string; count: number; error: string | null }[] = [];
  // Account requests are sequential to avoid bursts against the same Meta token.
  for (const account of accounts) {
    const startedAt = new Date();
    try {
      const res = await fetchMetaAdContents(account.accountId, period.start, period.end, account.createdById);
      if (!res.ok) { results.push({ account: account.name, count: 0, error: res.error }); continue; }
      await saveCreativeSnapshot(account.id, period.start, period.end, res.ads, startedAt);
      results.push({ account: account.name, count: res.ads.length, error: null });
    } catch {
      results.push({ account: account.name, count: 0, error: "Sinkronisasi gagal. Data periode sebelumnya tetap tersimpan; coba lagi." });
    }
  }
  const synced = results.filter((r) => !r.error);
  if (synced.length) await logActivity({ actorId: user.id, subjectUserId: user.id, type: "campaign_updated", title: "Konten Iklan Disinkron",
    description: `${synced.reduce((sum, r) => sum + r.count, 0)} iklan dari ${synced.length} akun Meta, ${period.start}–${period.end}`,
    href: `/creatives?period=${period.key}` });
  revalidatePath("/creatives");
  return { ok: true as const, period: period.label, synced: synced.reduce((sum, r) => sum + r.count, 0),
    failed: results.filter((r) => r.error).map((r) => ({ account: r.account, error: r.error! })) };
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
