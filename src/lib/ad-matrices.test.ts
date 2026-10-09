import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMatrices, DEFAULT_MATRIX_BENCHMARKS, diagnoseAd, MATRICES, matrixBrief, matrixContext, placeAds, type MatrixAd } from "./ad-matrices";

const ad = (ref: number, patch: Partial<MatrixAd> = {}): MatrixAd => ({
  ref, name: `Iklan ${ref}`, campaign: "Broad", format: "Video", impressions: 20000, clicks: 200, results: 20, spend: 400000,
  ctrPct: 1, cpm: 20000, costPerResult: 20000, hookRatePct: 25, holdRatePct: 12, sufficientData: true,
  dailyFrequency: 1.2, dailyReach: 2000, landingPageViews: 150, ...patch,
});
const def = (id: string) => MATRICES.find((m) => m.id === id)!;
const ctxFor = (ads: MatrixAd[], target: number | null = 25000) => matrixContext(ads, DEFAULT_MATRIX_BENCHMARKS, { targetCostPerResult: target, averageCostPerResult: 22000 });

test("quadrants: split at the benchmark line, on the line counts as the better side", () => {
  const ads = [ad(1), ad(2, { dailyFrequency: 2.4, ctrPct: 0.3 }), ad(3, { ctrPct: 0.5 })];
  const r = placeAds(def("frequency-ctr"), ads, ctxFor(ads));
  assert.deepEqual(r.placements.map((p) => [p.ref, p.quadrant]), [[1, "tl"], [2, "br"], [3, "tl"]]);
  assert.equal(r.def.quadrants.br.tone, "problem");
});

test("retargeting gets the looser frequency line; reach is split at the account median", () => {
  const ads = [ad(1, { dailyFrequency: 2.2, campaign: "Retarget IG Engagers", dailyReach: 500 }), ad(2, { dailyFrequency: 2.2, dailyReach: 3000 }), ad(3, { dailyReach: 1000 })];
  const ctx = ctxFor(ads);
  assert.equal(ctx.medianDailyReach, 1000);
  const r = placeAds(def("reach-frequency"), ads, ctx);
  assert.deepEqual(r.placements.map((p) => [p.ref, p.quadrant]), [[1, "bl"], [2, "tr"], [3, "tl"]]);
});

test("cost per result is relative to the target (else the average); spending without results counts as expensive", () => {
  const ads = [ad(1, { costPerResult: 20000 }), ad(2, { costPerResult: 35000, cpm: 18000 }), ad(3, { results: 0, costPerResult: null })];
  const withTarget = placeAds(def("cpm-cost"), ads, ctxFor(ads));
  assert.deepEqual(withTarget.placements.map((p) => [p.ref, p.quadrant]), [[1, "bl"], [2, "tl"], [3, "tl"]]);
  assert.equal(withTarget.line.yNote, "1,2× target");
  const avg = ctxFor(ads, null);
  assert.equal(avg.targetCost, 22000);
  assert.equal(placeAds(def("cpm-cost"), ads, avg).line.yNote, "1,2× rata-rata");
});

test("video matrices skip images; ads without LPV or with too little data are left out", () => {
  const ads = [ad(1), ad(2, { format: "Grafis", hookRatePct: null, holdRatePct: null }), ad(3, { landingPageViews: null }), ad(4, { sufficientData: false })];
  const ctx = ctxFor(ads);
  assert.deepEqual(placeAds(def("hook-hold"), ads, ctx).placements.map((p) => p.ref), [1, 3]);
  const lpv = placeAds(def("ctr-lpv"), ads, ctx);
  assert.deepEqual(lpv.placements.map((p) => p.ref), [1, 2]);
  assert.equal(lpv.skipped, 1);
  assert.ok(buildMatrices([], ctx).length === 0);
});

test("diagnosis: the first red box along delivery → creative → click → page → result is the main problem", () => {
  // Clicks don't reach the page (click) and results are expensive (result): the click problem comes first.
  const leaky = ad(1, { landingPageViews: 40, costPerResult: 60000, ctrPct: 1.4 });
  const healthy = ad(2);
  const thin = ad(3, { sufficientData: false });
  const ads = [leaky, healthy, thin];
  const ctx = ctxFor(ads);
  const results = buildMatrices(ads, ctx);
  const d = diagnoseAd(leaky, results);
  assert.equal(d.kind, "problem");
  if (d.kind === "problem") {
    assert.equal(d.main.title, "Banyak klik, sedikit yang sampai halaman");
    assert.equal(d.main.stage, "click");
    assert.ok(d.also.includes("Banyak klik, konversi bocor"));
  }
  assert.equal(diagnoseAd(healthy, results).kind, "ok");
  assert.equal(diagnoseAd(thin, results).kind, "insufficient");
  const brief = matrixBrief(ads, ctx);
  assert.match(brief[0]!.mainProblem, /sampai halaman \(Klik\)/);
  assert.equal(brief[1]!.mainProblem, "Tidak ada kotak merah");
  assert.ok(brief[1]!.quadrants.some((q) => q.startsWith("Hook Rate × Hold Rate: Sehat")));
});
