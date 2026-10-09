import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { orderForms, orderFormDomains, orderFormCapi, metaCapiOutbox } from "@/db/schema";
import { LeadError, type LeadDb } from "./order-leads";

type Actor = { id: number; role: string };

async function ownedForm(tx: LeadDb, actor: Actor, id: number) {
  if (!["supervisor", "advertiser"].includes(actor.role) || !Number.isSafeInteger(id) || id <= 0) {
    throw new LeadError("Tidak memiliki akses mengelola form.");
  }
  const [form] = await tx.select().from(orderForms).where(eq(orderForms.id, id)).for("update");
  if (!form || (actor.role !== "supervisor" && form.ownerId !== actor.id)) throw new LeadError("Form tidak ditemukan.");
  return form;
}

export async function duplicateOrderForm(tx: LeadDb, actor: Actor, id: number) {
  const form = await ownedForm(tx, actor, id);
  if (form.deletedAt) throw new LeadError("Form sudah dihapus.");
  // Copy configuration explicitly; history, routing counters and domains belong
  // to the original form. The copy always starts unpublished with a new URL.
  const [copy] = await tx.insert(orderForms).values({
    slug: randomBytes(12).toString("hex"), ownerId: form.ownerId, campaignId: form.campaignId,
    title: `${form.title.slice(0, 110)} (salinan)`, description: form.description,
    fields: form.fields, appearance: form.appearance, tracking: form.tracking,
    routing: form.routing, assigneeIds: form.assigneeIds, weights: form.weights,
    source: form.source, message: form.message, published: false,
  }).returning();
  const [capi] = await tx.select().from(orderFormCapi).where(eq(orderFormCapi.formId, id)).for("update");
  if (capi) await tx.insert(orderFormCapi).values({
    formId: copy.id, pixelId: capi.pixelId, token: capi.token,
    enabled: capi.enabled, version: randomUUID(),
  });
  return copy;
}

export async function deleteOrderForm(tx: LeadDb, actor: Actor, id: number) {
  const form = await ownedForm(tx, actor, id);
  if (form.deletedAt) return form; // A repeated confirmed request is harmless.
  const now = new Date();
  const [deleted] = await tx.update(orderForms).set({ deletedAt: now, published: false, updatedAt: now })
    .where(eq(orderForms.id, id)).returning();
  // Retain the form row so lead history and KPI attribution remain intact.
  await tx.update(orderFormDomains).set({ status: "removing", error: null, updatedAt: now })
    .where(eq(orderFormDomains.formId, id));
  // Same lock order as CAPI configuration/worker: config before outbox.
  await tx.update(orderFormCapi).set({ enabled: false, version: randomUUID(), updatedAt: now })
    .where(eq(orderFormCapi.formId, id));
  await tx.update(metaCapiOutbox).set({ status: "cancelled", payload: "", lastError: "Form dihapus." })
    .where(and(eq(metaCapiOutbox.formId, id), inArray(metaCapiOutbox.status, ["pending", "failed"])));
  return deleted;
}
