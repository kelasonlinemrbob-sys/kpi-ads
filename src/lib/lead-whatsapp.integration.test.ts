import assert from "node:assert/strict";
import { after, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, orderForms, orderLeads, orderLeadEvents, users } from "@/db/schema";
import { DEFAULT_ORDER_FIELDS } from "./order-form-constants";
import { saveWaTemplates, getWaTemplates, listWaTemplateProducts, openLeadWhatsApp, changeLeadStatus } from "./lead-whatsapp";
import { DEFAULT_WA_MESSAGES } from "./lead-wa-message";
import { getFormLeadCounts } from "./form-lead-metrics";
import { updateOrderLead } from "./order-leads";

after(async () => db.$client.end());

test("WA templates are product-scoped; customer redirects, access, click history and statuses never alter revenue/KPI", async () => {
  const rollback = new Error("rollback fixture");
  await assert.rejects(db.transaction(async tx => {
    const suffix = crypto.randomUUID();
    const [owner, other, cso, secondCso, boss] = await tx.insert(users).values([
      { name: "Advertiser", email: `wa-owner-${suffix}@example.invalid`, role: "advertiser", passwordHash: "unused" },
      { name: "Other advertiser", email: `wa-other-${suffix}@example.invalid`, role: "advertiser", passwordHash: "unused" },
      { name: "Echa CSO", email: `wa-cso-${suffix}@example.invalid`, role: "cso", csoPhone: "6281111111111", passwordHash: "unused" },
      { name: "Other CSO", email: `wa-cso2-${suffix}@example.invalid`, role: "cso", csoPhone: "6282222222222", passwordHash: "unused" },
      { name: "Supervisor", email: `wa-boss-${suffix}@example.invalid`, role: "supervisor", passwordHash: "unused" },
    ]).returning();
    const date = "2099-02-01";
    const [product, second] = await tx.insert(campaigns).values([
      { name: "WA fixture", product: "Online class", platform: "meta", ownerId: owner.id, formLeadSince: date },
      { name: "Other fixture", platform: "meta", ownerId: other.id },
    ]).returning();
    const [form] = await tx.insert(orderForms).values({ slug: suffix.replaceAll("-", "").slice(0, 24), campaignId: product.id, ownerId: owner.id, title: "WA fixture", fields: DEFAULT_ORDER_FIELDS, message: "Halo" }).returning();
    const [lead] = await tx.insert(orderLeads).values({ publicId: crypto.randomUUID(), formId: form.id, ownerId: owner.id, campaignId: product.id, assigneeId: cso.id, csoPhone: "6281111111111", product: "Online class", source: "ads", platform: "meta", name: "Bernad & + 😊", phone: "6283333333333", city: "Kediri", date, requestHash: "a".repeat(64), contactHash: "b".repeat(64), whatsappUrl: "https://wa.me/6281111111111", notes: "Keep these notes", revenue: 980000, paymentStatus: "paid" }).returning();
    const beforeCounts = await getFormLeadCounts(date, date, [owner.id], tx);
    assert.equal(beforeCounts[0].leads, 1);
    assert.deepEqual(await getWaTemplates(product.id, tx), DEFAULT_WA_MESSAGES);
    const messages = { ...DEFAULT_WA_MESSAGES, 1: "Halo {{nama}}, saya {{cso}} untuk {{produk}}.", 2: "WA2\n{{nama}} & {{kota}}", 3: "WA3 {{no_hp}} {{email}} {{referensi}}" };
    // A persisted three-step set must work before anyone edits it after upgrade.
    const legacy = { 1: messages[1], 2: messages[2], 3: messages[3] };
    await tx.execute(sql`insert into lead_wa_templates (campaign_id,messages,updated_by) values (${product.id},${JSON.stringify(legacy)}::jsonb,${owner.id})`);
    assert.deepEqual(await getWaTemplates(product.id, tx), messages);
    await saveWaTemplates(tx, owner, product.id, { ...messages, 4: "WA4 {{nama}}", 5: "WA5 {{produk}}" });
    messages[4] = "WA4 {{nama}}"; messages[5] = "WA5 {{produk}}";
    assert.deepEqual(await getWaTemplates(product.id, tx), messages);
    assert.deepEqual(await getWaTemplates(second.id, tx), DEFAULT_WA_MESSAGES);
    for (const unauthorized of [other, cso]) await assert.rejects(saveWaTemplates(tx, unauthorized, product.id, messages), /akses|tidak ditemukan/);
    for (const invalid of [{ ...messages, 1: "" }, { ...messages, 2: "x".repeat(2001) }, { ...messages, 3: "{{unknown}}" }]) await assert.rejects(saveWaTemplates(tx, owner, product.id, invalid));
    const productsForCso = await listWaTemplateProducts(cso, tx);
    assert(productsForCso.some(p => p.id === product.id));
    assert(!productsForCso.some(p => p.id === second.id));
    assert(!(await listWaTemplateProducts(other, tx)).some(p => p.id === product.id));
    for (const unauthorized of [other, secondCso, { ...owner, role: "creative" }]) {
      await assert.rejects(openLeadWhatsApp(tx, unauthorized, lead.id, 1), /akses|tidak ditemukan/);
      await assert.rejects(changeLeadStatus(tx, unauthorized, lead.id, "won"), /akses|tidak ditemukan/);
    }
    for (const step of [0, 6, NaN, 1.5]) await assert.rejects(openLeadWhatsApp(tx, cso, lead.id, step));
    const first = await openLeadWhatsApp(tx, cso, lead.id, 1);
    const url = new URL(first.url);
    assert.equal(url.origin, "https://wa.me");
    assert.equal(url.pathname, "/6283333333333", "opens CUSTOMER, never the CSO number");
    assert.equal(url.searchParams.get("text"), "Halo Bernad & + 😊, saya Echa CSO untuk Online class.");
    await openLeadWhatsApp(tx, cso, lead.id, 3);
    let [current] = await tx.select().from(orderLeads).where(eq(orderLeads.id, lead.id));
    assert.deepEqual(Object.keys(current.waOpenedAt).sort(), ["1", "3"], "out-of-order clicks do not mark WA2");
    assert.equal(current.status, "new");
    await changeLeadStatus(tx, cso, lead.id, "won");
    await openLeadWhatsApp(tx, owner, lead.id, 2);
    [current] = await tx.select().from(orderLeads).where(eq(orderLeads.id, lead.id));
    assert.equal(current.status, "won", "WA click never resets closing status");
    assert.equal(current.notes, lead.notes);
    assert.equal(current.revenue, lead.revenue);
    assert.equal(current.paymentStatus, lead.paymentStatus);
    assert.deepEqual(await getFormLeadCounts(date, date, [owner.id], tx), beforeCounts);
    for (const step of [4, 5]) {
      const result = new URL((await openLeadWhatsApp(tx, cso, lead.id, step)).url);
      assert.equal(result.pathname, "/6283333333333");
      assert.equal(result.searchParams.get("text"), step === 4 ? "WA4 Bernad & + 😊" : "WA5 Online class");
    }
    [current] = await tx.select().from(orderLeads).where(eq(orderLeads.id, lead.id));
    assert.deepEqual(Object.keys(current.waOpenedAt).sort(), ["1", "2", "3", "4", "5"]);
    await changeLeadStatus(tx, boss, lead.id, "lost");
    await assert.rejects(changeLeadStatus(tx, owner, lead.id, "invalid"), /Status/);
    const events = await tx.select().from(orderLeadEvents).where(eq(orderLeadEvents.leadId, lead.id));
    assert.equal(events.filter(e => JSON.parse(e.detail).kind === "whatsapp_opened").length, 5);
    await updateOrderLead(tx, owner, lead.id, "lost", lead.notes, secondCso.id);
    await assert.rejects(openLeadWhatsApp(tx, cso, lead.id, 1), /tidak ditemukan/);
    const reassigned = new URL((await openLeadWhatsApp(tx, secondCso, lead.id, 1)).url);
    assert(reassigned.searchParams.get("text")!.includes("Other CSO"));
    await tx.update(orderLeads).set({ phone: null }).where(eq(orderLeads.id, lead.id));
    await assert.rejects(openLeadWhatsApp(tx, secondCso, lead.id, 1), /belum tersedia/);
    await tx.update(orderLeads).set({ phone: "https://bad.test" }).where(eq(orderLeads.id, lead.id));
    await assert.rejects(openLeadWhatsApp(tx, secondCso, lead.id, 1), /tidak valid/);
    throw rollback;
  }), error => error === rollback);
});
