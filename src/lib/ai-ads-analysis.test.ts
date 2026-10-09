import assert from "node:assert/strict";
import { test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { buildCreativeAnalysisInput, MAX_ANALYSED_ADS, parseAnalysisResult, readAnalysisMessage } from "./ai-ads-analysis";
import type { CreativeRow } from "./creatives-data";
import { estimateKieCredits, kieErrorMessage } from "./kie-client";

const period = { start: "2026-09-21", end: "2026-09-27", days: 7, label: "7 hari terakhir" };

function row(id: number, patch: Partial<CreativeRow> = {}): CreativeRow {
  return {
    id,
    adAccountId: 1,
    externalAdId: `2385${id}`,
    accountName: "Akun A",
    adName: `Iklan ${id}`,
    campaignName: "[UMROH] Broad",
    adType: "Iklan lead",
    permalink: null,
    thumbnailUrl: null,
    label: null,
    status: "active",
    platformStatus: "ACTIVE",
    format: "video",
    detectedFormat: "video",
    formatOverridden: false,
    creatorId: null,
    editorId: null,
    impressions: 10000,
    reach: 8000,
    videoViews: 3000,
    avgPlayTime: 6.25,
    thruplays: 450,
    spend: 300000,
    clicks: 100,
    leads: 10,
    postId: null,
    advertiser: null,
    product: "Umroh",
    adCreatedAt: "2026-09-17T05:00:00.000Z",
    syncedAt: "2026-09-27T05:00:00.000Z",
    ...patch,
  };
}

test("input: computed rates, biggest spend first, video-only hook/hold and low-data flag", () => {
  const input = buildCreativeAnalysisInput(
    [row(1, { spend: 100000 }), row(2, { spend: 500000 }), row(3, { format: "grafis", impressions: 500, clicks: 4, reach: 400 })],
    { period, targetCostPerResult: 30000, businessContext: "  closing 1%  " },
  );
  assert.deepEqual(input.ads.map((a) => a.name), ["Iklan 2", "Iklan 3", "Iklan 1"]);
  const top = input.ads[0]!;
  assert.equal(top.ref, 1);
  assert.equal(top.ctrPct, 1);
  assert.equal(top.cpm, 50000);
  assert.equal(top.cpc, 5000);
  assert.equal(top.costPerResult, 50000);
  assert.equal(top.frequency, 1.25);
  assert.equal(top.hookRatePct, 30);
  assert.equal(top.holdRatePct, 15);
  assert.equal(top.daysRunning, 10);
  assert.equal(top.sufficientData, true);
  const image = input.ads[1]!;
  assert.equal(image.hookRatePct, null);
  assert.equal(image.avgWatchSeconds, null);
  assert.equal(image.sufficientData, false);
  assert.equal(input.totals.ads, 3);
  assert.equal(input.totals.results, 30);
  assert.equal(input.businessContext, "closing 1%");
  assert.equal(input.targetCostPerResult, 30000);
  assert.equal(input.others, null);
});

test("input: ads beyond the limit are summed into one line", () => {
  const rows = Array.from({ length: MAX_ANALYSED_ADS + 3 }, (_, i) => row(i + 1, { spend: 1000 * (i + 1), leads: 1 }));
  const input = buildCreativeAnalysisInput(rows, { period });
  assert.equal(input.ads.length, MAX_ANALYSED_ADS);
  assert.deepEqual(input.others, { ads: 3, spend: 6000, results: 3 });
  assert.equal(input.totals.ads, MAX_ANALYSED_ADS + 3);
});

const sample = {
  status: "waspada",
  headline: "146 hasil dengan Rp23.074 per hasil.",
  summary: "Ringkas.",
  findings: [{ title: "Terbaik", detail: "Iklan 1" }],
  actions: [{ title: "Ganti creative", detail: "Iklan 2 mahal.", refs: [2, 99] }],
  ads: [
    { ref: 2, verdict: "ganti", problem: "CTR rendah", reason: "0,4%", suggestion: "Buat hook baru" },
    { ref: 1, verdict: "pertahankan", problem: "Tidak ada masalah besar", reason: "Murah", suggestion: "Biarkan" },
    { ref: 1, verdict: "ganti", problem: "dobel", reason: "", suggestion: "" },
    { ref: 7, verdict: "pantau", problem: "tidak dikirim", reason: "", suggestion: "" },
  ],
  dataNotes: "  ",
};
const input = { ads: [{ ref: 1 }, { ref: 2 }] } as Parameters<typeof parseAnalysisResult>[1];

test("result: unknown and repeated refs dropped, empty notes removed", () => {
  const result = parseAnalysisResult(sample, input)!;
  assert.deepEqual(result.ads.map((a) => [a.ref, a.verdict]), [[1, "pertahankan"], [2, "ganti"]]);
  assert.deepEqual(result.actions[0]!.refs, [2]);
  assert.equal(result.dataNotes, undefined);
  assert.equal(parseAnalysisResult({ ...sample, status: "bagus" }, input), null);
});

function message(patch: Partial<Anthropic.Message>): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 8000, output_tokens: 2000 },
    ...patch,
  } as Anthropic.Message;
}

test("message: JSON answer (also in a code fence), refusal and truncation", () => {
  const plain = readAnalysisMessage(message({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(sample), citations: null } as Anthropic.TextBlock] }), input);
  assert.equal(plain.ok, true);
  assert.equal(plain.ok && plain.inputTokens, 8000);

  const fenced = readAnalysisMessage(message({ stop_reason: "end_turn", content: [{ type: "text", text: "```json\n" + JSON.stringify(sample) + "\n```", citations: null } as Anthropic.TextBlock] }), input);
  assert.equal(fenced.ok, true);

  const textJson = readAnalysisMessage(message({ stop_reason: "end_turn", content: [{ type: "text", text: `Berikut:\n${JSON.stringify(sample)}`, citations: null } as Anthropic.TextBlock] }), input);
  assert.equal(textJson.ok, true);

  const refusal = readAnalysisMessage(message({ stop_reason: "refusal" }), input);
  assert.equal(refusal.ok, false);
  assert.match(!refusal.ok ? refusal.error : "", /menolak/);

  const cut = readAnalysisMessage(message({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"status": "sehat"', citations: null } as Anthropic.TextBlock] }), input);
  assert.match(!cut.ok ? cut.error : "", /terpotong/);
});

test("Kie errors and credit estimate", () => {
  assert.match(kieErrorMessage(Anthropic.APIError.generate(401, { error: { message: "bad key" } }, "bad key", new Headers())), /API key Kie\.ai tidak valid/);
  assert.match(kieErrorMessage(Anthropic.APIError.generate(402, { error: { message: "no credit" } }, "no credit", new Headers())), /Saldo kredit Kie\.ai habis/);
  assert.match(kieErrorMessage(Anthropic.APIError.generate(429, undefined, "slow down", new Headers())), /Terlalu banyak/);
  assert.match(kieErrorMessage(new Anthropic.APIConnectionError({ message: "down" })), /Gagal menghubungi/);
  assert.equal(estimateKieCredits({ inputTokens: 1_000_000, outputTokens: 1_000_000 }), 1920);
});
