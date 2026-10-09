import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { adAccounts, appSettings, campaigns, externalRegistrations, kpiMetrics, users } from "@/db/schema";
import { encryptSecret } from "./secret-box";

after(async () => db.$client.end());

const payment = (id: number, status: string, approvedAt: string | null) => ({ id, status, approvedAt, createdAt: "2026-09-30T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" });
const reg = (id: number, paket: string, total: number, payments: object[], extra: object = {}) => ({
  id, registrationId: `REG-${id}`, namaLengkap: `Pendaftar ${id}`, paketProgram: paket, periodeProgram: null, status: payments.length ? "paid" : "pending",
  totalPrice: total, sumberInfo: "Iklan Instagram", kotaKabupaten: "Kediri", email: "x@y.z", nomorHP: "812", createdAt: "2026-10-01T00:00:00Z", changedAt: "2026-10-05T00:00:00Z", payments, ...extra,
});

test("sync, Closing/Revenue per product owner on the WIB payment date, KPIs and ROAS (rolled back)", async () => {
  const rollback = new Error("rollback");
  const original = global.fetch;
  const calls: string[] = [];
  let round = 1;
  global.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer mrbob_testkey_abcdefghijklmnopqrstuvwxyz");
    calls.push(url.pathname.split("/").pop() + url.search);
    const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { "content-type": "application/json" } });
    if (url.pathname.endsWith("/deleted-registrations")) return json({ data: round === 2 ? [{ id: 903, registrationId: "REG-903", deletedAt: "2026-10-06T00:00:00Z" }] : [], nextCursor: "d1", hasMore: false });
    const cursor = url.searchParams.get("cursor");
    if (round === 1 && !cursor) return json({ data: [
      reg(901, "HOLIDAY Paket 1 Minggu", 1_500_000, [payment(1, "verified", "2026-10-04T18:30:00Z")]), // 5 Oct 01:30 WIB
      reg(902, "IELTS 1 Bulan (CAMP)", 4_000_000, [payment(2, "verified", "2026-10-05T03:00:00Z")]),
    ], nextCursor: "c1", hasMore: true });
    if (round === 1 && cursor === "c1") return json({ data: [
      reg(903, "PAKET 1 BULAN 5-UP", 3_000_000, [payment(3, "verified", "2026-10-05T04:00:00Z")]),
      reg(904, "PAKET 2 MINGGU 5-UP", 2_000_000, [payment(4, "verified", "2026-09-28T04:00:00Z")]), // before the effective date
      reg(905, "Paket REGULER 1 BULAN", 999, []), // unpaid
    ], nextCursor: "c2", hasMore: false });
    // Round 2 continues from the stored cursor: 902's payment was rejected.
    assert.equal(cursor, "c2");
    return json({ data: [reg(902, "IELTS 1 Bulan (CAMP)", 4_000_000, [payment(2, "rejected", null)])], nextCursor: "c3", hasMore: false });
  };
  try {
    await db.transaction(async (tx) => {
      const mocks = [mock.method(db, "select", tx.select.bind(tx)), mock.method(db, "insert", tx.insert.bind(tx)), mock.method(db, "update", tx.update.bind(tx)), mock.method(db, "delete", tx.delete.bind(tx))];
      try {
        await tx.delete(appSettings).where(sql`${appSettings.key} like 'registrations.%' or ${appSettings.key} like 'shared.registrations.%'`);
        await tx.update(campaigns).set({ registrationPackages: null });
        await tx.insert(appSettings).values([{ key: "shared.registrations.api_key", value: encryptSecret("mrbob_testkey_abcdefghijklmnopqrstuvwxyz") }, { key: "shared.registrations.effective_from", value: "2026-10-01" }]);
        const email = (n: string) => `reg-${n}-${crypto.randomUUID()}@example.invalid`;
        const [khabib, ryant] = await tx.insert(users).values([
          { name: "Khabib T", email: email("k"), passwordHash: "x", role: "advertiser" as const },
          { name: "Ryant T", email: email("r"), passwordHash: "x", role: "advertiser" as const },
        ]).returning();
        const [acc] = await tx.insert(adAccounts).values({ platform: "meta" as const, accountId: `8${Date.now()}`, name: "Akun T", createdById: ryant!.id }).returning();
        const [holiday, academia, reguler] = await tx.insert(campaigns).values([
          { name: "HOLIDAY", platform: "meta" as const, ownerId: khabib!.id, registrationPackages: "HOLIDAY" },
          { name: "MrbobAcademia", platform: "meta" as const, ownerId: khabib!.id, registrationPackages: "IELTS, TOEFL" },
          { name: "LKBI REGULER", platform: "meta" as const, ownerId: ryant!.id, registrationPackages: "*", adAccountId: acc!.id },
        ]).returning();
        await tx.delete(externalRegistrations).where(inArray(externalRegistrations.id, [901, 902, 903, 904, 905]));

        const { syncRegistrations, getRegistrationKpi } = await import("./registrations");
        assert.deepEqual(await syncRegistrations(), { upserted: 5, deleted: 0, pages: 2 });
        const stored = await tx.select().from(externalRegistrations).where(inArray(externalRegistrations.id, [901, 902, 903, 904, 905]));
        assert.equal(stored.length, 5);
        const kpi = (await getRegistrationKpi("2026-09-01", "2026-10-31")).filter((r) => [holiday!.id, academia!.id, reguler!.id].includes(r.campaignId));
        assert.deepEqual(kpi.map((r) => [r.campaignId, r.userId, r.date, r.closing, r.revenue]).sort(), [
          [academia!.id, khabib!.id, "2026-10-05", 1, 4_000_000],
          [holiday!.id, khabib!.id, "2026-10-05", 1, 1_500_000], // 18:30 UTC on the 4th is the 5th in WIB
          [reguler!.id, ryant!.id, "2026-10-05", 1, 3_000_000], // 904 paid before the effective date: excluded
        ].sort());

        // KPI entries: Closing, Revenue and ROAS for the owners.
        const { getEntries } = await import("./data");
        const metrics = await tx.select().from(kpiMetrics).where(inArray(kpiMetrics.key, ["closing", "revenue"]));
        const id = (k: string) => metrics.find((m) => m.key === k)!.id;
        const entries = await getEntries("2026-10-01", "2026-10-31", [khabib!.id, ryant!.id]);
        const pick = (userId: number, metric: string) => entries.filter((e) => e.userId === userId && e.metricId === id(metric)).map((e) => [e.date, e.value]);
        assert.deepEqual(pick(khabib!.id, "closing"), [["2026-10-05", 2]]);
        assert.deepEqual(pick(khabib!.id, "revenue"), [["2026-10-05", 5_500_000]]);
        assert.deepEqual(pick(ryant!.id, "closing"), [["2026-10-05", 1]]);

        // Second run: incremental from the cursor; a rejected payment and a deletion undo their closings.
        round = 2;
        assert.deepEqual(await syncRegistrations(), { upserted: 1, deleted: 1, pages: 1 });
        const after2 = (await getRegistrationKpi("2026-10-01", "2026-10-31")).filter((r) => [holiday!.id, academia!.id, reguler!.id].includes(r.campaignId));
        assert.deepEqual(after2.map((r) => [r.campaignId, r.closing]), [[holiday!.id, 1]]);
        const [status] = await tx.select().from(appSettings).where(eq(appSettings.key, "registrations.status"));
        assert.ok(JSON.parse(status!.value).ok);
      } finally {
        mocks.forEach((m) => m.mock.restore());
      }
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    global.fetch = original;
  }
});
