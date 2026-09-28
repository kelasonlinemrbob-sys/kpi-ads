"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, campaignStatusEnum, platformEnum } from "@/db/schema";
import { requireUser } from "@/lib/auth";
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
  // advertisers always own what they create; supervisors can assign an owner
  const owner = user.role === "supervisor" && ownerId ? ownerId : user.id;

  if (id) {
    const { campaign } = await loadEditable(id);
    if (!campaign) return { error: "Campaign not found." };
    await db
      .update(campaigns)
      .set({ ...data, ownerId: user.role === "supervisor" ? owner : campaign.ownerId, updatedAt: new Date() })
      .where(eq(campaigns.id, id));
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
  await db.delete(campaigns).where(eq(campaigns.id, id));
  revalidatePath("/campaigns");
  return { ok: true };
}
