import assert from "node:assert/strict";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, orderForms, orderFormDomains, users } from "@/db/schema";
import { activeDomainForSlug, allowedFormOrigin, connectFormDomain, getFormDomain, removeFormDomain } from "./form-domains";
import { DEFAULT_ORDER_FIELDS } from "./order-form-constants";

after(async () => db.$client.end());

test("domain ownership, uniqueness, activation, form isolation, revocation and original origin", async () => {
  const oldUrl = process.env.APP_URL, oldIp = process.env.FORM_DOMAIN_TARGET_IP;
  process.env.APP_URL = "https://ads.lkbimrbob.com";
  process.env.FORM_DOMAIN_TARGET_IP = "69.161.221.215";
  const rollback = new Error("rollback fixture");
  try {
    await assert.rejects(db.transaction(async tx => {
      const suffix = crypto.randomUUID();
      const [owner, other] = await tx.insert(users).values([
        { name: "Domain owner", email: `domain-${suffix}@example.invalid`, role: "advertiser", passwordHash: "unused" },
        { name: "Other owner", email: `other-domain-${suffix}@example.invalid`, role: "advertiser", passwordHash: "unused" },
      ]).returning();
      const actor = { id: owner.id, role: "advertiser" };
      const [product] = await tx.insert(campaigns).values({ name: "Domain fixture", platform: "meta", ownerId: owner.id }).returning();
      const [form, second] = await tx.insert(orderForms).values(["a", "b"].map(prefix => ({
        slug: prefix + crypto.randomUUID().replaceAll("-", "").slice(0, 23), ownerId: owner.id, campaignId: product.id,
        title: "Domain fixture", message: "Halo", fields: DEFAULT_ORDER_FIELDS,
      }))).returning();
      const host = `daftar-${suffix}.example.com`;
      await assert.rejects(connectFormDomain(tx, { id: other.id, role: "advertiser" }, form.id, host), /tidak ditemukan/);
      await assert.rejects(connectFormDomain(tx, { id: owner.id, role: "cso" }, form.id, host), /akses/);
      const saved = await connectFormDomain(tx, actor, form.id, host);
      assert.equal(saved.status, "pending_dns");
      assert.match(saved.verificationToken, /^[a-f0-9]{48}$/);
      assert.equal((await connectFormDomain(tx, actor, form.id, host)).verificationToken, saved.verificationToken);
      await assert.rejects(connectFormDomain(tx, actor, second.id, host), /form lain/);
      await assert.rejects(connectFormDomain(tx, actor, form.id, "other.example.com"), /Lepas/);
      assert.equal(await allowedFormOrigin(`https://${host}`, host, form.slug, tx), false);
      assert.equal(await allowedFormOrigin("https://ads.lkbimrbob.com", "ads.lkbimrbob.com", form.slug, tx), true);
      assert.equal(await allowedFormOrigin("https://ads.lkbimrbob.com", host, form.slug, tx), false);
      await tx.update(orderFormDomains).set({ status: "active" }).where(eq(orderFormDomains.id, saved.id));
      assert.equal(await activeDomainForSlug(host, form.slug, tx), true);
      assert.equal(await allowedFormOrigin(`https://${host}`, host, form.slug, tx), true);
      assert.equal(await allowedFormOrigin(`https://${host}`, host, second.slug, tx), false);
      assert.equal(await allowedFormOrigin(`http://${host}`, host, form.slug, tx), false);
      await assert.rejects(removeFormDomain(tx, { id: other.id, role: "advertiser" }, form.id), /tidak ditemukan/);
      await removeFormDomain(tx, actor, form.id);
      assert.equal((await getFormDomain(form.id, tx))?.status, "removing");
      assert.equal(await activeDomainForSlug(host, form.slug, tx), false);
      assert.equal(await allowedFormOrigin(`https://${host}`, host, form.slug, tx), false);
      await assert.rejects(connectFormDomain(tx, actor, form.id, host), /Lepas/);
      throw rollback;
    }), error => error === rollback);
  } finally {
    if (oldUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = oldUrl;
    if (oldIp === undefined) delete process.env.FORM_DOMAIN_TARGET_IP; else process.env.FORM_DOMAIN_TARGET_IP = oldIp;
  }
});
