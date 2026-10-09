import assert from "node:assert/strict";
import { test } from "node:test";
import { matchPackage, matchPackageDetail, paidAtOf, parsePackageKeywords, toLocalRegistration, type ApiRegistration } from "./registration-mapping";

const products = [
  { id: 105, ownerId: 8, registrationPackages: "HOLIDAY" },
  { id: 106, ownerId: 8, registrationPackages: "ielts, TOEFL" },
  { id: 100, ownerId: 9, registrationPackages: "*" },
  { id: 1, ownerId: 1, registrationPackages: null },
];

test("packages: longest keyword wins, case-insensitive; '*' takes everything else", () => {
  assert.deepEqual(parsePackageKeywords(" holiday ,  ielts\nTOEFL,,"), ["HOLIDAY", "IELTS", "TOEFL"]);
  assert.equal(matchPackage("HOLIDAY Paket 1 Minggu", products)?.id, 105);
  assert.equal(matchPackage("IELTS 1 Bulan (CAMP)", products)?.id, 106);
  assert.equal(matchPackage("1 BULAN TOEFL CAMP", products)?.id, 106);
  assert.equal(matchPackage("PAKET 1 BULAN 5-UP", products)?.id, 100);
  assert.equal(matchPackage("Paket REGULER NONCAMP", products)?.id, 100);
  assert.equal(matchPackage("PRE IELTS", [...products, { id: 7, ownerId: 3, registrationPackages: "PRE IELTS" }])?.id, 7);
  assert.equal(matchPackage("Paket HOLIDAY", products.filter((p) => p.id !== 105 && p.id !== 100)), null);
});

const reg = (payments: ApiRegistration["payments"]): ApiRegistration => ({
  id: 1, registrationId: "REG-1", namaLengkap: "Budi", paketProgram: "Paket HOLIDAY", periodeProgram: "14 Desember 2026", status: "paid",
  totalPrice: 1250678, sumberInfo: "Iklan Instagram", kotaKabupaten: "Kediri", createdAt: "2026-10-01T01:00:00Z", changedAt: "2026-10-02T03:00:00Z", payments,
});

test("paid at: earliest still-accepted payment; old payments without approvedAt use their update; rejected doesn't count", () => {
  assert.equal(paidAtOf(reg([])), null);
  assert.equal(paidAtOf(reg([{ id: 1, status: "pending", approvedAt: null, createdAt: "2026-10-01T02:00:00Z", updatedAt: null }])), null);
  assert.equal(paidAtOf(reg([{ id: 1, status: "rejected", approvedAt: "2026-10-02T02:00:00Z", createdAt: "2026-10-01T02:00:00Z", updatedAt: null }])), null);
  assert.equal(paidAtOf(reg([
    { id: 2, status: "verified", approvedAt: "2026-10-05T02:00:00Z", createdAt: "2026-10-04T02:00:00Z", updatedAt: null },
    { id: 1, status: "verified", approvedAt: null, createdAt: "2026-09-30T02:00:00Z", updatedAt: "2026-10-03T08:00:00Z" },
  ]))?.toISOString(), "2026-10-03T08:00:00.000Z");
});

test("the local copy keeps only what KPIs need: no phone, email, address or transfer proof", () => {
  const full = { ...reg([{ id: 1, status: "verified", approvedAt: "2026-10-02T02:00:00Z", createdAt: "2026-10-01T02:00:00Z", updatedAt: null }]), email: "a@b.c", nomorHP: "812345678", buktiTransferUrl: "https://x/y.jpg" } as ApiRegistration;
  const local = toLocalRegistration(full);
  assert.deepEqual(Object.keys(local).sort(), ["changedAt", "city", "id", "infoSource", "name", "packageName", "paidAt", "period", "registeredAt", "registrationId", "source", "status", "totalPrice"]);
  assert.equal(local.totalPrice, 1250678);
  assert.equal(local.paidAt?.toISOString(), "2026-10-02T02:00:00.000Z");
});

test("Khabib's programs win over Ryant's catch-all, even when the name also says NON-CAMP or Reguler", () => {
  const team = [
    { id: 105, ownerId: 8, registrationPackages: "HOLIDAY" },
    { id: 106, ownerId: 8, registrationPackages: "IELTS, TOEFL, AKADEMIK, ACADEMIC" },
    { id: 100, ownerId: 9, registrationPackages: "*" },
  ];
  for (const [pkg, id] of [
    ["IELTS 1 Bulan (NON-CAMP)", 106], ["2 MINGGU TOEFL NON CAMP", 106], ["Paket AKADEMIK NONCAMP", 106], ["Academic English Starter", 106],
    ["1 BULAN PRE IELTS CAMP", 106], ["paket holiday", 105], ["PAKET 1 BULAN 5-UP", 100], ["1 Bulan (NON-CAMP 3C)", 100], ["SUPER PRIVATE REGULER", 100],
  ] as const) assert.equal(matchPackage(pkg, team)?.id, id, pkg);
  assert.deepEqual(matchPackageDetail("PAKET 1 BULAN 5-UP", team), { product: team[2], viaFallback: true });
  assert.equal(matchPackageDetail("IELTS Basic", team)?.viaFallback, false);
});

test("Kelas Online: Adult/Kids package text, paid on the proof date for the total transferred, no PII", async () => {
  const { kelasPackage, kelasToLocalRegistration } = await import("./registration-mapping");
  assert.equal(kelasPackage({ programType: "kids", selectedClass: "SMART KIDS", packageName: "VIP" }), "KIDS · SMART KIDS · VIP");
  assert.equal(kelasPackage({ programType: "adult", selectedClass: null, packageName: "1 BULAN - VIP" }), "ADULT · - · 1 BULAN - VIP");
  const base = { id: 321, registrationCode: "REG-X", name: "Budi", city: "Kediri", programType: "adult", selectedClass: "SPEAK UP 1", packageName: "VIP", packagePrice: 980_000, startDate: "2 November 2026", createdAt: "2026-10-08T03:46:12Z", changedAt: "2026-10-08T03:46:14Z", email: "x@y.z", phone: "0812" };
  const paid = kelasToLocalRegistration({ ...base, status: "confirmed", confirmedAt: "2026-10-08T03:46:14Z", payments: [
    { paymentId: "registration:321", kind: "registration", status: "confirmed", amount: 980_321, approvedAt: "2026-10-08T03:46:14Z" },
    { paymentId: "renewal:9", kind: "renewal", status: "approved", amount: 500_000, approvedAt: "2026-10-09T03:00:00Z" },
  ] } as never);
  assert.deepEqual([paid.source, paid.packageName, paid.totalPrice, paid.paidAt?.toISOString(), paid.period], ["kelas", "ADULT · SPEAK UP 1 · VIP", 980_321, "2026-10-08T03:46:14.000Z", "2 November 2026"]);
  assert.equal("email" in paid || "phone" in paid, false);
  const pending = kelasToLocalRegistration({ ...base, status: "pending_payment", confirmedAt: null, payments: [{ paymentId: "registration:321", kind: "registration", status: "pending_payment", amount: 980_321, approvedAt: null }] } as never);
  assert.equal(pending.paidAt, null);
});
