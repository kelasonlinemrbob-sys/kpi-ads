"use server";

import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { adAccounts, adCampaigns, users } from "@/db/schema";
import { fetchAccountCampaignList, fetchGoogleConversionActions } from "@/lib/ads-api";
import { listSharedGoogleAdAccounts } from "@/lib/google-connection";
import { checkMetaAdAccount, listSharedMetaAdAccounts } from "@/lib/meta-connection";
import { logActivity } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { canClaimAdAccount } from "@/lib/ad-account-ownership";
import { adsScopeFor } from "@/lib/ads-scope";
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
      : `Akun iklan ditambahkan, tapi ${check.missingToken ? "koneksi Meta Ads tim belum diisi supervisor sehingga data belum bisa ditarik" : check.error}`;
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
  // An advertiser refreshes the accounts their campaigns come from: the ones they picked and those holding their products.
  const scope = await adsScopeFor(user);
  const accounts = await db.select().from(adAccounts).where(scope ? inArray(adAccounts.id, [...scope.accountIds, 0]) : user.role === "supervisor" ? undefined : eq(adAccounts.createdById, user.id));
  if (!accounts.length) return { error: "Pilih akun iklan Anda terlebih dahulu di Pengaturan → Integrasi." };

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

/* ------------- Picking ad accounts from the team's connection ------------- */

export type AdAccountChoice = {
  accountId: string;
  name: string;
  currency: string | null;
  /** Meta account status label when it isn't active. */
  note: string | null;
  owner: { id: number; name: string; supervisor: boolean } | null;
  mine: boolean;
  /** Not registered, without an owner, or registered by a supervisor (an advertiser may take it over). */
  claimable: boolean;
};

const META_ACCOUNT_STATUS: Record<number, string> = { 2: "nonaktif", 3: "belum dibayar", 7: "ditinjau", 9: "masa tenggang", 100: "akan ditutup", 101: "ditutup" };
const platformSchema = z.enum(["meta", "google"]);

/** Accounts the team's connection can read. */
async function sharedAccounts(platform: "meta" | "google") {
  if (platform === "meta") {
    const res = await listSharedMetaAdAccounts();
    return res.ok ? { ok: true as const, accounts: res.data.map((a) => ({ accountId: a.accountId, name: a.name, currency: a.currency, note: META_ACCOUNT_STATUS[a.status] ?? null })) } : res;
  }
  const res = await listSharedGoogleAdAccounts();
  return res.ok ? { ok: true as const, accounts: res.data.map((a) => ({ ...a, note: null })) } : res;
}

/** The team connection's ad accounts with who runs each one, for Settings → Integrasi. */
export async function listAdAccountChoices(platform: "meta" | "google"): Promise<{ ok: true; choices: AdAccountChoice[] } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can.editCampaigns(user.role)) return { ok: false, error: "Kamu tidak punya akses mengelola akun iklan." };
  const parsed = platformSchema.safeParse(platform);
  if (!parsed.success) return { ok: false, error: "Platform tidak valid." };
  const listed = await sharedAccounts(parsed.data);
  if (!listed.ok) return listed;
  const ids = listed.accounts.map((a) => a.accountId);
  const registered = ids.length
    ? await db
        .select({ accountId: adAccounts.accountId, ownerId: adAccounts.createdById, ownerName: users.name, ownerRole: users.role })
        .from(adAccounts)
        .leftJoin(users, eq(users.id, adAccounts.createdById))
        .where(and(eq(adAccounts.platform, parsed.data), inArray(adAccounts.accountId, ids)))
    : [];
  const byId = new Map(registered.map((r) => [r.accountId, r]));
  const choices = listed.accounts.map((a): AdAccountChoice => {
    const r = byId.get(a.accountId);
    const owner = r?.ownerId ? { id: r.ownerId, name: r.ownerName ?? "–", supervisor: r.ownerRole === "supervisor" } : null;
    const mine = owner?.id === user.id;
    return { ...a, owner, mine, claimable: canClaimAdAccount(r?.ownerId ? { id: r.ownerId, role: r.ownerRole } : null, user) };
  });
  // Mine first, then free ones, then the rest — each alphabetically.
  const rank = (c: AdAccountChoice) => (c.mine ? 0 : c.claimable ? 1 : 2);
  choices.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return { ok: true, choices };
}

/** Registers an account of the team connection as the current user's, or takes over a free / supervisor's one. */
export async function claimAdAccount(platform: "meta" | "google", accountId: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can.editCampaigns(user.role)) return { ok: false, error: "Kamu tidak punya akses mengelola akun iklan." };
  const p = platformSchema.safeParse(platform);
  const id = String(accountId ?? "").replace(/\D/g, "");
  if (!p.success || id.length < 5 || id.length > 32) return { ok: false, error: "Akun iklan tidak valid." };
  // Only accounts the team connection really reads can be picked.
  const listed = await sharedAccounts(p.data);
  if (!listed.ok) return listed;
  const account = listed.accounts.find((a) => a.accountId === id);
  if (!account) return { ok: false, error: "Akun iklan ini tidak bisa diakses koneksi tim. Minta supervisor menambahkan aksesnya." };

  const [existing] = await db
    .select({ id: adAccounts.id, ownerId: adAccounts.createdById, ownerName: users.name, ownerRole: users.role })
    .from(adAccounts)
    .leftJoin(users, eq(users.id, adAccounts.createdById))
    .where(and(eq(adAccounts.platform, p.data), eq(adAccounts.accountId, id)))
    .limit(1);
  if (existing?.ownerId === user.id) return { ok: true, message: "Akun ini sudah menjadi akun Anda." };
  if (existing && !canClaimAdAccount(existing.ownerId ? { id: existing.ownerId, role: existing.ownerRole } : null, user)) {
    return { ok: false, error: `Akun ini sudah dipakai ${existing.ownerName ?? "anggota lain"}. Minta supervisor atau pemiliknya melepasnya dulu.` };
  }
  if (existing) {
    // Only take it over if the owner didn't change meanwhile.
    const owner = existing.ownerId === null ? sql`${adAccounts.createdById} is null` : eq(adAccounts.createdById, existing.ownerId);
    const updated = await db.update(adAccounts).set({ createdById: user.id, name: account.name.slice(0, 120) }).where(and(eq(adAccounts.id, existing.id), owner)).returning({ id: adAccounts.id });
    if (!updated.length) return { ok: false, error: "Akun ini baru saja dipilih anggota lain. Muat ulang daftar." };
  } else {
    const inserted = await db.insert(adAccounts).values({ platform: p.data, accountId: id, name: account.name.slice(0, 120), createdById: user.id }).onConflictDoNothing().returning({ id: adAccounts.id });
    if (!inserted.length) return { ok: false, error: "Akun ini baru saja dipilih anggota lain. Muat ulang daftar." };
  }
  await logActivity({
    actorId: user.id,
    subjectUserId: user.id,
    type: "campaign_updated",
    title: "Akun Iklan Dipilih",
    description: `${account.name} (${p.data === "meta" ? "Meta" : "Google"} ${id})${existing?.ownerName ? ` diambil alih dari ${existing.ownerName}` : ""}.`,
    href: "/campaigns",
  });
  revalidatePath("/settings");
  revalidatePath("/campaigns");
  return { ok: true, message: `${account.name} sekarang akun iklan Anda. Lanjutkan Sinkron dari Ads di Campaigns.` };
}

/** Gives up one's own account. It stays registered with its synced data, without an owner, so another advertiser can pick it. */
export async function releaseAdAccount(platform: "meta" | "google", accountId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can.editCampaigns(user.role)) return { ok: false, error: "Kamu tidak punya akses mengelola akun iklan." };
  const p = platformSchema.safeParse(platform);
  if (!p.success) return { ok: false, error: "Platform tidak valid." };
  const id = String(accountId ?? "").replace(/\D/g, "");
  const released = await db
    .update(adAccounts)
    .set({ createdById: null })
    .where(and(eq(adAccounts.platform, p.data), eq(adAccounts.accountId, id), eq(adAccounts.createdById, user.id)))
    .returning({ name: adAccounts.name });
  if (!released.length) return { ok: false, error: "Akun ini bukan milik Anda." };
  await logActivity({ actorId: user.id, subjectUserId: user.id, type: "campaign_updated", title: "Akun Iklan Dilepas", description: `${released[0]!.name} (${id}) dilepas.`, href: "/campaigns" });
  revalidatePath("/settings");
  revalidatePath("/campaigns");
  return { ok: true };
}
