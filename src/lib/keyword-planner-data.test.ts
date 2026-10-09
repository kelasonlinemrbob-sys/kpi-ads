import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanSeeds, defaultSeeds, joinWithSearchConsole, parsePlannerRow, plannerCsv } from "./keyword-planner-data";

const months = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const row = (text: string, avg: string, comp = "LOW", values = [100, 100, 100, 100, 100, 100, 100, 100, 100, 150, 150, 150]) => ({
  text,
  keywordIdeaMetrics: {
    avgMonthlySearches: avg, competition: comp, competitionIndex: "23", lowTopOfPageBidMicros: "1500000000", highTopOfPageBidMicros: "4250000000",
    // API order is not guaranteed: shuffled on purpose.
    monthlySearchVolumes: values.map((v, i) => ({ month: months[(i + 10) % 12], year: i + 10 >= 12 ? "2026" : "2025", monthlySearches: String(v) })).reverse(),
  },
});

test("planner rows: volume, competition, bids from micros, trend oldest first, 3-month change", () => {
  const k = parsePlannerRow(row("kampung inggris pare", "2900"))!;
  assert.deepEqual([k.volume, k.competition, k.competitionIndex, k.bidLow, k.bidHigh], [2900, "low", 23, 1500, 4250]);
  assert.equal(k.trend[0]!.month, "2025-11");
  assert.equal(k.trend.at(-1)!.month, "2026-10");
  assert.equal(k.trendPct, 50);
  assert.equal(parsePlannerRow({ text: "  " }), null);
  const bare = parsePlannerRow({ text: "x", keywordMetrics: { competition: "UNSPECIFIED" } })!;
  assert.deepEqual([bare.volume, bare.competition, bare.trendPct, bare.bidLow], [null, "unknown", null, null]);
});

test("joined with Search Console by keyword (case/space-insensitive); missing = content gap", () => {
  const ideas = [parsePlannerRow(row("Kampung  Inggris Pare", "2900"))!, parsePlannerRow(row("english camp anak", "320"))!];
  const joined = joinWithSearchConsole(ideas, [{ keys: ["kampung inggris pare"], clicks: 3, impressions: 120, position: 6.4 }]);
  assert.deepEqual(joined.map((j) => j.site?.position ?? null), [6.4, null]);
  const csv = plannerCsv(joined, "IDR").split("\n");
  assert.equal(csv[0], "Kata kunci,Volume/bulan,Tren 3 bulan (%),Kompetisi,Indeks kompetisi,Bid rendah (IDR),Bid tinggi (IDR),Posisi website,Impresi website,Klik website");
  assert.equal(csv[1], "Kampung  Inggris Pare,2900,50,Rendah,23,1500,4250,6.4,120,3");
});

test("seeds: trimmed, unique, at most 20; defaults are the most-seen keywords", () => {
  assert.deepEqual(cleanSeeds([" ielts ", "IELTS", "", "toefl  pare"]), ["ielts", "toefl pare"]);
  assert.equal(cleanSeeds(Array.from({ length: 30 }, (_, i) => `k${i}`)).length, 20);
  assert.deepEqual(defaultSeeds([{ keys: ["a"], impressions: 5 }, { keys: ["b"], impressions: 50 }, { keys: ["c"], impressions: 9 }], 2), ["b", "c"]);
});
