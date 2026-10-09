"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { leadErrorMessage } from "@/lib/order-leads";
import { saveWaTemplates, openLeadWhatsApp, changeLeadStatus } from "@/lib/lead-whatsapp";

export async function saveWaTemplatesAction(campaignId: number, messages: unknown) {
  const actor = await requireRole("supervisor", "advertiser");
  try {
    await db.transaction(tx => saveWaTemplates(tx, actor, campaignId, messages));
    revalidatePath("/leads/templates");
    return { ok: true as const };
  } catch (error) { return { ok: false as const, error: leadErrorMessage(error) }; }
}
export async function openLeadWhatsAppAction(id: number, step: number) {
  const actor = await requireRole("supervisor", "advertiser", "cso");
  try {
    const result = await db.transaction(tx => openLeadWhatsApp(tx, actor, id, step));
    revalidatePath("/leads"); revalidatePath(`/leads/${id}`);
    return { ok: true as const, ...result };
  } catch (error) { return { ok: false as const, error: leadErrorMessage(error) }; }
}
export async function changeLeadStatusAction(id: number, status: string) {
  const actor = await requireRole("supervisor", "advertiser", "cso");
  try {
    await db.transaction(tx => changeLeadStatus(tx, actor, id, status));
    revalidatePath("/leads"); revalidatePath(`/leads/${id}`);
    return { ok: true as const };
  } catch (error) { return { ok: false as const, error: leadErrorMessage(error) }; }
}
