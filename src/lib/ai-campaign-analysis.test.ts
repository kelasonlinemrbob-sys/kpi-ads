import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCampaignAnalysisInput, campaignNumbers, MAX_CAMPAIGN_ADS, parseCampaignResult } from "./ai-campaign-analysis";
import { emptyCampaignMetrics } from "./campaign-metrics";
import type { CampaignBreakdown } from "./campaign-tree";

const m = (spent: number, extra: object = {}) => ({ ...emptyCampaignMetrics("meta", "IDR"), spent, impressions: spent / 10, linkClicks: spent / 1000, leads: spent / 20_000, ...extra });

const breakdown = (ads: number): CampaignBreakdown => ({
  platform: "meta",
  currency: "IDR",
  adsets: [
    { id: "1", name: "Broad", status: "active", platformStatus: "ACTIVE", dailyBudget: 100_000, lifetimeBudget: null, optimizationGoal: "LEAD_GENERATION", audience: "18–35 · ID", metrics: m(600_000), ads: Array.from({ length: ads }, (_, i) => ({ id: `a${i}`, name: `Ad ${i}`, status: "active" as const, platformStatus: "ACTIVE", thumbnailUrl: null, metrics: m(1_000 * (ads - i), { reach: 10 }) })) },
    { id: "2", name: "Retarget", status: "paused", platformStatus: "PAUSED", dailyBudget: null, lifetimeBudget: null, optimizationGoal: null, audience: null, metrics: m(400_000), ads: [] },
  ],
});

test("numbers: derived ratios rounded, unknown values left out", () => {
  const n = campaignNumbers({ ...emptyCampaignMetrics("google", "IDR", false), spent: 100_000, impressions: 20_000, clicks: 300, conversions: 4 });
  assert.equal(n.spend, 100_000);
  assert.equal(n.ctrPct, 1.5);
  assert.equal(n.costPerConversion, 25_000);
  assert.equal("leads" in n, false);
  assert.equal("reach" in n, false);
});

test("input: refs, spend share, ads beyond the cap summed, product closings noted", () => {
  const input = buildCampaignAnalysisInput({
    campaign: { name: "LKBI REGULER [Sales]", platform: "meta", account: "LKBI", objective: "OUTCOME_SALES", status: "ACTIVE", dailyBudget: 100_000, currency: "IDR", startDate: null, endDate: null },
    product: { name: "LKBI REGULER", owner: "Ryant" },
    period: { start: "2026-10-01", end: "2026-10-08", days: 8, label: "Bulan ini" },
    current: m(1_000_000),
    previous: null,
    breakdown: breakdown(MAX_CAMPAIGN_ADS + 3),
    registrations: { closing: 12, revenue: 30_000_000 },
  });
  assert.deepEqual(input.adsets.map((s) => [s.ref, s.spendSharePct, s.ads, s.audience]), [["S1", 60, MAX_CAMPAIGN_ADS + 3, "18–35 · ID"], ["S2", 40, 0, undefined]]);
  assert.equal(input.ads.length, MAX_CAMPAIGN_ADS);
  assert.deepEqual([input.ads[0]!.ref, input.ads[0]!.adset, input.ads[0]!.name], ["A1", "S1", "Ad 0"]);
  assert.equal(input.otherAds?.count, 3);
  assert.equal(input.otherAds?.numbers.spend, 3_000 + 2_000 + 1_000);
  assert.equal("reach" in input.otherAds!.numbers, false);
  assert.equal(input.registrations?.closing, 12);
  assert.ok(input.gaps.includes("Periode sebelumnya tidak tersedia."));
});

test("result: lenient enums, unknown refs dropped, lists capped", () => {
  const input = { adsets: [{ ref: "S1" }], ads: [{ ref: "A1" }] } as Parameters<typeof parseCampaignResult>[1];
  const raw = `Berikut hasilnya: ${JSON.stringify({
    score: "8.6", verdict: "Scale", summary: "Bagus.",
    matrix: Array.from({ length: 10 }, (_, i) => ({ metric: `M${i}`, value: 1, benchmark: "x", status: "Baik", note: "" })),
    adsets: [{ ref: "s1", verdict: "pertahankan", reason: "ok" }, { ref: "S9", verdict: "hentikan", reason: "?" }],
    ads: [{ ref: "A1", verdict: "matikan", reason: "boros" }],
    actions: [{ priority: "TINGGI", title: "Naikkan budget S1", detail: "20%" }],
  })}`;
  const r = parseCampaignResult(raw, input)!;
  assert.equal(r.score, 9);
  assert.equal(r.verdict, "scale");
  assert.equal(r.matrix.length, 8);
  assert.equal(r.matrix[0]!.value, "1");
  assert.equal(r.matrix[0]!.status, "baik");
  assert.deepEqual(r.adsets.map((s) => s.ref), ["S1"]);
  assert.equal(r.ads[0]!.verdict, "optimasi"); // unknown verdict falls back
  assert.equal(r.actions[0]!.priority, "tinggi");
  assert.equal(parseCampaignResult("bukan json", input), null);
  assert.equal(parseCampaignResult(JSON.stringify({ score: 5 }), input), null);
});
