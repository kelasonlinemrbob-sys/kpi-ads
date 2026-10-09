import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { db } from "@/db";
import { adAccounts, adCreatives, campaigns, creativeAdvertisers, creativeMetrics, creativeSyncs, users } from "@/db/schema";
import { adsScopeFor, visibleTo } from "./ads-scope";
import { creativePeriod } from "./creative-period";
import { contentVisibleTo, getCreativeRows, visibleCreativeIds } from "./creatives-data";

after(async () => db.$client.end());

test("visibility rule: own products anywhere, unmapped only in own accounts, never another advertiser's", () => {
  const scope = { ownerIds: new Set([1]), ownAccountIds: new Set([10]), accountIds: new Set([10, 20]) };
  assert.equal(visibleTo(scope, { adAccountId: 20, ownerId: 1 }), true, "own product in someone else's account");
  assert.equal(visibleTo(scope, { adAccountId: 10, ownerId: null }), true, "unmapped in own account");
  assert.equal(visibleTo(scope, { adAccountId: 20, ownerId: null }), false, "unmapped in someone else's account");
  assert.equal(visibleTo(scope, { adAccountId: 10, ownerId: 2 }), false, "another advertiser's product in own account");
  assert.equal(visibleTo(null, { adAccountId: 99, ownerId: 2 }), true, "supervisor sees everything");
});

test("Creative rows: each advertiser sees only their own contents; supervisors see all (rolled back)", async () => {
  const rollback = new Error("rollback");
  try {
    await db.transaction(async (tx) => {
      const mocks = [mock.method(db, "select", tx.select.bind(tx)), mock.method(db, "selectDistinct", tx.selectDistinct.bind(tx))];
      try {
        const email = (n: string) => `scope-${n}-${crypto.randomUUID()}@example.invalid`;
        const [a, b, sup, creativeA, creativeAll] = await tx.insert(users).values([
          { name: "Adv A", email: email("a"), passwordHash: "x", role: "advertiser" as const },
          { name: "Adv B", email: email("b"), passwordHash: "x", role: "advertiser" as const },
          { name: "Sup", email: email("s"), passwordHash: "x", role: "supervisor" as const },
          { name: "Creative A", email: email("ca"), passwordHash: "x", role: "creative" as const },
          { name: "Creative tim", email: email("ct"), passwordHash: "x", role: "creative" as const },
        ]).returning();
        await tx.insert(creativeAdvertisers).values({ creativeId: creativeA!.id, advertiserId: a!.id });
        // X is picked by A and also runs B's product; Y is picked by B and also runs one of A's products.
        const [x, y] = await tx.insert(adAccounts).values([
          { platform: "meta" as const, accountId: `9${Date.now()}1`, name: "Akun X", createdById: a!.id },
          { platform: "meta" as const, accountId: `9${Date.now()}2`, name: "Akun Y", createdById: b!.id },
        ]).returning();
        await tx.insert(campaigns).values([
          { name: "Produk A1", platform: "meta" as const, ownerId: a!.id, adAccountId: x!.id, matchKeyword: "ZZAAA" },
          { name: "Produk B1", platform: "meta" as const, ownerId: b!.id, adAccountId: x!.id, matchKeyword: "ZZBBB" },
          { name: "Produk A2", platform: "meta" as const, ownerId: a!.id, adAccountId: y!.id, matchKeyword: "ZZCCC" },
        ]);
        const period = creativePeriod("7d");
        const [sx, sy] = await tx.insert(creativeSyncs).values([
          { adAccountId: x!.id, periodStart: period.start, periodEnd: period.end, syncedAt: new Date() },
          { adAccountId: y!.id, periodStart: period.start, periodEnd: period.end, syncedAt: new Date() },
        ]).returning();
        const ads = [
          ["c1", x!, sx!, "[ZZAAA] Leads", "post-a1"],
          ["c2", x!, sx!, "[ZZBBB] Leads", "post-b1"],
          ["c3", x!, sx!, "Tanpa kode X", null],
          ["c4", y!, sy!, "[ZZCCC] Traffic", null],
          ["c5", y!, sy!, "Tanpa kode Y", null],
        ] as const;
        const ids: Record<string, number> = {};
        for (const [name, account, sync, campaign, postId] of ads) {
          const [c] = await tx.insert(adCreatives).values({ adAccountId: account.id, externalAdId: `${name}-${crypto.randomUUID().slice(0, 8)}`, adName: name, campaignName: campaign, postId, status: "active" }).returning();
          ids[name] = c!.id;
          await tx.insert(creativeMetrics).values({ syncId: sync.id, creativeId: c!.id, impressions: 100, reach: 80, videoViews: 0, thruplays: 0, spend: 1000, clicks: 5, leads: 1 });
        }
        const names = async (user: typeof a) => (await getCreativeRows({ period: "7d", scope: await adsScopeFor(user!) })).map((r) => r.adName).filter((n) => /^c\d$/.test(n)).sort();
        assert.deepEqual(await names(a), ["c1", "c3", "c4"]);
        assert.deepEqual(await names(b), ["c2", "c5"]);
        assert.deepEqual(await names(sup), ["c1", "c2", "c3", "c4", "c5"]);
        assert.deepEqual(await names(creativeA), ["c1", "c3", "c4"], "Creative linked to A sees what A sees");
        assert.deepEqual(await names(creativeAll), ["c1", "c2", "c3", "c4", "c5"], "unlinked Creative sees the whole team");
        await tx.insert(creativeAdvertisers).values({ creativeId: creativeA!.id, advertiserId: b!.id });
        assert.deepEqual(await names(creativeA), ["c1", "c2", "c3", "c4", "c5"], "linked to A and B");

        const scopeA = await adsScopeFor(a!);
        assert.deepEqual([...(await visibleCreativeIds(scopeA, [ids.c1!, ids.c2!, ids.c4!, ids.c5!]))].sort(), [ids.c1!, ids.c4!].sort());
        assert.equal(await contentVisibleTo(scopeA, "post-a1"), true);
        assert.equal(await contentVisibleTo(scopeA, "post-b1"), false, "B's content analysis stays hidden from A");
        assert.equal(await contentVisibleTo(scopeA, `ad-${ids.c5}`), false);
        assert.equal(await contentVisibleTo(await adsScopeFor(sup!), "post-b1"), true);
      } finally {
        mocks.forEach((m) => m.mock.restore());
      }
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});
