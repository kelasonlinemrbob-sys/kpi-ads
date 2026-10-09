import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { db } from "@/db";
import { encryptSecret } from "./secret-box";
import { buildCreativeAnalysisInput, parseAnalysisResult, promptPayload } from "./ai-ads-analysis";
import {
  applyEnrichment,
  buildDaily,
  buildSegments,
  changePct,
  fetchCreativeImages,
  fetchMetaEnrichment,
  isMetaMediaUrl,
  placementLabel,
  previousRange,
} from "./ai-analysis-meta";
import type { CreativeRow } from "./creatives-data";

process.env.AUTH_SECRET = "fixture-encryption-key";
const now = new Date().toISOString();
// Drizzle reads rows in array mode: ad_accounts columns, then app_settings columns.
mock.method(db.$client, "query", async (q: { text?: string } | string) => {
  const sql = typeof q === "string" ? q : (q.text ?? "");
  if (sql.includes('"ad_accounts"')) return { rows: [[7, "meta", "111", "Akun Umroh", null, 1, null, null, now]] };
  return { rows: [["shared.meta.access_token", encryptSecret("meta-test-token"), 1, now]] };
});
after(async () => {
  await db.$client.end();
});

const period = { start: "2026-09-21", end: "2026-09-27", days: 7, label: "7 hari terakhir" };
const stats = (spend: number, results: number, impressions = 10000, clicks = 100, reach = 8000) => ({ spend, results, impressions, clicks, reach });

function row(id: number, patch: Partial<CreativeRow> = {}): CreativeRow {
  return {
    id, adAccountId: 7, externalAdId: `900${id}`, accountName: "Akun Umroh", adName: `Iklan ${id}`, campaignName: "[UMROH] Broad", adType: "",
    permalink: null, thumbnailUrl: null, label: null, status: "active", platformStatus: "ACTIVE", format: "grafis", detectedFormat: "grafis",
    formatOverridden: false, creatorId: null, editorId: null, impressions: 10000, reach: 8000, videoViews: 0, avgPlayTime: null, thruplays: 0,
    spend: 300000, clicks: 100, leads: 10, postId: null, advertiser: null, product: null, adCreatedAt: null, syncedAt: now, ...patch,
  };
}

test("maths: previous range, change, labels and Meta media hosts", () => {
  assert.deepEqual(previousRange("2026-03-01", 7), { start: "2026-02-22", end: "2026-02-28" });
  assert.equal(changePct(110, 100), 10);
  assert.equal(changePct(5, 0), null);
  assert.equal(changePct(null, 4), null);
  assert.equal(placementLabel("instagram", "instagram_stories"), "Instagram · Stories");
  assert.equal(placementLabel("audience_network", "an_classic"), "Audience Network · Native, banner & interstitial");
  assert.equal(placementLabel("threads", "threads_feed"), "Threads · Threads feed");
  assert.equal(isMetaMediaUrl("https://scontent.xx.fbcdn.net/v/t45/a.jpg"), true);
  assert.equal(isMetaMediaUrl("https://evil.example/fbcdn.net.jpg"), false);
  assert.equal(isMetaMediaUrl("http://scontent.xx.fbcdn.net/a.jpg"), false);
});

test("segments merge across accounts, biggest spend first, judged only with 3+ results", () => {
  const segments = buildSegments([
    { segment: "Instagram · Feed", stats: stats(300000, 10) },
    { segment: "Facebook · Feed", stats: stats(500000, 10) },
    { segment: "Instagram · Feed", stats: stats(100000, 5) },
    { segment: "Audience Network · Native, banner & interstitial", stats: stats(100000, 0) },
    { segment: "Messenger · Inbox", stats: stats(0, 0, 0, 0, 0) },
  ]);
  assert.deepEqual(segments.map((s) => s.segment), ["Facebook · Feed", "Instagram · Feed", "Audience Network · Native, banner & interstitial"]);
  const [fb, ig, an] = segments;
  assert.equal(ig!.spend, 400000);
  assert.equal(ig!.results, 15);
  assert.equal(fb!.spendSharePct, 50);
  // Average = 1.000.000 / 25 = 40.000; Facebook 50.000 is 25% above it, Instagram 26.667 is 33,3% below.
  assert.equal(fb!.costVsAveragePct, 25);
  assert.equal(ig!.costVsAveragePct, -33.3);
  assert.equal(an!.costPerResult, null);
  assert.equal(an!.sufficientData, false);
});

test("daily points merge per date in order with frequency", () => {
  const days = buildDaily([
    { date: "2026-09-22", stats: stats(100000, 5, 4000, 40, 2000) },
    { date: "2026-09-21", stats: stats(50000, 2, 3000, 30, 2000) },
    { date: "2026-09-22", stats: stats(100000, 5, 4000, 40, 2000) },
  ]);
  assert.deepEqual(days.map((d) => d.date), ["2026-09-21", "2026-09-22"]);
  assert.equal(days[1]!.spend, 200000);
  assert.equal(days[1]!.frequency, 2);
  assert.equal(days[0]!.ctrPct, 1);
});

test("enrichment: per-ad previous, comparison of the same ads, coverage, partial day and gaps", () => {
  const input = buildCreativeAnalysisInput([row(1, { spend: 600000, leads: 20 }), row(2, { spend: 200000, leads: 4 })], { period });
  const enriched = applyEnrichment(
    input,
    {
      previousPeriod: previousRange(period.start, 7),
      previous: { 1: stats(500000, 25) },
      daily: [{ date: "2026-09-27", stats: stats(100000, 3) }],
      placement: null,
      age: [{ segment: "25-34", stats: stats(800000, 24) }],
      gender: [],
      adDaily: { 1: { days: 2, impressions: 4000, reachSum: 3000, frequencySum: 2.7, landingPageViews: 120 } },
      gaps: ["Breakdown placement akun A gagal ditarik: x."],
    },
    { refs: [1], gaps: [] },
    "2026-09-27",
  );
  const [first, second] = enriched.ads;
  assert.equal(first!.previous!.costPerResult, 20000);
  assert.equal(first!.previous!.change.costPerResult, 50); // 30.000 vs 20.000
  assert.equal(second!.previous, null);
  assert.deepEqual([first!.dailyFrequency, first!.dailyReach, first!.landingPageViews], [1.35, 1500, 120]);
  assert.deepEqual([second!.dailyFrequency, second!.landingPageViews], [null, null], "no daily rows: no daily data, not zero");
  const comparison = enriched.enrichment!.comparison!;
  assert.equal(comparison.current.spend, 800000);
  assert.equal(comparison.previous.spend, 500000);
  assert.equal(comparison.change.results, -4);
  assert.deepEqual(enriched.enrichment!.coverage, { ads: 2, spendSharePct: 100 });
  assert.equal(enriched.enrichment!.partialLastDay, true);
  assert.deepEqual(enriched.enrichment!.breakdowns.placement, []);
  assert.equal(enriched.enrichment!.breakdowns.age[0]!.segment, "25-34");
  assert.deepEqual(enriched.enrichment!.imageRefs, [1]);
  assert.equal(enriched.enrichment!.gaps.length, 1);

  // Ads that didn't run before: no comparison, and the model is told so.
  const fresh = applyEnrichment(input, { previousPeriod: previousRange(period.start, 7), previous: {}, daily: null, placement: null, age: null, gender: null, adDaily: null, gaps: [] }, { refs: [], gaps: [] }, "2026-10-01");
  assert.equal(fresh.enrichment!.comparison, null);
  assert.match(fresh.enrichment!.gaps[0]!, /belum berjalan/);
  assert.equal(fresh.enrichment!.partialLastDay, false);

  // Internal ids stay out of the prompt.
  assert.doesNotMatch(promptPayload(enriched), /9001|adAccountId/);
  assert.match(promptPayload(enriched), /"previous"/);
});

test("result: visual kept only for ads whose image was sent, audience only with enrichment", () => {
  const input = buildCreativeAnalysisInput([row(1), row(2)], { period });
  const enriched = applyEnrichment(input, null, { refs: [1], gaps: [] }, "2026-10-01");
  const raw = {
    status: "waspada", headline: "H", summary: "S", findings: [], actions: [],
    ads: [
      { ref: 1, verdict: "pantau", problem: "p", reason: "r", suggestion: "s", visual: " Teks terlalu kecil " },
      { ref: 2, verdict: "pantau", problem: "p", reason: "r", suggestion: "s", visual: "Dikarang" },
    ],
    trend: " ",
    audience: [{ dimension: "umur", segment: "25-34", assessment: "efisien", detail: "d" }],
  };
  const withEnrichment = parseAnalysisResult(raw, enriched)!;
  assert.equal(withEnrichment.ads[0]!.visual, "Teks terlalu kecil");
  assert.equal(withEnrichment.ads[1]!.visual, undefined);
  assert.equal(withEnrichment.trend, undefined);
  assert.equal(withEnrichment.audience.length, 1);
  assert.deepEqual(parseAnalysisResult(raw, input)!.audience, []);
});

test("Meta: five insight requests per account with the owner's token, filtered to the analysed ads", async () => {
  const seen: URL[] = [];
  const fetchMock = mock.method(globalThis, "fetch", async (input: string | URL) => {
    const url = new URL(String(input));
    seen.push(url);
    const breakdowns = url.searchParams.get("breakdowns");
    const data = url.searchParams.get("level") === "ad" && url.searchParams.get("time_increment")
      ? [
          { ad_id: "9001", date_start: "2026-09-21", impressions: "2000", reach: "1000", actions: [{ action_type: "landing_page_view", value: "40" }] },
          { ad_id: "9001", date_start: "2026-09-22", impressions: "3000", reach: "2000", actions: [{ action_type: "landing_page_view", value: "60" }] },
          { ad_id: "9002", date_start: "2026-09-22", impressions: "0", reach: "0" },
        ]
      : url.searchParams.get("level") === "ad"
      ? [{ ad_id: "9001", spend: "250000", impressions: "9000", reach: "7000", inline_link_clicks: "90", actions: [{ action_type: "lead", value: "10" }] }]
      : url.searchParams.get("time_increment")
        ? [{ date_start: "2026-09-21", spend: "100000", impressions: "4000", reach: "3000", inline_link_clicks: "40", actions: [{ action_type: "lead", value: "3" }] }]
        : breakdowns === "age"
          ? [{ age: "25-34", spend: "400000", impressions: "15000", reach: "10000", inline_link_clicks: "150", actions: [{ action_type: "lead", value: "12" }] }]
          : breakdowns === "gender"
            ? { error: { message: "Service temporarily unavailable", code: 2 } }
            : [{ publisher_platform: "instagram", platform_position: "feed", spend: "400000", impressions: "15000", reach: "10000", inline_link_clicks: "150" }];
    const body = Array.isArray(data) ? { data } : data;
    return new Response(JSON.stringify(body), { status: Array.isArray(data) ? 200 : 500, headers: { "content-type": "application/json" } });
  });
  try {
    const raw = await fetchMetaEnrichment([{ ref: 1, adAccountId: 7, adId: "9001" }, { ref: 2, adAccountId: 7, adId: "9002" }], period);
    assert.equal(seen.length, 6);
    for (const url of seen) {
      assert.equal(url.pathname, "/v24.0/act_111/insights");
      assert.equal(url.searchParams.get("access_token"), "meta-test-token");
      assert.deepEqual(JSON.parse(url.searchParams.get("filtering")!), [{ field: "ad.id", operator: "IN", value: ["9001", "9002"] }]);
    }
    const previousCall = seen.find((u) => u.searchParams.get("level") === "ad" && !u.searchParams.get("time_increment"))!;
    // Daily averages: (2 + 1.5) / 2 days; a day without reach doesn't count as a day.
    assert.deepEqual(raw.adDaily![1], { days: 2, impressions: 5000, reachSum: 3000, frequencySum: 3.5, landingPageViews: 100 });
    assert.equal(raw.adDaily![2]!.days, 0);
    assert.deepEqual(JSON.parse(previousCall.searchParams.get("time_range")!), { since: "2026-09-14", until: "2026-09-20" });
    assert.deepEqual(raw.previous, { 1: { spend: 250000, impressions: 9000, reach: 7000, clicks: 90, results: 10 } });
    assert.equal(raw.daily![0]!.stats.results, 3);
    assert.equal(raw.placement![0]!.segment, "Instagram · Feed");
    assert.equal(raw.placement![0]!.stats.results, 0);
    assert.equal(raw.age![0]!.segment, "25-34");
    assert.equal(raw.gender, null);
    assert.equal(raw.gaps.length, 1);
    assert.match(raw.gaps[0]!, /^Breakdown gender akun Akun Umroh gagal ditarik/);
    assert.doesNotMatch(raw.gaps[0]!, /meta-test-token/);
  } finally {
    fetchMock.mock.restore();
  }
});

test("images: full image for image ads, 600px thumbnail otherwise, only from Meta's CDN", async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const fetchMock = mock.method(globalThis, "fetch", async (input: string | URL) => {
    const url = new URL(String(input));
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    if (url.pathname === "/v24.0/9001") return json({ creative: { id: "501", image_url: "https://scontent.xx.fbcdn.net/full.jpg" } });
    if (url.pathname === "/v24.0/9002") return json({ creative: { id: "502" } });
    if (url.pathname === "/v24.0/502") {
      assert.equal(url.searchParams.get("thumbnail_width"), "600");
      return json({ thumbnail_url: "https://scontent.xx.fbcdn.net/thumb.jpg" });
    }
    if (url.pathname === "/v24.0/9003") return json({ creative: { id: "503", image_url: "https://example.com/not-meta.jpg" } });
    if (url.hostname.endsWith("fbcdn.net")) return new Response(jpeg, { headers: { "content-type": "image/jpeg" } });
    throw new Error(`unexpected ${url}`);
  });
  try {
    const { images, gaps } = await fetchCreativeImages([
      { ref: 1, adAccountId: 7, adId: "9001" },
      { ref: 2, adAccountId: 7, adId: "9002" },
      { ref: 3, adAccountId: 7, adId: "9003" },
    ]);
    assert.deepEqual(images.map((i) => [i.ref, i.mediaType, i.data]), [
      [1, "image/jpeg", jpeg.toString("base64")],
      [2, "image/jpeg", jpeg.toString("base64")],
    ]);
    assert.match(gaps[0]!, /1 iklan tidak bisa diambil/);
    assert.equal(fetchMock.mock.calls.some((c) => String(c.arguments[0]).includes("example.com")), false);
  } finally {
    fetchMock.mock.restore();
  }
});
