import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, campaigns, externalRegistrations, users } from "@/db/schema";
import { encryptSecret } from "./secret-box";

after(async () => db.$client.end());

// Dated in 2099 so registrations a live database already holds never fall in the asserted window.
const kelas = (id: number, type: "adult" | "kids", cls: string, amount: number, confirmedAt: string | null) => ({
  id, registrationCode: `REG-K${id}`, name: `Member ${id}`, email: "x@y.z", phone: "0812", city: "Kediri", programType: type, selectedClass: cls,
  packageName: "VIP", packagePrice: amount - 321, startDate: null, status: confirmedAt ? "confirmed" : "pending_payment",
  createdAt: "2099-01-01T00:00:00Z", confirmedAt, changedAt: confirmedAt ?? "2099-01-01T00:00:00Z",
  payments: [{ paymentId: `registration:${id}`, kind: "registration", status: confirmedAt ? "confirmed" : "pending_payment", amount, approvedAt: confirmedAt }],
});

test("Kelas Online: own key and cursor, ids apart from LKBI, Adult → one owner, Kids → another, never LKBI's '*' (rolled back)", async () => {
  const rollback = new Error("rollback");
  const original = global.fetch;
  const paths: string[] = [];
  global.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://app.kelasonlinemrbob.com");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer kelas_testkey_abcdefghijklmnopqrstuvwxyz");
    paths.push(url.pathname.split("/").pop()!);
    const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { "content-type": "application/json" } });
    if (url.pathname.endsWith("/deleted-registrations")) return json({ data: [], nextCursor: "kd1", hasMore: false });
    return json({ data: [
      kelas(990001, "adult", "SPEAK UP 1", 980_321, "2099-03-04T18:30:00Z"), // 5 Mar WIB
      kelas(990002, "kids", "SMART KIDS", 750_123, "2099-03-05T03:00:00Z"),
      kelas(990003, "adult", "WALKY TALKY", 500_000, null), // proof not sent yet
    ], nextCursor: "k1", hasMore: false });
  };
  try {
    await db.transaction(async (tx) => {
      const mocks = [mock.method(db, "select", tx.select.bind(tx)), mock.method(db, "insert", tx.insert.bind(tx)), mock.method(db, "update", tx.update.bind(tx)), mock.method(db, "delete", tx.delete.bind(tx))];
      try {
        await tx.delete(appSettings).where(sql`${appSettings.key} like 'kelas_online.%' or ${appSettings.key} like 'shared.kelas_online.%'`);
        await tx.update(campaigns).set({ registrationPackages: null });
        await tx.insert(appSettings).values({ key: "shared.kelas_online.api_key", value: encryptSecret("kelas_testkey_abcdefghijklmnopqrstuvwxyz") });
        const email = (n: string) => `kelas-${n}-${crypto.randomUUID()}@example.invalid`;
        const [wahib, fadhilah, ryant] = await tx.insert(users).values([
          { name: "Wahib T", email: email("w"), passwordHash: "x", role: "supervisor" as const },
          { name: "Fadhilah T", email: email("f"), passwordHash: "x", role: "advertiser" as const },
          { name: "Ryant T", email: email("r"), passwordHash: "x", role: "advertiser" as const },
        ]).returning();
        const [adult, kids, lkbi] = await tx.insert(campaigns).values([
          { name: "Kelas Online Mr.BOB", platform: "meta" as const, ownerId: wahib!.id, registrationPackages: "ADULT", registrationSource: "kelas" },
          { name: "KIDS KO", platform: "meta" as const, ownerId: fadhilah!.id, registrationPackages: "KIDS", registrationSource: "kelas" },
          { name: "LKBI REGULER", platform: "meta" as const, ownerId: ryant!.id, registrationPackages: "*", registrationSource: "lkbi" },
        ]).returning();
        // An LKBI registration with the same id must survive the Kelas Online copy.
        await tx.insert(externalRegistrations).values({ source: "lkbi", id: 990001, registrationId: "REG-L", name: "LKBI", packageName: "PAKET X", status: "paid", totalPrice: 1, registeredAt: new Date("2099-01-01"), changedAt: new Date("2099-01-01") });

        const { syncRegistrations, getRegistrationKpi, getRegistrationStatus } = await import("./registrations");
        assert.deepEqual(await syncRegistrations({ source: "kelas" }), { upserted: 3, deleted: 0, pages: 1 });
        assert.deepEqual(paths, ["registrations", "deleted-registrations"]);
        const stored = await tx.select().from(externalRegistrations).where(inArray(externalRegistrations.id, [990001, 990002, 990003]));
        assert.deepEqual(stored.map((r) => [r.source, r.id]).sort(), [["kelas", 990001], ["kelas", 990002], ["kelas", 990003], ["lkbi", 990001]]);
        const [cursor] = await tx.select().from(appSettings).where(eq(appSettings.key, "kelas_online.cursor"));
        assert.equal(cursor?.value, "k1");

        const kpi = (await getRegistrationKpi("2099-03-01", "2099-03-31")).filter((r) => [adult!.id, kids!.id, lkbi!.id].includes(r.campaignId));
        assert.deepEqual(kpi.map((r) => [r.campaignId, r.userId, r.date, r.closing, r.revenue, r.source]).sort(), [
          [adult!.id, wahib!.id, "2099-03-05", 1, 980_321, "kelas"],
          [kids!.id, fadhilah!.id, "2099-03-05", 1, 750_123, "kelas"],
        ].sort());
        const status = await getRegistrationStatus({ start: "2099-03-01", end: "2099-03-31" }, "kelas");
        assert.equal(status.connected, true);
        assert.deepEqual(status.byProduct.map((p) => [p.id, p.closing]).sort(), [[adult!.id, 1], [kids!.id, 1]].sort());
        assert.equal(status.byProduct.some((p) => p.id === lkbi!.id), false);
        assert.ok(!(await tx.select().from(externalRegistrations).where(and(eq(externalRegistrations.source, "kelas"), eq(externalRegistrations.id, 990003))))[0]!.paidAt);
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
