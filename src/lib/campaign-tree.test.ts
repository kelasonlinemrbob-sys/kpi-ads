import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyCampaignMetrics } from "./campaign-metrics";
import { buildBreakdown, describeTargeting, treeStatus } from "./campaign-tree";

const m = (spent: number, impressions = spent * 10) => ({ ...emptyCampaignMetrics("meta", "IDR"), spent, impressions });
const set = (id: string, status: "active" | "paused" | "ended" = "active") => ({ id, name: `Set ${id}`, status, platformStatus: status.toUpperCase(), dailyBudget: 100_000, lifetimeBudget: null, optimizationGoal: "LEAD_GENERATION", audience: null });
const ad = (id: string, adsetId: string, status: "active" | "paused" | "ended" = "active") => ({ id, name: `Ad ${id}`, adsetId, status, platformStatus: null, thumbnailUrl: null });

test("statuses from Meta and Google", () => {
  assert.equal(treeStatus("ACTIVE"), "active");
  assert.equal(treeStatus("ENABLED"), "active");
  assert.equal(treeStatus("ADSET_PAUSED"), "paused");
  assert.equal(treeStatus("CAMPAIGN_PAUSED"), "paused");
  assert.equal(treeStatus("ARCHIVED"), "ended");
  assert.equal(treeStatus("REMOVED"), "ended");
  assert.equal(treeStatus("WITH_ISSUES"), "draft");
});

test("joins structure with the period's metrics, sorted by spend; archived leftovers without delivery are dropped", () => {
  const tree = buildBreakdown({
    platform: "meta",
    currency: "IDR",
    empty: () => emptyCampaignMetrics("meta", "IDR"),
    adsets: [set("1"), set("2"), set("3", "ended")],
    ads: [ad("a", "1"), ad("b", "1"), ad("c", "2"), ad("d", "2", "ended")],
    adsetMetrics: new Map([["1", { name: "Set 1", metrics: m(1000) }], ["2", { name: "Set 2", metrics: m(5000) }], ["9", { name: "Deleted set", metrics: m(300) }]]),
    adMetrics: new Map([
      ["a", { name: "Ad a", adsetId: "1", metrics: m(200) }],
      ["b", { name: "Ad b", adsetId: "1", metrics: m(800) }],
      ["c", { name: "Ad c", adsetId: "2", metrics: m(5000) }],
      ["x", { name: "Gone", adsetId: "9", metrics: m(300) }],
    ]),
  });
  assert.deepEqual(tree.adsets.map((s) => [s.id, s.metrics.spent, s.ads.map((a) => a.id)]), [
    ["2", 5000, ["c"]], // "d" ended without delivery
    ["1", 1000, ["b", "a"]],
    ["9", 300, ["x"]], // delivered in the period, deleted since
  ]);
  assert.equal(tree.adsets[2]!.status, "ended");
});

test("audience summary", () => {
  assert.equal(
    describeTargeting({
      age_min: 18, age_max: 35, genders: [2], geo_locations: { countries: ["ID"], cities: [{ name: "Kediri" }] },
      flexible_spec: [{ interests: [{ name: "IELTS" }, { name: "Beasiswa" }, { name: "TOEFL" }, { name: "Kuliah" }] }],
      custom_audiences: [{ name: "Leads 180 hari" }], targeting_automation: { advantage_audience: 1 },
    }),
    "18–35 · Perempuan · ID, Kediri · minat: IELTS, Beasiswa, TOEFL +1 · audiens: Leads 180 hari · Advantage+ audience",
  );
  assert.equal(describeTargeting({ age_min: 18, age_max: 65 }), "18–65+");
  assert.equal(describeTargeting({}), null);
  assert.equal(describeTargeting(undefined), null);
});
