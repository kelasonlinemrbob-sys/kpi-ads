import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { db } from "@/db";
import { encryptSecret } from "./secret-box";
import { buildContentAnalysisInput, contentPrompt, parseContentResult, postKeyOf, runContentAnalysis, withMedia } from "./ai-content-analysis";
import { creativeCopy, fetchCreativeMedia, type CreativeMedia } from "./creative-media";
import type { CreativeRow } from "./creatives-data";
import { generateGeminiJson } from "./kie-gemini";
import { buildCreativeAnalysisInput, runCreativeAnalysis } from "./ai-ads-analysis";

process.env.AUTH_SECRET = "fixture-encryption-key";
const now = new Date().toISOString();
mock.method(db.$client, "query", async (q: { text?: string } | string) => {
  const sql = typeof q === "string" ? q : (q.text ?? "");
  if (sql.includes('"ad_accounts"')) return { rows: [[7, "meta", "111", "Akun Kelas", null, 1, null, null, now]] };
  return { rows: [["shared.meta.access_token", encryptSecret("meta-test-token"), 1, now]] };
});
after(async () => {
  await db.$client.end();
});

const period = { start: "2026-10-01", end: "2026-10-07", days: 7, label: "7 hari terakhir" };
function row(id: number, patch: Partial<CreativeRow> = {}): CreativeRow {
  return {
    id, adAccountId: 7, externalAdId: `900${id}`, accountName: "Akun Kelas", adName: `Iklan ${id}`, campaignName: "New Traffic campaign", adType: "Iklan awareness",
    permalink: null, thumbnailUrl: null, label: null, status: "active", platformStatus: "ACTIVE", format: "video", detectedFormat: "video",
    formatOverridden: false, creatorId: null, editorId: null, impressions: 128063, reach: 123875, videoViews: 12916, avgPlayTime: 2, thruplays: 1774,
    spend: 138876, clicks: 57, leads: 0, postId: "11_22", advertiser: { id: 1, name: "Wahib" }, product: "Kelas Online Mr.BOB", adCreatedAt: "2026-09-30T00:00:00Z", syncedAt: now, ...patch,
  };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const gemini = (text: string, credits = 0.06, finishReason = "STOP") =>
  json({ candidates: [{ finishReason, content: { role: "model", parts: [{ text: "berpikir…", thought: true }, { text }] } }], usageMetadata: { promptTokenCount: 1100, candidatesTokenCount: 400, thoughtsTokenCount: 300 }, credits_consumed: credits });

const answer = {
  score: 12,
  verdict: "Perbaiki",
  suggestedLabel: "Sangat Baik",
  summary: "Hook lemah.",
  hook: { firstSeconds: "Wanita berhijab melambai di depan tirai.", assessment: "Tidak ada kalimat pembuka.", score: "4" },
  message: "Penawaran tidak jelas.",
  visual: "Pencahayaan gelap.",
  copy: "Headline umum.",
  metricsLink: "Hook rate 10,1% di bawah rata-rata.",
  moments: [{ second: 40, note: "akhir" }, { second: 3, note: "Teks muncul" }, { second: 0, note: "Mulai" }],
  improvements: Array.from({ length: 7 }, (_, i) => ({ title: `S${i}`, detail: "d" })),
  ideas: [{ hook: "Masih takut ngomong Inggris?", concept: "Testimoni siswa" }],
};

test("input: content numbers against the period average, video rates, the biggest ad as source", () => {
  const post = [row(1), row(2, { spend: 20000, impressions: 10000, reach: 9000, clicks: 30, videoViews: 3000, thruplays: 500 })];
  const other = row(3, { postId: "33_44", format: "grafis", impressions: 50000, reach: 40000, clicks: 500, spend: 100000, leads: 10, videoViews: 0, thruplays: 0 });
  const input = buildContentAnalysisInput(post, [...post, other], { period, today: "2026-10-07" });
  assert.equal(input.postKey, "11_22");
  assert.equal(input.numbers.impressions, 138063);
  assert.equal(input.numbers.spend, 158876);
  assert.equal(input.numbers.ctrPct, 0.06);
  assert.equal(input.numbers.hookRatePct, 11.5);
  assert.equal(input.numbers.results, 0);
  assert.equal(input.numbers.costPerResult, null);
  assert.equal(input.periodAverage.contents, 2);
  assert.equal(input.periodAverage.hookRatePct, 11.5); // video-only, the image content doesn't dilute it
  assert.equal(input.sufficientData, true);
  assert.equal(input.content.daysRunning, 7);
  assert.deepEqual(input.source, { adAccountId: 7, adId: "9001" });
  assert.equal(postKeyOf({ postId: null, id: 5 }), "ad-5");
  assert.doesNotMatch(contentPrompt(input), /9001|adAccountId/);
});

test("result: lenient enums and scores, timeline only for a watched video within its length", () => {
  const video = { videoSent: true, videoSeconds: 30, kind: "video" as const, imagesSent: 0, coverOnly: false };
  const r = parseContentResult("```json\n" + JSON.stringify(answer) + "\n```", { media: video })!;
  assert.equal(r.score, 10);
  assert.equal(r.verdict, "perbaiki");
  assert.equal(r.suggestedLabel, null);
  assert.equal(r.hook.score, 4);
  assert.deepEqual(r.moments.map((m) => m.second), [0, 3]);
  assert.equal(r.improvements.length, 5);
  const cover = parseContentResult(JSON.stringify(answer), { media: { ...video, videoSent: false, coverOnly: true } })!;
  assert.deepEqual(cover.moments, []);
  assert.equal(parseContentResult(JSON.stringify({ ...answer, verdict: "matikan" }), { media: video }), null);
  assert.equal(parseContentResult("bukan json", { media: video }), null);
});

test("ad copy is found in the creative, the post spec or dynamic creative assets", () => {
  assert.deepEqual(creativeCopy({ body: " Belajar ", title: "Kelas", call_to_action_type: "LEARN_MORE" }), { primaryText: "Belajar", headline: "Kelas", description: null, cta: "LEARN_MORE" });
  assert.deepEqual(creativeCopy({ object_story_spec: { video_data: { message: "Msg", title: "T", call_to_action: { type: "SIGN_UP" } } } }), { primaryText: "Msg", headline: "T", description: null, cta: "SIGN_UP" });
  assert.deepEqual(creativeCopy({ asset_feed_spec: { bodies: [{ text: "B" }], titles: [{ text: "H" }], call_to_action_types: ["WHATSAPP_MESSAGE"] } }).cta, "WHATSAPP_MESSAGE");
});

test("media: video file URL from Meta with its cover; cover only when the file isn't readable", async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9]);
  let videoSource: string | undefined = "https://video.xx.fbcdn.net/v/ad.mp4?oh=1";
  let pageTokenFails = false;
  const fetchMock = mock.method(globalThis, "fetch", async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/v24.0/9001") {
      assert.equal(url.searchParams.get("access_token"), "meta-test-token");
      return json({ creative: { id: "501", video_id: "777", effective_object_story_id: "55_66", body: "Belajar Inggris 30 hari", title: "Kelas Online" } });
    }
    if (url.pathname === "/v24.0/777") {
      // Like Meta: the System User token reads the length but not the file; the Page token gets `source`.
      if (url.searchParams.get("access_token") !== "page-token") return json({ id: "777", length: 31.6 });
      return json({ source: videoSource, length: 31.6 });
    }
    if (url.pathname === "/v24.0/55") return pageTokenFails ? json({ error: { message: "(#100) requires pages_read_engagement", code: 100 } }, 400) : json({ access_token: "page-token" });
    if (url.pathname === "/v24.0/501") return json({ thumbnail_url: "https://scontent.xx.fbcdn.net/cover.jpg" });
    if (url.hostname.endsWith("fbcdn.net")) return new Response(jpeg, { headers: { "content-type": "image/jpeg" } });
    throw new Error(`unexpected ${url}`);
  });
  try {
    const media = await fetchCreativeMedia({ adAccountId: 7, adId: "9001" });
    assert.equal(media.kind, "video");
    assert.equal(media.videoUrl, videoSource);
    assert.equal(media.videoSeconds, 32);
    assert.equal(media.cover?.data, jpeg.toString("base64"));
    assert.deepEqual(media.images, []);
    assert.equal(media.copy.primaryText, "Belajar Inggris 30 hari");
    assert.deepEqual(media.gaps, []);

    pageTokenFails = true;
    const coverOnly = await fetchCreativeMedia({ adAccountId: 7, adId: "9001" });
    assert.equal(coverOnly.videoUrl, null);
    assert.equal(coverOnly.images.length, 1);
    assert.match(coverOnly.gaps[0]!, /hanya cover video.*pages_read_engagement/);
  } finally {
    fetchMock.mock.restore();
  }
});

test("Gemini client: Kie errors inside HTTP 200, credit message, thought parts skipped", async () => {
  const replies = [json({ code: 500, msg: "Server exception, please try again later" }), json({ code: 402, msg: "Insufficient" }), gemini('{"a":1}', 0.12)];
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchMock = mock.method(globalThis, "fetch", async (input: string | URL, init: RequestInit) => {
    seen.push({ url: String(input), init });
    return replies.shift()!;
  });
  try {
    const call = () => generateGeminiJson({ apiKey: "kie-key", system: "S", parts: [{ text: "hi" }] });
    const server = await call();
    assert.equal(server.ok, false);
    assert.match(!server.ok ? server.error : "", /server exception/);
    const credit = await call();
    assert.match(!credit.ok ? credit.error : "", /Saldo kredit/);
    const ok = await call();
    assert.deepEqual(ok.ok && [ok.text, ok.credits, ok.promptTokens, ok.outputTokens], ['{"a":1}', 0.12, 1100, 700]);

    assert.equal(seen[0]!.url, "https://api.kie.ai/gemini/v1/models/gemini-3-8-flash:streamGenerateContent");
    assert.equal((seen[0]!.init.headers as Record<string, string>).Authorization, "Bearer kie-key");
    const body = JSON.parse(String(seen[0]!.init.body));
    assert.equal(body.stream, false);
    assert.equal(body.systemInstruction.parts[0].text, "S");
    assert.equal(body.generationConfig.responseMimeType, "application/json");
  } finally {
    fetchMock.mock.restore();
  }
});

test("run: the video goes first as a file URL; when Gemini can't process it, the cover is judged and noted", async () => {
  const base = buildContentAnalysisInput([row(1)], [row(1)], { period, today: "2026-10-07" });
  const media: CreativeMedia = {
    kind: "video", videoUrl: "https://video.xx.fbcdn.net/ad.mp4", videoSeconds: 30, images: [],
    cover: { mediaType: "image/jpeg", data: "/9j/AA==" }, copy: { primaryText: "Belajar", headline: null, description: null, cta: null }, gaps: [],
  };
  const { parts, input } = withMedia(base, media);
  assert.deepEqual(parts, [{ file_data: { mime_type: "video/mp4", file_uri: "https://video.xx.fbcdn.net/ad.mp4" } }]);
  assert.equal(input.media.videoSent, true);

  const bodies: { contents: { parts: Record<string, unknown>[] }[] }[] = [];
  const replies = [json({ code: 500, msg: "Server exception" }), gemini(JSON.stringify({ ...answer, verdict: "ganti", suggestedLabel: "poor" }), 0.05)];
  const fetchMock = mock.method(globalThis, "fetch", async (_input: string | URL, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return replies.shift()!;
  });
  try {
    const run = await runContentAnalysis("kie-key", base, media);
    assert.equal(run.ok, true);
    assert.equal(bodies.length, 2);
    assert.ok("file_data" in bodies[0]!.contents[0]!.parts[0]!);
    assert.ok("inline_data" in bodies[1]!.contents[0]!.parts[0]!);
    assert.equal(run.input.media.coverOnly, true);
    assert.match(run.input.gaps.at(-1)!, /cover video/);
    assert.equal(run.ok && run.result.suggestedLabel, "poor");
    assert.deepEqual(run.ok && run.result.moments, []);
    assert.equal(run.credits, 0.05);
  } finally {
    fetchMock.mock.restore();
  }
});

test("Ringkasan on Gemini: images labelled by ref before the data; a wrong JSON shape is retried once", async () => {
  const base = buildCreativeAnalysisInput([row(1), row(2, { postId: "33_44", spend: 5000 })], { period });
  const input = { ...base, enrichment: { coverage: { ads: 2, spendSharePct: 100 }, comparison: null, daily: [], partialLastDay: false, breakdowns: { placement: [], age: [], gender: [] }, imageRefs: [1], gaps: [] } };
  const report = {
    status: "waspada", headline: "H", summary: "S", findings: [], actions: [],
    ads: [{ ref: 1, verdict: "pantau", problem: "p", reason: "r", suggestion: "s", visual: "Cahaya gelap" }, { ref: 2, verdict: "pantau", problem: "p", reason: "r", suggestion: "s" }],
  };
  const bodies: { systemInstruction: { parts: { text: string }[] }; contents: { parts: Record<string, unknown>[] }[] }[] = [];
  const replies = [gemini('{"status":"aman"}', 0.1), gemini(JSON.stringify(report), 0.2)];
  const fetchMock = mock.method(globalThis, "fetch", async (_input: string | URL, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return replies.shift()!;
  });
  try {
    const run = await runCreativeAnalysis("kie-key", input, [{ ref: 1, mediaType: "image/jpeg", data: "/9j/AA==" }], "gemini");
    assert.equal(bodies.length, 2);
    const parts = bodies[0]!.contents[0]!.parts;
    assert.deepEqual(parts.map((p) => Object.keys(p)[0]), ["text", "inline_data", "text"]);
    assert.equal(parts[0]!.text, "Gambar creative iklan ref 1:");
    assert.match(String(parts[2]!.text), /^Analisa data iklan berikut/);
    assert.match(bodies[0]!.systemInstruction.parts[0]!.text, /"required":\["status","headline"/);
    assert.equal(run.ok, true);
    assert.equal(run.ok && run.result.ads[0]!.visual, "Cahaya gelap");
    assert.equal(run.model, "gemini-3-8-flash");
    assert.equal(Math.round((run.credits ?? 0) * 100), 30);
  } finally {
    fetchMock.mock.restore();
  }
});
