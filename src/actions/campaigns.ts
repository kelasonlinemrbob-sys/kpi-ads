"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { adAccounts, campaigns, orderForms, campaignStatusEnum, platformEnum, users } from "@/db/schema";
import { normalizeKeyword } from "@/lib/ads-matching";
import { requireUser } from "@/lib/auth";
import { parsePackageKeywords, REGISTRATION_SOURCES } from "@/lib/registration-mapping";
import { logActivity } from "@/lib/data";
import { can } from "@/lib/roles";
import type { FormState } from "./auth";

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal("").transform(() => undefined));

const campaignSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(3, "Campaign name is too short").max(160),
  platform: z.enum(platformEnum.enumValues),
  objective: z.string().trim().max(80).optional(),
  product: z.string().trim().max(120).optional(),
  dailyBudget: z.coerce.number().min(0, "Budget can't be negative"),
  landingPageUrl: z.url("Enter a valid URL").optional().or(z.literal("").transform(() => undefined)),
  status: z.enum(campaignStatusEnum.enumValues),
  ownerId: z.coerce.number().int().positive().optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  notes: z.string().trim().max(2000).optional(),
  adAccountId: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? Number(v) : null)),
  matchKeyword: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => (v ? normalizeKeyword(v) : null)),
  registrationPackages: z
    .string()
    .trim()
    .max(500, "Paket pendaftaran maksimal 500 karakter.")
    .optional()
    .transform((v) => (v ? parsePackageKeywords(v).join(", ") || null : null)),
  registrationSource: z.enum(REGISTRATION_SOURCES).optional().default("lkbi"),
});

async function loadEditable(id: number) {
  const user = await requireUser();
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!c) return { user, campaign: null };
  const allowed = user.role === "supervisor" || c.ownerId === user.id;
  return { user, campaign: allowed ? c : null };
}

export async function saveCampaign(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can.editCampaigns(user.role)) return { error: "You don't have access to manage campaigns." };
  const raw = Object.fromEntries([...formData.entries()].map(([k, v]) => [k, v === "" && k === "id" ? undefined : v]));
  const parsed = campaignSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, ownerId, ...data } = parsed.data;
  if (data.startDate && data.endDate && data.endDate < data.startDate) return { error: "End date must be after start date." };
  if (data.adAccountId) {
    const [account] = await db.select().from(adAccounts).where(eq(adAccounts.id, data.adAccountId)).limit(1);
    if (!account || (user.role !== "supervisor" && account.createdById !== user.id)) return { error: "Akun iklan tidak ditemukan." };
    if (account.platform !== data.platform) return { error: "Platform akun iklan tidak sama dengan platform campaign." };
    if (!data.matchKeyword) return { error: "Isi kode product agar campaign di akun iklan bisa dikenali." };
  }
  // advertisers always own what they create; supervisors can assign an owner
  const owner = user.role === "supervisor" && ownerId ? ownerId : user.id;

  const [ownerUser] = await db.select({ role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, owner)).limit(1);
  if (!ownerUser?.isActive || !can.runAds(ownerUser.role)) return { error: "Pemilik product harus advertiser atau supervisor aktif." };

  if (id) {
    const { campaign } = await loadEditable(id);
    if (!campaign) return { error: "Campaign not found." };
    const saved = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(campaigns).where(eq(campaigns.id,id)).for("update");
      if (!current || (user.role !== "supervisor" && current.ownerId !== user.id)) return {error:"Campaign not found."};
      const [form] = await tx.select({id:orderForms.id}).from(orderForms).where(eq(orderForms.campaignId,id)).limit(1);
      if (form && ((user.role === "supervisor" && owner !== current.ownerId) || data.platform !== current.platform)) return {error:"Produk memiliki form order. Pemilik dan platform tidak dapat diubah; buat produk baru."};
      await tx.update(campaigns).set({...data,ownerId:user.role === "supervisor" ? owner : current.ownerId,updatedAt:new Date()}).where(eq(campaigns.id,id));
      return {ok:true};
    });
    if (saved.error) return saved;
    if (campaign.status !== data.status) {
      await logActivity({
        actorId: user.id,
        subjectUserId: campaign.ownerId,
        type: "campaign_updated",
        title: `Campaign ${data.status === "active" ? "Activated" : data.status === "paused" ? "Paused" : data.status === "ended" ? "Ended" : "Updated"}`,
        description: data.name,
        href: "/campaigns",
      });
    }
  } else {
    await db.insert(campaigns).values({ ...data, ownerId: owner });
    await logActivity({
      actorId: user.id,
      subjectUserId: owner,
      type: "campaign_created",
      title: "New Campaign",
      description: `${data.name} (${data.platform})`,
      href: "/campaigns",
    });
  }
  revalidatePath("/campaigns");
  return { ok: true, message: id ? "Campaign updated" : "Campaign created" };
}

export async function setCampaignStatus(id: number, status: (typeof campaignStatusEnum.enumValues)[number]) {
  const { user, campaign } = await loadEditable(id);
  if (!campaign || !can.editCampaigns(user.role)) return { error: "Not allowed" };
  await db.update(campaigns).set({ status, updatedAt: new Date() }).where(eq(campaigns.id, id));
  await logActivity({
    actorId: user.id,
    subjectUserId: campaign.ownerId,
    type: "campaign_updated",
    title: `Campaign ${status === "active" ? "Activated" : status === "paused" ? "Paused" : status === "ended" ? "Ended" : "Moved to Draft"}`,
    description: campaign.name,
    href: "/campaigns",
  });
  revalidatePath("/campaigns");
  return { ok: true };
}

export async function deleteCampaign(id: number) {
  const { user, campaign } = await loadEditable(id);
  if (!campaign || !can.editCampaigns(user.role)) return { error: "Not allowed" };
  const [form] = await db.select({id:orderForms.id}).from(orderForms).where(eq(orderForms.campaignId,id)).limit(1);
  if (form) return {error:"Produk memiliki form order. Nonaktifkan produk untuk mempertahankan riwayat."};
  await db.delete(campaigns).where(eq(campaigns.id, id));
  revalidatePath("/campaigns");
  return { ok: true };
}

const quickProductSchema = z.object({
  product: z.string().trim().min(2, "Nama product minimal 2 karakter.").max(120),
  platform: z.enum(platformEnum.enumValues),
});

/** Creates an active product for the current advertiser straight from the report form. */
export async function createProductFromReport(input: { product: string; platform: string }) {
  const user = await requireUser();
  if (!can.runAds(user.role)) return { error: "Hanya advertiser yang dapat menambah product dari laporan." };
  const parsed = quickProductSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { product, platform } = parsed.data;

  const owned = await db.select().from(campaigns).where(eq(campaigns.ownerId, user.id));
  const duplicate = owned.find(
    (c) => c.platform === platform && (c.product?.trim() || c.name).toLowerCase() === product.toLowerCase(),
  );
  if (duplicate) return { error: "Product dengan nama dan platform ini sudah ada." };

  const [created] = await db
    .insert(campaigns)
    .values({ name: product, product, platform, status: "active", ownerId: user.id })
    .returning();
  await logActivity({
    actorId: user.id,
    subjectUserId: user.id,
    type: "campaign_created",
    title: "New Campaign",
    description: `${product} (${platform})`,
    href: "/campaigns",
  });
  revalidatePath("/campaigns");
  return {
    ok: true as const,
    campaign: {
      id: created!.id,
      name: created!.name,
      product: created!.product ?? created!.name,
      platform: created!.platform,
      status: created!.status,
      linked: false,
    },
  };
}
