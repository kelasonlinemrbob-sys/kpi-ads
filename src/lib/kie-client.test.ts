import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

/** A stand-in for Kie's Anthropic-compatible endpoint that streams the JSON answer back as text. */
const seen: { path?: string; headers?: IncomingHttpHeaders; body?: Record<string, unknown> } = {};
const bodies: Record<string, unknown>[] = [];
/** When set, requests carrying an image get a 400, like a proxy without image support. */
let rejectImages = false;
const report = {
  status: "sehat",
  headline: "Hasil sesuai target.",
  summary: "Ringkas.",
  findings: [],
  actions: [],
  ads: [{ ref: 1, verdict: "pertahankan", problem: "Tidak ada masalah besar", reason: "Murah", suggestion: "Biarkan" }],
};
const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    Object.assign(seen, { path: req.url, headers: req.headers, body: JSON.parse(raw) });
    bodies.push(JSON.parse(raw));
    if (rejectImages && raw.includes('"type":"image"')) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "image blocks are not supported" } }));
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send("message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 900, output_tokens: 1 } } });
    send("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    const json = JSON.stringify(report);
    for (const part of [json.slice(0, 40), json.slice(40)]) {
      send("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: part } });
    }
    send("content_block_stop", { type: "content_block_stop", index: 0 });
    send("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 300 } });
    send("message_stop", { type: "message_stop" });
    res.end();
  });
});

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.KIE_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/claude`;
  process.env.ANTHROPIC_API_KEY = "must-not-be-sent";
});
after(() => server.close());

test("analysis goes to Kie's /claude/v1/messages with the user's key, without tools, and reads the streamed JSON", async () => {
  const { buildCreativeAnalysisInput, runCreativeAnalysis } = await import("./ai-ads-analysis");
  const input = buildCreativeAnalysisInput(
    [{ id: 1, adAccountId: 1, externalAdId: "23851", accountName: "A", adName: "Iklan 1", campaignName: null, adType: "", permalink: null, thumbnailUrl: null, label: null, status: "active", platformStatus: null, format: "grafis", detectedFormat: "grafis", formatOverridden: false, creatorId: null, editorId: null, impressions: 5000, reach: 4000, videoViews: 0, avgPlayTime: null, thruplays: 0, spend: 100000, clicks: 50, leads: 5, postId: null, advertiser: null, product: null, adCreatedAt: null, syncedAt: "2026-09-27T00:00:00Z" }],
    { period: { start: "2026-09-21", end: "2026-09-27", days: 7, label: "7 hari terakhir" } },
  );
  const run = await runCreativeAnalysis("kie-user-key", input, [], "claude");

  assert.equal(seen.path, "/claude/v1/messages");
  assert.equal(seen.headers?.authorization, "Bearer kie-user-key");
  assert.equal(seen.headers?.["x-api-key"], undefined);
  assert.equal(seen.body?.model, "claude-opus-5-5");
  assert.equal(seen.body?.stream, true);
  assert.equal(seen.body?.tools, undefined, "Kie answers requests with tools with a 503");
  assert.equal(seen.body?.tool_choice, undefined);
  assert.equal(typeof (seen.body?.messages as { content: unknown }[])[0]!.content, "string");
  assert.match(String(seen.body?.system), /"required":\["status","headline"/);
  assert.equal(seen.body?.temperature, undefined);
  assert.equal(run.ok, true);
  assert.equal(run.ok && run.result.ads[0]!.verdict, "pertahankan");
  assert.equal(run.inputTokens, 900);
  assert.equal(run.outputTokens, 300);
});

test("images go after the data, labelled by ref; when Kie rejects them the analysis reruns without", async () => {
  const { buildCreativeAnalysisInput, runCreativeAnalysis } = await import("./ai-ads-analysis");
  const base = buildCreativeAnalysisInput(
    [{ id: 1, adAccountId: 1, externalAdId: "23851", accountName: "A", adName: "Iklan 1", campaignName: null, adType: "", permalink: null, thumbnailUrl: null, label: null, status: "active", platformStatus: null, format: "grafis", detectedFormat: "grafis", formatOverridden: false, creatorId: null, editorId: null, impressions: 5000, reach: 4000, videoViews: 0, avgPlayTime: null, thruplays: 0, spend: 100000, clicks: 50, leads: 5, postId: null, advertiser: null, product: null, adCreatedAt: null, syncedAt: "2026-09-27T00:00:00Z" }],
    { period: { start: "2026-09-21", end: "2026-09-27", days: 7, label: "7 hari terakhir" } },
  );
  const input = { ...base, enrichment: { coverage: { ads: 1, spendSharePct: 100 }, comparison: null, daily: [], partialLastDay: false, breakdowns: { placement: [], age: [], gender: [] }, imageRefs: [1], gaps: [] } };
  const images = [{ ref: 1, mediaType: "image/jpeg" as const, data: "/9j/AA==" }];

  bodies.length = 0;
  const accepted = await runCreativeAnalysis("kie-user-key", input, images, "claude");
  const content = (bodies[0]!.messages as { content: { type: string; text?: string }[] }[])[0]!.content;
  assert.deepEqual(content.map((b) => b.type), ["text", "text", "image"]);
  assert.equal(content[1]!.text, "Gambar creative iklan ref 1:");
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.input.enrichment!.imageRefs, [1]);

  rejectImages = true;
  bodies.length = 0;
  try {
    const retried = await runCreativeAnalysis("kie-user-key", input, images, "claude");
    assert.equal(bodies.length, 2);
    assert.equal(JSON.stringify(bodies[1]).includes('"type":"image"'), false);
    assert.equal(retried.ok, true);
    assert.deepEqual(retried.input.enrichment!.imageRefs, []);
    assert.match(retried.input.enrichment!.gaps.at(-1)!, /menolak gambar/);
  } finally {
    rejectImages = false;
  }
});
