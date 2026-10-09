import assert from "node:assert/strict";
import { after, test, mock } from "node:test";
import { fetchAccountCampaigns, fetchAccountCampaignList } from "./ads-api";
import { encryptSecret } from "./secret-box";
import { db } from "@/db";
process.env.AUTH_SECRET = "fixture-encryption-key";
mock.method(db.$client, "query", async () => ({ rows: [
  ["shared.google_ads.connection", encryptSecret(JSON.stringify({ credentials: { clientId: "test-only", clientSecret: "test-only", refreshToken: "test-only", loginCustomerId: "" } })), 1, new Date().toISOString()],
  ["shared.meta.access_token", encryptSecret("meta-test-secret"), 1, new Date().toISOString()],
] }));


// Synthetic Google API credentials, used only with mocked fetch. No network calls.
for (const key of ['GOOGLE_ADS_CLIENT_ID','GOOGLE_ADS_CLIENT_SECRET','GOOGLE_ADS_REFRESH_TOKEN']) process.env[key] = 'test-only';
after(async () => { await db.$client.end(); });
const action = "customers/1234567890/conversionActions/321";
function mockGoogle(mode: 'available' | 'zero' | 'failed' | 'inactive' | 'base-failed') {
  const queries: string[] = [];
  const original = global.fetch;
  global.fetch = async (input, init) => {
    if (String(input).includes('oauth2')) return Response.json({ access_token: 'test-only', expires_in: 3600 });
    const query = JSON.parse(init!.body as string).query as string; queries.push(query);
    if (query.includes('FROM conversion_action')) return Response.json([{ results: mode === 'inactive' ? [] : [{ conversionAction: { resourceName: action, name: 'Landing page reached', category: 'PAGE_VIEW' } }] }]);
    if (query.includes('metrics.all_conversions')) {
      assert.ok(!query.includes('cost_micros') && !query.includes('metrics.clicks'));
      assert.ok(query.includes(`segments.conversion_action = '${action}'`));
      if (mode === 'failed') return Response.json([{ error: { message: 'LPV unavailable' } }], { status: 200 });
      return Response.json([{ results: mode === 'zero' ? [] : [{ campaign: { id: '11' }, metrics: { allConversions: 120.4 } }] }]);
    }
    if (mode === 'base-failed') return Response.json({ error: { message: 'No access' } }, { status: 403 });
    return Response.json([{ results: [{ campaign: { id: '11', name: 'Test campaign' }, metrics: { costMicros: '240000000000', impressions: '5000', clicks: '250', conversions: 12 } }] }]);
  };
  return { queries, restore: () => { global.fetch = original; } };
}
for (const mode of ['available','zero','failed','inactive','base-failed'] as const) {
  test(`Google LPV: ${mode}`, async () => {
    const mock = mockGoogle(mode);
    try {
      const result = await fetchAccountCampaigns({ platform: 'google', accountId: '1234567890', lpvConversionAction: action }, '2026-10-02');
      if (mode === 'base-failed') { assert.equal(result.ok, false); return; }
      assert.equal(result.ok, true); if (!result.ok) return;
      assert.equal(result.campaigns[0]!.spent, 240000);
      assert.equal(result.campaigns[0]!.clicks, 250);
      assert.equal(result.campaigns[0]!.landingPageViews, mode === 'available' ? 120 : mode === 'zero' ? 0 : null);
      assert.equal(result.lpvAvailable, mode === 'available' || mode === 'zero');
      if (mode === 'failed' || mode === 'inactive') assert.ok(result.warnings!.length);
    } finally { mock.restore(); }
  });
}
test('Google without LPV mapping retains ads metrics and gives a setup warning', async () => {
  const mock = mockGoogle('available');
  try {
    const result = await fetchAccountCampaigns({ platform: 'google', accountId: '1234567890' }, '2026-10-02');
    assert.ok(result.ok); if (!result.ok) return;
    assert.equal(result.campaigns[0]!.landingPageViews, null);
    assert.equal(result.lpvAvailable, false); assert.ok(result.warnings!.length);
    assert.equal(mock.queries.length, 1);
  } finally { mock.restore(); }
});

test('Google campaign sync uses owner credentials and retries legacy date fields', async () => {
  const original = global.fetch; const queries: string[] = [];
  global.fetch = async (url, init) => {
    if (String(url).includes('oauth2')) return Response.json({ access_token: 'test-only', expires_in: 3600 });
    assert.equal(new Headers(init!.headers).has('developer-token'), false);
    const query = JSON.parse(init!.body as string).query; queries.push(query);
    if (query.includes('start_date_time')) return Response.json({ error: { details: [{ errors: [{ errorCode: { queryError: 'UNRECOGNIZED_FIELD' } }] }] } }, { status: 400 });
    return Response.json([{ results: [{ campaign: { id: '11', name: 'Test campaign', status: 'ENABLED', startDate: '2026-10-01', endDate: '2037-12-30' }, campaignBudget: { amountMicros: '10000000000' } }] }]);
  };
  try {
    const result = await fetchAccountCampaignList({ platform: 'google', accountId: '1234567890' });
    assert.ok(result.ok); if (!result.ok) return;
    assert.equal(queries.length, 2); assert.equal(result.campaigns[0].dailyBudget, 10000);
    assert.equal(result.campaigns[0].startDate, '2026-10-01'); assert.equal(result.campaigns[0].endDate, null);
  } finally { global.fetch = original; }
});

test('daily report: Meta sales campaigns report their WhatsApp chats as leads, lead campaigns keep leads', async () => {
  const original = global.fetch; let fields = '';
  global.fetch = async (input) => {
    const url = new URL(String(input)); fields = url.searchParams.get('fields') ?? '';
    return Response.json({ data: [
      { campaign_id: '1', campaign_name: '[KO] Sales Wa', objective: 'OUTCOME_SALES', spend: '136975', impressions: '9000', inline_link_clicks: '40',
        actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '13' }],
        results: [{ indicator: 'actions:onsite_conversion.messaging_conversation_started_7d', values: [{ value: '13', attribution_windows: ['default'] }] }] },
      { campaign_id: '2', campaign_name: '[KO] Leads', objective: 'OUTCOME_LEADS', spend: '95246', impressions: '7000', inline_link_clicks: '30',
        actions: [{ action_type: 'lead', value: '2' }, { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '1' }],
        results: [{ indicator: 'actions:offsite_conversion.fb_pixel_lead', values: [{ value: '2' }] }] },
      { campaign_id: '3', campaign_name: '[KO] Awareness', objective: 'OUTCOME_AWARENESS', spend: '17554', impressions: '20000', inline_link_clicks: '5',
        results: [{ indicator: 'reach', values: [{ value: '17871' }] }] },
    ] });
  };
  try {
    const result = await fetchAccountCampaigns({ platform: 'meta', accountId: '123' }, '2026-10-06');
    assert.ok(fields.includes('objective') && fields.includes('results'));
    assert.ok(result.ok);
    if (result.ok) assert.deepEqual(result.campaigns.map((c) => [c.name, c.leads]), [['[KO] Sales Wa', 13], ['[KO] Leads', 2], ['[KO] Awareness', 0]]);
  } finally { global.fetch = original; }
});
