import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, leadWaTemplates, orderLeads, orderLeadEvents, users } from "@/db/schema";
import { LeadError, type LeadDb, updateOrderLead } from "./order-leads";
import { normalizePhone, LEAD_STATUSES } from "./order-form-input";
import { completeWaMessages, WA_STEPS, type WaStep, renderWaMessage, unknownWaVariables } from "./lead-wa-message";
import type { LeadActor } from "./lead-list";

const templateText = z.string().trim().min(1, "Isi semua template WA.").max(2000, "Maksimal 2.000 karakter per template.")
  .refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value), "Template mengandung karakter tidak valid.")
  .refine(value => unknownWaVariables(value).length === 0, "Gunakan variabel template yang tersedia.");
const messagesSchema = z.object({ 1: templateText, 2: templateText, 3: templateText, 4: templateText, 5: templateText });

export async function listWaTemplateProducts(actor: LeadActor, tx: Pick<LeadDb, "select"> = db) {
  if (!["supervisor", "advertiser", "cso"].includes(actor.role)) throw new LeadError("Tidak memiliki akses template WA.");
  const assigned = tx.select({ id: orderLeads.campaignId }).from(orderLeads).where(eq(orderLeads.assigneeId, actor.id));
  return tx.select({ id: campaigns.id, name: campaigns.name, product: campaigns.product, owner: users.name, status: campaigns.status })
    .from(campaigns).innerJoin(users, eq(users.id, campaigns.ownerId))
    .where(actor.role === "supervisor" ? undefined : actor.role === "cso" ? inArray(campaigns.id, assigned) : eq(campaigns.ownerId, actor.id))
    .orderBy(asc(campaigns.name));
}

export async function getWaTemplates(campaignId: number, tx: Pick<LeadDb, "select"> = db) {
  const [row] = await tx.select().from(leadWaTemplates).where(eq(leadWaTemplates.campaignId, campaignId));
  return completeWaMessages(row?.messages);
}

export async function saveWaTemplates(tx: LeadDb, actor: LeadActor, campaignId: number, input: unknown) {
  if (!["supervisor", "advertiser"].includes(actor.role) || !Number.isSafeInteger(campaignId) || campaignId <= 0) throw new LeadError("Tidak memiliki akses mengubah template WA.");
  const parsed = messagesSchema.safeParse(input);
  if (!parsed.success) throw new LeadError(parsed.error.issues[0].message);
  const [product] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).for("update");
  if (!product || (actor.role !== "supervisor" && product.ownerId !== actor.id)) throw new LeadError("Produk tidak ditemukan.");
  await tx.insert(leadWaTemplates).values({ campaignId, messages: parsed.data, updatedBy: actor.id })
    .onConflictDoUpdate({ target: leadWaTemplates.campaignId, set: { messages: parsed.data, updatedBy: actor.id, updatedAt: new Date() } });
}

async function ownedLead(tx: LeadDb, actor: LeadActor, id: number) {
  if (!["supervisor", "advertiser", "cso"].includes(actor.role) || !Number.isSafeInteger(id) || id <= 0) throw new LeadError("Tidak memiliki akses lead.");
  const [lead] = await tx.select().from(orderLeads).where(eq(orderLeads.id, id)).for("update");
  if (!lead || (actor.role === "advertiser" && lead.ownerId !== actor.id) || (actor.role === "cso" && lead.assigneeId !== actor.id)) throw new LeadError("Lead tidak ditemukan.");
  return lead;
}

export async function openLeadWhatsApp(tx: LeadDb, actor: LeadActor, id: number, step: number) {
  if (!WA_STEPS.includes(step as WaStep)) throw new LeadError("Pilih WA 1 sampai WA 5.");
  const lead = await ownedLead(tx, actor, id);
  if (!lead.phone) throw new LeadError("Nomor WhatsApp customer belum tersedia.");
  let phone: string;
  try { phone = normalizePhone(lead.phone); } catch { throw new LeadError("Nomor WhatsApp customer tidak valid."); }
  const messages = await getWaTemplates(lead.campaignId, tx);
  const [sender] = await tx.select({ name: users.name }).from(users).where(eq(users.id, actor.id));
  const text = renderWaMessage(messages[step as WaStep], {
    nama: lead.name, no_hp: phone, email: lead.email, kota: lead.city, produk: lead.product, cso: sender?.name ?? "Tim", referensi: lead.publicId,
  });
  const now = new Date();
  // Record only the explicit button click. Opening WhatsApp does not mean sent,
  // contacted or closing; status is a separate manual decision.
  await tx.update(orderLeads).set({ waOpenedAt: { ...lead.waOpenedAt, [step]: now.toISOString() }, updatedAt: now })
    .where(eq(orderLeads.id, lead.id));
  await tx.insert(orderLeadEvents).values({ leadId: lead.id, actorId: actor.id, detail: JSON.stringify({ kind: "whatsapp_opened", step }) });
  return { url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`, openedAt: now.toISOString() };
}

export async function changeLeadStatus(tx: LeadDb, actor: LeadActor, id: number, status: unknown) {
  const parsed = z.enum(LEAD_STATUSES).safeParse(status);
  if (!parsed.success) throw new LeadError("Status tidak valid.");
  const lead = await ownedLead(tx, actor, id);
  if (lead.status !== parsed.data) await updateOrderLead(tx, actor, id, parsed.data, lead.notes);
}
