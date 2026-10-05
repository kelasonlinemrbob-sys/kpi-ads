import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignPeriod, derivedCampaignMetrics, emptyCampaignMetrics, totalCampaignMetrics } from "./campaign-metrics";

test("periods include today and handle leap years/year boundaries", () => {
  assert.deepEqual(campaignPeriod("7d", "2026-01-03"), { key: "7d", start: "2025-12-28", end: "2026-01-03" });
  assert.deepEqual(campaignPeriod("last-month", "2024-03-01"), { key: "last-month", start: "2024-02-01", end: "2024-02-29" });
  assert.deepEqual(campaignPeriod("yesterday", "2026-01-01"), { key: "yesterday", start: "2025-12-31", end: "2025-12-31" });
  assert.equal(campaignPeriod("injection", "2026-10-05").start, "2026-10-01");
});
test("aggregate ratios are weighted; unique reach is not summed", () => {
  const a = { ...emptyCampaignMetrics("meta", "IDR"), spent: 100000, impressions: 1000, reach: 800, linkClicks: 100, landingPageViews: 50, leads: 10 };
  const b = { ...emptyCampaignMetrics("meta", "IDR"), spent: 300000, impressions: 9000, reach: 2000, linkClicks: 200, landingPageViews: 150, leads: 30 };
  const total = derivedCampaignMetrics(totalCampaignMetrics([a, b]));
  assert.equal(total.cplv, 2000); assert.equal(total.cpr, 10000);
  assert.equal(total.linkCtr, 3); assert.equal(total.cpm, 40000);
  assert.equal(total.reach, null); assert.equal(total.frequency, null);
  assert.equal(derivedCampaignMetrics(a).frequency, 1.25);
});
test("unknown, unsupported, mixed currencies and zero denominators stay distinct", () => {
  const a = emptyCampaignMetrics("meta", "IDR");
  assert.equal(derivedCampaignMetrics(a).cplv, null);
  assert.equal(a.landingPageViews, 0);
  assert.equal(totalCampaignMetrics([a, null]).spent, null);
  assert.equal(totalCampaignMetrics([a, emptyCampaignMetrics("meta", "USD")]).spent, null);
  assert.equal(totalCampaignMetrics([]).spent, null);
  const google = emptyCampaignMetrics("google", "IDR", false);
  assert.equal(google.leads, null); assert.equal(google.conversions, 0);
  assert.equal(google.landingPageViews, null);
  assert.equal(totalCampaignMetrics([a, google]).leads, null);
});
