import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { encryptSecret } from "./secret-box";
import { db } from "@/db";
process.env.AUTH_SECRET = "fixture-encryption-key";
mock.method(db.$client, "query", async () => ({ rows: [["shared.meta.access_token", encryptSecret("meta-test-secret"), 1, new Date().toISOString()]] }));

import { fetchCampaignBreakdowns } from "./campaign-breakdown";
after(async () => { await db.$client.end(); });

test("Meta: one account-level request per list for many campaigns, split back per campaign", async () => {
  const original = global.fetch;
  const urls: URL[] = [];
  global.fetch = async (input) => {
    const url = new URL(String(input));
    urls.push(url);
    const path = url.pathname;
    if (path.endsWith("/act_77")) return Response.json({ currency: "IDR" });
    if (path.endsWith("/adsets")) return Response.json({ data: [
      { id: "s1", name: "Broad", campaign_id: "100", effective_status: "ACTIVE", daily_budget: "150000", optimization_goal: "LEAD_GENERATION", targeting: { age_min: 18, age_max: 35, geo_locations: { countries: ["ID"] } } },
      { id: "s2", name: "Retarget", campaign_id: "200", effective_status: "PAUSED" },
    ] });
    if (path.endsWith("/ads")) return Response.json({ data: [
      { id: "a1", name: "Video 1", campaign_id: "100", adset_id: "s1", effective_status: "ACTIVE", creative: { thumbnail_url: "https://scontent.xx.fbcdn.net/t.jpg" } },
      { id: "a2", name: "Gambar", campaign_id: "200", adset_id: "s2", effective_status: "PAUSED", creative: { thumbnail_url: "https://evil.example/t.jpg" } },
    ] });
    if (path.endsWith("/insights") && url.searchParams.get("level") === "adset") return Response.json({ data: [
      { campaign_id: "100", adset_id: "s1", adset_name: "Broad", spend: "50000", impressions: "4000", actions: [{ action_type: "lead", value: "5" }] },
    ] });
    if (path.endsWith("/insights")) return Response.json({ data: [
      { campaign_id: "100", adset_id: "s1", ad_id: "a1", ad_name: "Video 1", spend: "50000", impressions: "4000", actions: [{ action_type: "lead", value: "5" }] },
    ] });
    return Response.json({ error: { message: "unexpected" } }, { status: 400 });
  };
  try {
    const res = await fetchCampaignBreakdowns({ platform: "meta", accountId: "act_77" }, ["100", "200", "300"], "2026-10-01", "2026-10-08");
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.equal(urls.length, 5);
    for (const u of urls.filter((u) => u.searchParams.has("filtering"))) assert.deepEqual(JSON.parse(u.searchParams.get("filtering")!)[0].value, ["100", "200", "300"]);
    const first = res.breakdowns.get("100")!;
    assert.deepEqual(first.adsets.map((s) => [s.name, s.dailyBudget, s.audience, s.metrics.spent, s.metrics.leads]), [["Broad", 150000, "18–35 · ID", 50000, 5]]);
    assert.equal(first.adsets[0]!.ads[0]!.thumbnailUrl, "https://scontent.xx.fbcdn.net/t.jpg");
    const second = res.breakdowns.get("200")!;
    assert.deepEqual(second.adsets.map((s) => [s.name, s.status, s.metrics.spent]), [["Retarget", "paused", 0]]);
    assert.equal(second.adsets[0]!.ads[0]!.thumbnailUrl, null); // not Meta's CDN
    assert.deepEqual(res.breakdowns.get("300")!.adsets, []);
    // The token never leaks into an error.
    global.fetch = async () => { throw new Error("connect ECONNREFUSED https://graph.facebook.com/?access_token=meta-test-secret"); };
    const failed = await fetchCampaignBreakdowns({ platform: "meta", accountId: "77" }, ["100"], "2026-10-01", "2026-10-08");
    assert.ok(!failed.ok && !failed.error.includes("meta-test-secret"));
  } finally {
    global.fetch = original;
  }
});

test("rejects bad ids and periods without calling the API", async () => {
  assert.deepEqual(await fetchCampaignBreakdowns({ platform: "meta", accountId: "77" }, ["1 OR 1=1"], "2026-10-01", "2026-10-08"), { ok: false, error: "ID campaign tidak valid." });
  assert.deepEqual(await fetchCampaignBreakdowns({ platform: "google", accountId: "77" }, ["1"], "2026-10-08", "2026-10-01"), { ok: false, error: "Periode tidak valid." });
});
