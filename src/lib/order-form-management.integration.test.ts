import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, orderForms, orderFormDomains, orderFormCapi, orderLeads, metaCapiOutbox, users } from "@/db/schema";
import { duplicateOrderForm, deleteOrderForm } from "./order-form-management";
import { createFormChallenge, saveOrderForm, submitOrderLead } from "./order-leads";
import { activeDomainForSlug, connectFormDomain } from "./form-domains";
import { getFormLeadCounts } from "./form-lead-metrics";
import { saveCapiConfig } from "./meta-capi";
import { encryptSecret } from "./secret-box";
import { DEFAULT_ORDER_FIELDS } from "./order-form-constants";
import { jakartaDate } from "./sheets-report";

after(async () => db.$client.end());

test("duplicate isolates configuration/history; delete preserves KPI, revokes domain and blocks stale writes", async () => {
  const rollback = new Error("rollback fixture");
  await assert.rejects(db.transaction(async tx => {
    const suffix = crypto.randomUUID();
    const [owner, other, cso] = await tx.insert(users).values([
      { name: "Form owner", email: `forms-${suffix}@example.invalid`, role: "advertiser", passwordHash: "unused" },
      { name: "Other owner", email: `other-forms-${suffix}@example.invalid`, role: "advertiser", passwordHash: "unused" },
      { name: "Form CSO", email: `cso-forms-${suffix}@example.invalid`, role: "cso", passwordHash: "unused", csoPhone: "6281234567890" },
    ]).returning();
    const actor = { id: owner.id, role: "advertiser" };
    const date = jakartaDate();
    const [product] = await tx.insert(campaigns).values({ name: "Management fixture", platform: "meta", ownerId: owner.id, formLeadSince: date }).returning();
    const input = { campaignId: product.id, title: "A".repeat(120), description: "Description", fields: DEFAULT_ORDER_FIELDS, routing: "weighted", assigneeIds: [cso.id], weights: { [cso.id]: 100 }, published: true, source: "ads", message: "Halo {{nama}}", useFormLeads: true, effectiveDate: date };
    const form = await saveOrderForm(tx, actor, input);
    const [capi] = await tx.insert(orderFormCapi).values({ formId: form.id, pixelId: "123456789", token: encryptSecret("test-token-only"), enabled: true, version: crypto.randomUUID(), testSucceeded: true, testedAt: new Date() }).returning();
    const host = `form-${suffix}.example.com`;
    await tx.insert(orderFormDomains).values({ formId: form.id, hostname: host, verificationToken: "b".repeat(48), status: "active" });
    const token = createFormChallenge(form.slug);
    const raw = { name: "QA customer", phone: "081234567890", trackingConsent: true };
    await submitOrderLead(tx, form.slug, token, raw);
    const counts = await getFormLeadCounts(date, date, [owner.id], tx);
    assert.equal(counts[0].leads, 1);
    const leads = await tx.select().from(orderLeads).where(eq(orderLeads.formId, form.id));

    for (const bad of [{ id: other.id, role: "advertiser" }, { id: owner.id, role: "cso" }]) {
      await assert.rejects(duplicateOrderForm(tx, bad, form.id), /akses|tidak ditemukan/);
      await assert.rejects(deleteOrderForm(tx, bad, form.id), /akses|tidak ditemukan/);
    }
    await assert.rejects(deleteOrderForm(tx, actor, NaN), /akses/);
    const copy = await duplicateOrderForm(tx, actor, form.id);
    assert.notEqual(copy.id, form.id);
    assert.notEqual(copy.slug, form.slug);
    assert.equal(copy.title.length, 120);
    assert.match(copy.title, / \(salinan\)$/);
    assert.equal(copy.published, false);
    assert.equal(copy.deletedAt, null);
    assert.equal(copy.cursor, 0);
    assert.deepEqual(copy.routingCredits, {});
    for (const key of ["ownerId", "campaignId", "description", "fields", "appearance", "tracking", "routing", "assigneeIds", "weights", "message", "source"] as const) assert.deepEqual(copy[key], form[key], key);
    assert.equal((await tx.select().from(orderLeads).where(eq(orderLeads.formId, copy.id))).length, 0);
    assert.equal((await tx.select().from(orderFormDomains).where(eq(orderFormDomains.formId, copy.id))).length, 0);
    assert.equal((await tx.select().from(metaCapiOutbox).where(eq(metaCapiOutbox.formId, copy.id))).length, 0);
    const [copiedCapi] = await tx.select().from(orderFormCapi).where(eq(orderFormCapi.formId, copy.id));
    assert.equal(copiedCapi.token, capi.token);
    assert.notEqual(copiedCapi.version, capi.version);
    assert.equal(copiedCapi.testSucceeded, null);
    assert.equal(await activeDomainForSlug(host, form.slug, tx), true);
    await assert.rejects(submitOrderLead(tx, copy.slug, createFormChallenge(copy.slug), raw), /tidak menerima/);

    const deleted = await deleteOrderForm(tx, actor, form.id);
    assert(deleted.deletedAt);
    assert.equal(deleted.published, false);
    assert.equal((await tx.select().from(orderForms).where(and(eq(orderForms.id, form.id), isNull(orderForms.deletedAt)))).length, 0);
    assert.equal(await activeDomainForSlug(host, form.slug, tx), false);
    const [domain] = await tx.select().from(orderFormDomains).where(eq(orderFormDomains.formId, form.id));
    assert.equal(domain.status, "removing");
    assert.deepEqual(await tx.select().from(orderLeads).where(eq(orderLeads.formId, form.id)), leads);
    assert.deepEqual(await getFormLeadCounts(date, date, [owner.id], tx), counts);
    assert.deepEqual((await tx.select().from(campaigns).where(eq(campaigns.id, product.id)))[0], product);
    const [event] = await tx.select().from(metaCapiOutbox).where(eq(metaCapiOutbox.formId, form.id));
    assert.equal(event.status, "cancelled");
    assert.equal(event.payload, "");
    assert.equal((await tx.select().from(orderFormCapi).where(eq(orderFormCapi.formId, form.id)))[0].enabled, false);
    await assert.rejects(submitOrderLead(tx, form.slug, token, raw), /tidak tersedia/);
    await assert.rejects(saveOrderForm(tx, actor, { ...input, id: form.id }), /tidak ditemukan/);
    await assert.rejects(duplicateOrderForm(tx, actor, form.id), /sudah dihapus/);
    await assert.rejects(connectFormDomain(tx, actor, form.id, host), /tidak ditemukan/);
    await assert.rejects(saveCapiConfig(tx, actor, form.id, { enabled: true, pixelId: "123456789", token: "" }), /akses/);
    assert.deepEqual((await deleteOrderForm(tx, actor, form.id)).deletedAt, deleted.deletedAt);
    const supervisorCopy = await duplicateOrderForm(tx, { id: other.id, role: "supervisor" }, copy.id);
    assert.equal(supervisorCopy.ownerId, owner.id);
    await deleteOrderForm(tx, { id: other.id, role: "supervisor" }, supervisorCopy.id);
    throw rollback;
  }), error => error === rollback);
});
