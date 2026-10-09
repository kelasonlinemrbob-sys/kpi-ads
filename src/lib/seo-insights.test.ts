import assert from "node:assert/strict";
import { test } from "node:test";
import { previousRange } from "./search-console-input";
import { bucketOf, expectedCtr, findOpportunities, pctChange, positionDistribution, topMovers, withChanges } from "./seo-insights";

const r = (key: string, clicks: number, impressions: number, position: number) => ({ keys: [key], clicks, impressions, ctr: impressions ? clicks / impressions : 0, position });

test("previous period has the same length, just before", () => {
  assert.deepEqual(previousRange({ start: "2026-09-08", end: "2026-10-05" }), { start: "2026-08-11", end: "2026-09-07" });
  assert.deepEqual(previousRange({ start: "2026-10-01", end: "2026-10-01" }), { start: "2026-09-30", end: "2026-09-30" });
});

test("changes: joined by key, position gain positive when moving up, new rows have no previous", () => {
  const rows = withChanges([r("kampung inggris", 50, 1000, 3.2), r("kursus ielts", 5, 400, 8)], [r("kampung inggris", 40, 900, 5.0)]);
  assert.deepEqual([rows[0]!.clicksDelta, rows[0]!.positionGain], [10, 1.8]);
  assert.equal(rows[1]!.previous, null);
  assert.equal(withChanges([r("x", 1, 10, 1)], null)[0]!.clicksDelta, null);
  assert.equal(pctChange(130, 100), 30);
  assert.equal(pctChange(5, 0), null);
});

test("position bands and expected CTR", () => {
  assert.deepEqual([bucketOf(1), bucketOf(3), bucketOf(3.4), bucketOf(10), bucketOf(15), bucketOf(42)], ["top3", "top3", "top10", "top10", "page2", "beyond"]);
  const bands = positionDistribution([r("a", 10, 100, 2), r("b", 3, 100, 7), r("c", 0, 50, 12), r("d", 0, 0, 0)]);
  assert.deepEqual(bands.map((b) => [b.key, b.keywords, b.clicks]), [["top3", 1, 10], ["top10", 1, 3], ["page2", 1, 0], ["beyond", 0, 0]]);
  assert.equal(expectedCtr(1), 0.28);
  assert.equal(expectedCtr(15), 0.01);
});

test("opportunities: striking distance, low CTR on page 1, declining clicks; thin data ignored", () => {
  const rows = withChanges(
    [r("ielts pare", 4, 600, 6.2), r("kursus inggris", 2, 400, 2.1), r("toefl", 6, 300, 4), r("sedikit", 0, 10, 8)],
    [r("toefl", 20, 320, 3.5)],
  );
  const ops = findOpportunities(rows);
  const by = (kind: string) => ops.filter((o) => o.kind === kind).map((o) => o.key);
  assert.deepEqual(by("striking"), ["ielts pare", "toefl"]);
  assert.deepEqual(by("low_ctr"), ["kursus inggris", "ielts pare", "toefl"]); // toefl: 2% at position 4, where ~8% is usual
  assert.deepEqual(by("declining"), ["toefl"]);
  assert.equal(ops.find((o) => o.kind === "declining")!.potentialClicks, 14);
  assert.ok(!ops.some((o) => o.key === "sedikit"));
  const m = topMovers(rows);
  assert.deepEqual([m.down.map((x) => x.key), m.fresh.map((x) => x.key)], [["toefl"], ["ielts pare", "kursus inggris", "sedikit"]]);
  assert.deepEqual([m.rankUp.length, m.rankDown.map((x) => [x.key, x.positionGain])], [0, [["toefl", -0.5]]]);
});

test("sums never count a URL property inside a picked domain property twice", async () => {
  const { withoutOverlaps } = await import("./search-console-input");
  assert.deepEqual(
    withoutOverlaps(["https://mrbob.com/", "https://www.mrbob.com/", "sc-domain:mrbob.com", "https://holiday.kampunginggris.com/", "sc-domain:blog.mrbob.com", "https://other.com/"]),
    ["sc-domain:mrbob.com", "https://holiday.kampunginggris.com/", "https://other.com/"],
  );
  assert.deepEqual(withoutOverlaps(["https://mrbob.com/", "https://www.mrbob.com/"]), ["https://mrbob.com/", "https://www.mrbob.com/"], "URL properties alone don't overlap");
});
