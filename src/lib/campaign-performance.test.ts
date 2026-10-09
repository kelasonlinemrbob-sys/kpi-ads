import assert from "node:assert/strict";
import { after, test, mock } from "node:test";
import { encryptSecret } from "./secret-box";
import { db } from "@/db";
process.env.AUTH_SECRET = "fixture-encryption-key";
mock.method(db.$client, "query", async () => ({ rows: [
  ["shared.google_ads.connection", encryptSecret(JSON.stringify({ credentials: { clientId: "test-only", clientSecret: "test-only", refreshToken: "test-only", loginCustomerId: "" } })), 1, new Date().toISOString()],
  ["shared.meta.access_token", encryptSecret("meta-test-secret"), 1, new Date().toISOString()],
] }));

import { fetchCampaignPerformance, parseMetaCampaign } from "./campaign-performance";
after(async () => { await db.$client.end(); });
test("Meta keeps overlapping aliases, all/link clicks, chat and leads separate", () => {
  const metrics = parseMetaCampaign({ campaign_id: "1", campaign_name: "Test", spend: "100000", impressions: "2000", reach: "1500", clicks: "200", inline_link_clicks: "120",
    actions: [{ action_type: "lead", value: "10" }, { action_type: "offsite_conversion.fb_pixel_lead", value: "10" }, { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "8" }, { action_type: "landing_page_view", value: "90" }, { action_type: "omni_purchase", value: "3" }, { action_type: "purchase", value: "3" }],
    action_values: [{ action_type: "omni_purchase", value: "600000" }, { action_type: "purchase", value: "600000" }], video_thruplay_watched_actions: [{ action_type: "video_view", value: "50" }],
  }, "IDR");
  assert.equal(metrics.leads, 10); assert.equal(metrics.chats, 8); assert.equal(metrics.purchases, 3);
  assert.equal(metrics.revenue, 600000); assert.equal(metrics.landingPageViews, 90);
  assert.equal(metrics.clicks, 200); assert.equal(metrics.linkClicks, 120); assert.equal(metrics.thruplays, 50);
});
test("Google requests full range, keeps conversions separate from Meta leads and LPV", async () => {
  for (const key of ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN"]) process.env[key] = "test-only";
  const original = global.fetch;
  const queries: string[] = [];
  global.fetch = async (input, init) => {
    if (String(input).includes("oauth2")) return Response.json({ access_token: "test", expires_in: 3600 });
    const query = JSON.parse(init!.body as string).query; queries.push(query);
    if (query.includes("FROM customer")) return Response.json([{ results: [{ customer: { currencyCode: "IDR" } }] }]);
    return Response.json([{ results: [{ campaign: { id: "123" }, metrics: { costMicros: "100000000000", impressions: "1000", clicks: "200", conversions: 5.5 } }] }]);
  };
  try {
    const result = await fetchCampaignPerformance({ platform: "google", accountId: "123" }, "2026-10-01", "2026-10-05");
    assert.ok(result.ok); if (!result.ok) return;
    assert.equal(result.campaigns[0].metrics.conversions, 5.5);
    assert.equal(result.campaigns[0].metrics.leads, null); assert.equal(result.campaigns[0].metrics.landingPageViews, null);
    assert.equal(result.campaigns[0].metrics.spent, 100000);
    assert.ok(queries.some((q) => q.includes("BETWEEN '2026-10-01' AND '2026-10-05'")));
    assert.ok(result.warnings.length);
  } finally { global.fetch = original; }
});
test("invalid ranges rejected before any API request", async () => {
  assert.equal((await fetchCampaignPerformance({ platform: "google", accountId: "1" }, "invalid", "2026-10-01")).ok, false);
  assert.equal((await fetchCampaignPerformance({ platform: "meta", accountId: "1" }, "2026-10-05", "2026-10-01")).ok, false);
});
