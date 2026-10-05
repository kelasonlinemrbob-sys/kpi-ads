"use server";

import { and, eq, lt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { adAccounts, adCampaigns } from "@/db/schema";
import { fetchAccountCampaignList, fetchGoogleConversionActions } from "@/lib/ads-api";
import { checkMetaAdAccount } from "@/lib/meta-connection";
import { logActivity } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { validGoogleConversionResource } from "@/lib/ads-lpv";
import { can } from "@/lib/roles";
import type { FormState } from "./auth";

const adAccountSchema = z.object({
  platform: z.enum(["meta", "google"]),
  name: z.string().trim().min(2, "Nama akun terlalu pendek.").max(120),
  accountId: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().min(5, "ID akun tidak valid.").max(32)),
});

export async function saveAdAccount(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can.editCampaigns(user.role)) return { error: "Kamu tidak punya akses mengelola akun iklan." };
  const parsed = adAccountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const [existing] = await db
    .select({ id: adAccounts.id })
    .from(adAccounts)
    .where(and(eq(adAccounts.platform, parsed.data.platform), eq(adAccounts.accountId, parsed.data.accountId)))
    .limit(1);
  if (existing) return { error: "Akun iklan ini sudah terdaftar." };

  // Make sure the Meta token can actually read the account, so a wrong ID or a missing
  // System User assignment shows up now instead of on the first "Generate dari Ads".
  let message = "Akun iklan ditambahkan";
  if (parsed.data.platform === "meta") {
    const check = await checkMetaAdAccount(parsed.data.accountId);
    if (!check.ok && !check.missingToken && !check.network) return { error: check.error };
    message = check.ok
      ? `Akun iklan ditambahkan dan terhubung ke Meta (${check.name})`
      : `Akun iklan ditambahkan, tapi ${check.missingToken ? "token Meta belum diisi sehingga data belum bisa ditarik" : check.error}`;
  }

  await db.insert(adAccounts).values({ ...parsed.data, createdById: user.id });
  revalidatePath("/campaigns");
  return { ok: true, message };
}

export async function deleteAdAccount(id: number) {
  const user = await requireUser();
  const [account] = await db.select().from(adAccounts).where(eq(adAccounts.id, id)).limit(1);
  if (!account || !(user.role === "supervisor" || account.createdById === user.id)) return { error: "Not allowed" };
  // Linked products keep working manually; their ad_account_id is set to null by the FK.
  await db.delete(adAccounts).where(eq(adAccounts.id, id));
  revalidatePath("/campaigns");
  return { ok: true };
}

/** Refreshes the campaign list of every Meta / Google ad account from the platform APIs. */
export async function syncAdCampaigns() {
  const user = await requireUser();
  if (!can.editCampaigns(user.role)) return { error: "Kamu tidak punya akses sinkron campaign." };
  const accounts = await db.select().from(adAccounts);
  if (!accounts.length) return { error: "Tambahkan akun iklan terlebih dahulu." };

  const results = await Promise.all(
    accounts.map(async (account) => {
      if (account.platform !== "meta" && account.platform !== "google") return { account, count: 0, error: null };
      const startedAt = new Date();
      const result = await fetchAccountCampaignList({ platform: account.platform, accountId: account.accountId });
      if (!result.ok) {
        await db.update(adAccounts).set({ lastSyncError: result.error }).where(eq(adAccounts.id, account.id));
        return { account, count: 0, error: result.error };
      }
      if (result.campaigns.length) {
        await db
          .insert(adCampaigns)
          .values(
            result.campaigns.map((c) => ({
              adAccountId: account.id,
              externalId: c.id,
              name: c.name,
              status: c.status,
              platformStatus: c.platformStatus,
              objective: c.objective,
              dailyBudget: c.dailyBudget,
              startDate: c.startDate,
              endDate: c.endDate,
              syncedAt: startedAt,
            })),
          )
          .onConflictDoUpdate({
            target: [adCampaigns.adAccountId, adCampaigns.externalId],
            set: {
              name: sql`excluded.name`,
              status: sql`excluded.status`,
              platformStatus: sql`excluded.platform_status`,
              objective: sql`excluded.objective`,
              dailyBudget: sql`excluded.daily_budget`,
              startDate: sql`excluded.start_date`,
              endDate: sql`excluded.end_date`,
              syncedAt: sql`excluded.synced_at`,
            },
          });
      }
      // Campaigns no longer returned by the platform were deleted/removed there.
      await db
        .update(adCampaigns)
        .set({ status: "ended", platformStatus: "REMOVED" })
        .where(and(eq(adCampaigns.adAccountId, account.id), lt(adCampaigns.syncedAt, startedAt)));
      await db.update(adAccounts).set({ lastSyncedAt: startedAt, lastSyncError: null }).where(eq(adAccounts.id, account.id));
      return { account, count: result.campaigns.length, error: null };
    }),
  );

  const synced = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);
  if (synced.length) {
    await logActivity({
      actorId: user.id,
      subjectUserId: user.id,
      type: "campaign_updated",
      title: "Campaign Disinkron",
      description: `${synced.reduce((sum, r) => sum + r.count, 0)} campaign dari ${synced.length} akun iklan`,
      href: "/campaigns",
    });
  }
  revalidatePath("/campaigns");
  return {
    ok: true,
    synced: synced.reduce((sum, r) => sum + r.count, 0),
    failed: failed.map((r) => ({ account: r.account.name, error: r.error! })),
  };
}


async function editableGoogleAccount(id: number) {
  const user = await requireUser();
  if (!can.editCampaigns(user.role)) return null;
  const [account] = await db.select().from(adAccounts).where(eq(adAccounts.id, id)).limit(1);
  return account?.platform === "google" && (user.role === "supervisor" || account.createdById === user.id) ? account : null;
}

export async function getLpvConversionOptions(id: number) {
  const account = await editableGoogleAccount(id);
  if (!account) return { ok: false as const, error: "Tidak punya akses mengatur akun ini." };
  return fetchGoogleConversionActions(account.accountId);
}

export async function saveLpvConversion(id: number, resource: string) {
  const account = await editableGoogleAccount(id);
  if (!account) return { error: "Tidak punya akses mengatur akun ini." };
  if (resource) {
    if (!validGoogleConversionResource(resource)) return { error: "Konversi LPV tidak valid." };
    const options = await fetchGoogleConversionActions(account.accountId);
    if (!options.ok) return { error: options.error };
    if (!options.actions.some((a) => a.resourceName === resource)) return { error: "Konversi tidak aktif atau bukan milik akun ini." };
  }
  await db.update(adAccounts).set({ lpvConversionAction: resource || null }).where(eq(adAccounts.id, id));
  revalidatePath("/campaigns");
  revalidatePath("/reports/new");
  return { ok: true };
}
