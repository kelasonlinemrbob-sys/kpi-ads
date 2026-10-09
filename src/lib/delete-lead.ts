import "server-only";
import { eq } from "drizzle-orm";
import { campaigns, orderForms, orderFormCapi, orderLeads } from "@/db/schema";
import { LeadError, syncFormLeadItems, type LeadDb } from "./order-leads";

/** Run inside a transaction. Match submission/config lock order before deletion. */
export async function deleteLead(tx: LeadDb, actor: { id: number; role: string }, id: number) {
  if (!["supervisor", "advertiser"].includes(actor.role) || !Number.isSafeInteger(id) || id <= 0) {
    throw new LeadError("Hanya advertiser pemilik atau supervisor yang dapat menghapus lead.");
  }
  const [initial] = await tx.select().from(orderLeads).where(eq(orderLeads.id, id));
  if (!initial || (actor.role !== "supervisor" && initial.ownerId !== actor.id)) throw new LeadError("Lead tidak ditemukan atau sudah dihapus.");
  await tx.select({ id: orderForms.id }).from(orderForms).where(eq(orderForms.id, initial.formId)).for("update");
  await tx.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, initial.campaignId)).for("update");
  // Wait for in-flight CAPI delivery before cascading its outbox records.
  await tx.select({ id: orderFormCapi.formId }).from(orderFormCapi).where(eq(orderFormCapi.formId, initial.formId)).for("update");
  const [lead] = await tx.select().from(orderLeads).where(eq(orderLeads.id, id)).for("update");
  if (!lead || (actor.role !== "supervisor" && lead.ownerId !== actor.id)) throw new LeadError("Lead tidak ditemukan atau sudah dihapus.");
  await tx.delete(orderLeads).where(eq(orderLeads.id, id));
  // History/outbox cascade via existing foreign keys. Imported reports remain
  // immutable; app reports using form leads are recalculated, including zero.
  if (lead.source === "ads") await syncFormLeadItems(tx, lead.campaignId, lead.date);
}
