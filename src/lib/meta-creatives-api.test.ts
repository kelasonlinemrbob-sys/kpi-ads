import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { encryptSecret } from "./secret-box";
import { db } from "@/db";
import { fetchMetaAdContents } from "./meta-creatives-api";
import { creativePeriod, validCreativeRange } from "./creative-period";
process.env.AUTH_SECRET = "fixture-encryption-key";
mock.method(db.$client, "query", async () => ({ rows: [
  ["user.1.google.connection", encryptSecret(JSON.stringify({ credentials: { clientId: "test-only", clientSecret: "test-only", refreshToken: "test-only", loginCustomerId: "" } })), 1, new Date().toISOString()],
  ["user.1.meta.access_token", encryptSecret("meta-test-secret"), 1, new Date().toISOString()],
] }));

process.env.META_ACCESS_TOKEN = "meta-test-secret";
after(async () => { await db.$client.end(); });
const stats = (id: string) => ({ ad_id: id, ad_name: `Ad ${id}`, impressions: "100", reach: "80", spend: "5000", inline_link_clicks: "10", actions: [{ action_type: "lead", value: "2" }], video_avg_time_watched_actions: [{ action_type: "video_view", value: "4.5" }] });
const ad = (id: string) => ({ id, name: `Ad ${id}`, effective_status: "ACTIVE", created_time: "2020-01-01T00:00:00+0700", campaign: { id: "10", name: "Campaign" }, creative: { object_type: "VIDEO", video_id: "42", effective_object_story_id: "11_22" } });
test("bounded periods include today across month/year boundaries; lifetime requests rejected", () => {
  assert.deepEqual(creativePeriod("14d", "2026-01-05"), { key: "14d", days: 14, start: "2025-12-23", end: "2026-01-05", label: "14 hari terakhir" });
  assert.equal(creativePeriod("30d", "2024-03-01").start, "2024-02-01");
  assert.equal(creativePeriod("maximum", "2026-10-05").key, "7d");
  assert.equal(validCreativeRange("2026-01-01", "2026-02-01"), false);
  assert.equal(validCreativeRange("2026-02-30", "2026-03-01"), false);
});
test("range is applied at Meta, pagination kept, only delivered ads' metadata fetched (even old ads)", async () => {
  const original = global.fetch; const urls: URL[] = [];
  global.fetch = async (input) => {
    const url = new URL(String(input)); urls.push(url);
    if (url.pathname.endsWith("/insights")) {
      assert.equal(url.searchParams.has("date_preset"), false);
      assert.deepEqual(JSON.parse(url.searchParams.get("time_range")!), { since: "2026-09-29", until: "2026-10-05" });
      if (!url.searchParams.has("after")) { const next = new URL(url); next.searchParams.set("after", "page2"); return Response.json({ data: [stats("1")], paging: { next: next.toString() } }); }
      return Response.json({ data: [stats("2")] });
    }
    assert.equal(url.searchParams.has("ids"), false);
    const id = url.pathname.split("/").at(-1)!; assert.ok(["1", "2"].includes(id));
    return Response.json(ad(id));
  };
  try {
    const result = await fetchMetaAdContents("123", "2026-09-29", "2026-10-05", 1); assert.ok(result.ok); if (!result.ok) return;
    assert.equal(result.ads.length, 2); assert.equal(result.ads[0].reach, 80); assert.equal(result.ads[0].avgPlayTime, 4.5);
    assert.equal(result.ads[0].createdAt?.slice(0, 4), "2020"); assert.equal(result.ads[0].permalink, "https://www.facebook.com/11/posts/22/");
    assert.ok(urls.every((u) => !u.pathname.endsWith("/ads")));
  } finally { global.fetch = original; }
});
test("reduce-data response shrinks pages; metadata uses small individual requests and reach stays whole-window", async () => {
  const original = global.fetch; const limits: number[] = []; const ids: string[] = [];
  global.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/insights")) {
      const limit = Number(url.searchParams.get("limit")); limits.push(limit);
      if (limit > 10) return Response.json({ error: { message: "Please reduce the amount of data you're asking for", code: 1 } }, { status: 400 });
      return Response.json({ data: [stats("1"), stats("2")] });
    }
    const id = url.pathname.split("/").at(-1)!; ids.push(id);
    return Response.json(ad(id));
  };
  try {
    const result = await fetchMetaAdContents("123", "2026-09-06", "2026-10-05", 1); assert.ok(result.ok);
    assert.deepEqual(limits, [50, 10]); assert.deepEqual(ids.sort(), ["1", "2"]);
  } finally { global.fetch = original; }
});
test("empty range does not fetch an all-time ad inventory", async () => {
  const original = global.fetch; let calls = 0;
  global.fetch = async () => { calls++; return Response.json({ data: [] }); };
  try { const result = await fetchMetaAdContents("123", "2026-09-29", "2026-10-05", 1); assert.deepEqual(result, { ok: true, ads: [] }); assert.equal(calls, 1); }
  finally { global.fetch = original; }
});
test("late-page failures return no partial ads, retries terminate, network errors hide tokens", async () => {
  const original = global.fetch; let calls = 0;
  global.fetch = async () => { calls++; return Response.json({ error: { message: "Please reduce the amount of data", code: 1 } }, { status: 400 }); };
  try {
    let result = await fetchMetaAdContents("123", "2026-09-29", "2026-10-05", 1); assert.equal(result.ok, false); assert.equal(calls, 3);
    global.fetch = async (input) => { const url = new URL(String(input)); if (url.searchParams.has("after")) throw new Error("URL meta-test-secret"); url.searchParams.set("after", "2"); return Response.json({ data: [stats("1")], paging: { next: url.toString() } }); };
    result = await fetchMetaAdContents("123", "2026-09-29", "2026-10-05", 1); assert.equal(result.ok, false); assert.ok(!JSON.stringify(result).includes("meta-test-secret")); assert.ok(!("ads" in result));
  } finally { global.fetch = original; }
});
