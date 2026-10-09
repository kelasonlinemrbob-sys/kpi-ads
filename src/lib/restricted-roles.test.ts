import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNav } from "@/components/shell/nav";
import { can, homePath } from "./roles";
import { canAssign } from "./task-rules";

const counts = { pendingReviews: 0, openTasks: 0, revisions: 0 };

test("Search Console navigation is visible only to supervisor, SEO and webmaster", () => {
  for (const role of ["supervisor", "seo", "webmaster", "advertiser", "creative", "cso"] as const) {
    assert.equal(buildNav(role, counts).some((section) => section.items.some((item) => item.href === "/seo")), ["supervisor", "seo", "webmaster"].includes(role));
  }
});

test("Creative only reaches the Creative page and Pengaturan", () => {
  assert.equal(homePath("creative"), "/creatives");
  assert.equal(homePath("cso"), "/leads");
  assert.equal(homePath("advertiser"), "/dashboard");
  const links = buildNav("creative", counts).flatMap((s) => s.items.flatMap((i) => [i.href, ...(i.children ?? []).map((c) => c.href)]));
  assert.deepEqual(links, ["/creatives", "/settings"]);
  assert.equal(can.submitReports("creative"), false);
  assert.equal(can.viewCampaigns("creative"), false);
  assert.equal(can.viewCreatives("creative"), true);
  assert.equal(can.runAiAnalysis("creative"), true);
});

test("no tasks to or from a Creative-only member; a web master with a second Creative role still gets them", () => {
  const supervisor = { id: 1, role: "supervisor" as const };
  const creative = { id: 2, role: "creative" as const };
  const advertiser = { id: 3, role: "advertiser" as const, advertiserLevel: "junior" as const };
  const webCreative = { id: 4, role: "webmaster" as const, secondaryRole: "creative" as const };
  assert.equal(canAssign(supervisor, creative), false);
  assert.equal(canAssign(advertiser, creative), false);
  assert.equal(canAssign(creative, creative), false);
  assert.equal(canAssign(advertiser, webCreative), true);
});

test("Creative has no KPI tracker: no role slots, never a second role, not a report role", async () => {
  const { hasSecondRole, roleSlots } = await import("./member-roles");
  const { MEMBER_ROLES } = await import("./roles");
  assert.deepEqual(roleSlots({ role: "creative" }), []);
  assert.deepEqual(roleSlots({ role: "creative", secondaryRole: "seo", secondaryShare: 40 }), []);
  assert.equal(hasSecondRole({ role: "webmaster", secondaryRole: "creative" }), false);
  assert.deepEqual(roleSlots({ role: "webmaster", secondaryRole: "creative", secondaryShare: 40 }), [{ role: "webmaster", share: 100 }]);
  assert.equal(MEMBER_ROLES.includes("creative" as never), false);
});

test("SEO access includes a second role: Advertiser + SEO Specialist sees Performa SEO, a plain advertiser doesn't", async () => {
  const { canViewSeo } = await import("./roles");
  assert.equal(canViewSeo({ role: "advertiser", secondaryRole: "seo" }), true);
  assert.equal(canViewSeo({ role: "advertiser", secondaryRole: "webmaster" }), true);
  assert.equal(canViewSeo({ role: "advertiser" }), false);
  assert.equal(canViewSeo({ role: "seo" }), true);
  assert.equal(canViewSeo({ role: "cso", secondaryRole: "seo" }), false);
  const seoLink = (secondary: "seo" | null) => buildNav("advertiser", counts, false, secondary).some((s) => s.items.some((i) => i.href === "/seo"));
  assert.deepEqual([seoLink("seo"), seoLink(null)], [true, false]);
});

test("SEO menu: tab shortcuts, open by default and tagged for SEO as the second KPI", () => {
  const seo = (role: "seo" | "advertiser" | "webmaster" | "supervisor", second: "seo" | null = null) => buildNav(role, counts, false, second).find((s) => s.label === "SEO");
  const dual = seo("advertiser", "seo")!;
  assert.deepEqual(dual.items.map((i) => i.href), ["/seo", "/seo?tab=queries", "/seo?tab=opportunities", "/seo?tab=research", "/seo?tab=ai", "/settings?tab=integrasi&service=search-console"]);
  assert.deepEqual([dual.defaultOpen, dual.tag], [true, "KPI kedua"]);
  assert.deepEqual([seo("seo")!.defaultOpen, seo("seo")!.tag], [true, undefined]);
  assert.deepEqual([seo("webmaster")!.defaultOpen, seo("supervisor")!.items.at(-1)!.title], [false, "Koneksi Search Console"]);
  assert.equal(seo("advertiser"), undefined);
});
