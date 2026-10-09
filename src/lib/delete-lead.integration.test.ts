import assert from "node:assert/strict";
import { after, test } from "node:test";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { users, campaigns, orderForms, orderLeads, orderLeadEvents, orderFormCapi, metaCapiOutbox, dailyReports, advertiserReportItems, kpiMetrics, kpiEntries } from "@/db/schema";
import { DEFAULT_ORDER_FIELDS } from "./order-form-constants";
import { deleteLead } from "./delete-lead";
import { getFormLeadCounts } from "./form-lead-metrics";
import { openLeadWhatsApp } from "./lead-whatsapp";

after(async () => db.$client.end());
test("delete enforces ownership, removes history/outbox and recalculates final form lead to zero", async () => {
  const rollback = new Error("rollback fixture");
  await assert.rejects(db.transaction(async tx => {
    const tag = crypto.randomUUID();
    const [owner, other, cso] = await tx.insert(users).values([
      { name: "Owner", email: `delete-${tag}@example.invalid`, role: "advertiser", passwordHash: "unused" },
      { name: "Other", email: `other-delete-${tag}@example.invalid`, role: "advertiser", passwordHash: "unused" },
      { name: "CSO", email: `cso-delete-${tag}@example.invalid`, role: "cso", passwordHash: "unused" },
    ]).returning();
    const date = "2099-03-01";
    const [product] = await tx.insert(campaigns).values({ name: "Delete fixture", platform: "meta", ownerId: owner.id, formLeadSince: date }).returning();
    const [form] = await tx.insert(orderForms).values({ slug: tag.replaceAll("-", "").slice(0,24), ownerId: owner.id, campaignId: product.id, title: "Delete fixture", fields: DEFAULT_ORDER_FIELDS, message: "Halo" }).returning();
    const [lead] = await tx.insert(orderLeads).values({ publicId: tag, formId: form.id, ownerId: owner.id, campaignId: product.id, assigneeId: cso.id, csoPhone: "6281111111111", product: "Fixture", source: "ads", platform: "meta", date, createdAt: new Date(date+"T03:00:00Z"), phone: "6283333333333", requestHash: "a".repeat(64), contactHash: "b".repeat(64), whatsappUrl: "https://wa.me/6281111111111" }).returning();
    await tx.insert(orderLeadEvents).values({ leadId: lead.id, actorId: owner.id, detail: "{}" });
    await tx.insert(orderFormCapi).values({ formId: form.id, pixelId: "123456", token: "encrypted fixture", version: tag, enabled: true });
    await tx.insert(metaCapiOutbox).values({ formId: form.id, leadId: lead.id, eventId: tag, eventName: "Lead", pixelId: "123456", configVersion: tag, payload: "fixture" });
    const [report] = await tx.insert(dailyReports).values({ userId: owner.id, date, summary: "Fixture" }).returning();
    const [item] = await tx.insert(advertiserReportItems).values({ reportId: report.id, campaignId: product.id, performanceDate: date, window: "previous_day", platform: "meta", product: "Fixture", spent: 100, impressions: 20, clicks: 10, leads: 1, leadSource: "form", adsLeads: 7 }).returning();
    const [metric] = await tx.select().from(kpiMetrics).where(and(eq(kpiMetrics.role, "advertiser"),eq(kpiMetrics.key,"leads")));
    assert(metric);
    await tx.insert(kpiEntries).values({ reportId: report.id, userId: owner.id, metricId: metric.id, date, value: 1 });
    assert.equal((await getFormLeadCounts(date,date,[owner.id],tx))[0].leads,1);
    for(const actor of [other,cso]) await assert.rejects(deleteLead(tx,actor,lead.id), /pemilik|tidak ditemukan/);
    await assert.rejects(deleteLead(tx,owner,NaN), /pemilik/);
    await deleteLead(tx,owner,lead.id);
    assert.equal((await tx.select().from(orderLeads).where(eq(orderLeads.id,lead.id))).length,0);
    assert.equal((await tx.select().from(orderLeadEvents).where(eq(orderLeadEvents.leadId,lead.id))).length,0);
    assert.equal((await tx.select().from(metaCapiOutbox).where(eq(metaCapiOutbox.leadId,lead.id))).length,0);
    assert.equal((await tx.select().from(orderForms).where(eq(orderForms.id,form.id))).length,1);
    assert.equal((await tx.select().from(orderFormCapi).where(eq(orderFormCapi.formId,form.id))).length,1);
    assert.deepEqual(await getFormLeadCounts(date,date,[owner.id],tx),[]);
    const [updated]=await tx.select().from(advertiserReportItems).where(eq(advertiserReportItems.id,item.id));
    assert.equal(updated.leads,0);assert.equal(updated.adsLeads,7);assert.equal(updated.spent,100);
    assert.equal((await tx.select().from(kpiEntries).where(eq(kpiEntries.reportId,report.id)))[0].value,0);
    await assert.rejects(deleteLead(tx,owner,lead.id), /sudah dihapus/);
    await assert.rejects(openLeadWhatsApp(tx,cso,lead.id,1), /tidak ditemukan/);
    const [organic] = await tx.insert(orderLeads).values({ ...lead, id: undefined, publicId: crypto.randomUUID(), source: "organic", requestHash: "c".repeat(64), contactHash: "d".repeat(64) }).returning();
    await deleteLead(tx,{id:other.id,role:"supervisor"},organic.id);
    throw rollback;
  }), error => error === rollback);
});
