import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { encryptSecret } from "./secret-box";
import { db } from "@/db";
process.env.AUTH_SECRET = "fixture-encryption-key";
process.env.GOOGLE_KEYWORD_PLANNER_CUSTOMER_ID = "1234567890";
mock.method(db.$client, "query", async () => ({ rows: [
  ["shared.google_ads.connection", encryptSecret(JSON.stringify({ credentials: { clientId: "test-only", clientSecret: "test-only", refreshToken: "test-only", loginCustomerId: "9999999999" } })), 1, new Date().toISOString()],
] }));

import { keywordIdeas, keywordVolumes, PLANNER_ACCESS_MESSAGE } from "./keyword-planner";
after(async () => { await db.$client.end(); });

test("ideas: Indonesian / Indonesia request with keyword+URL seed, parsed and sorted by volume, cached", async () => {
  const original = global.fetch;
  const bodies: { url: string; body: Record<string, unknown> | null; headers: Record<string, string> }[] = [];
  global.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("oauth2")) return Response.json({ access_token: "t", expires_in: 3600 });
    bodies.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null, headers: init?.headers as Record<string, string> });
    if (url.endsWith("googleAds:searchStream")) return Response.json([{ results: [{ customer: { currencyCode: "IDR" } }] }]);
    return Response.json({ results: [
      { text: "kursus inggris", keywordIdeaMetrics: { avgMonthlySearches: "880", competition: "MEDIUM" } },
      { text: "kampung inggris pare", keywordIdeaMetrics: { avgMonthlySearches: "2900", competition: "LOW" } },
    ] });
  };
  try {
    const res = await keywordIdeas({ seeds: ["kampung inggris", " Kampung Inggris "], url: "https://holiday.kampunginggris.com/", language: "id", location: "id" });
    assert.deepEqual(res.keywords.map((k) => [k.keyword, k.volume]), [["kampung inggris pare", 2900], ["kursus inggris", 880]]);
    assert.equal(res.currency, "IDR");
    const call = bodies.find((b) => b.url.endsWith("customers/1234567890:generateKeywordIdeas"))!;
    assert.deepEqual(call.body!.keywordAndUrlSeed, { keywords: ["kampung inggris"], url: "https://holiday.kampunginggris.com/" });
    assert.equal(call.body!.language, "languageConstants/1025");
    assert.deepEqual(call.body!.geoTargetConstants, ["geoTargetConstants/2360"]);
    assert.equal(call.headers["login-customer-id"], "9999999999");
    const calls = bodies.length;
    await keywordIdeas({ seeds: ["kampung inggris"], url: "https://holiday.kampunginggris.com/", language: "id", location: "id" });
    assert.equal(bodies.length, calls, "served from the 12-hour cache");
  } finally {
    global.fetch = original;
  }
});

test("Explorer access: Google's DEVELOPER_TOKEN_NOT_APPROVED becomes the 'apply for Basic access' message", async () => {
  const original = global.fetch;
  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("oauth2")) return Response.json({ access_token: "t", expires_in: 3600 });
    if (url.endsWith("googleAds:searchStream")) return Response.json([{ results: [{ customer: { currencyCode: "IDR" } }] }]);
    return Response.json({ error: { code: 403, status: "PERMISSION_DENIED", details: [{ errors: [{ errorCode: { authorizationError: "DEVELOPER_TOKEN_NOT_APPROVED" } }] }] } }, { status: 403 });
  };
  try {
    await assert.rejects(keywordVolumes({ keywords: ["mr bob kampung inggris"], language: "id", location: "all" }), (e: Error) => e.message === PLANNER_ACCESS_MESSAGE);
    await assert.rejects(keywordIdeas({ seeds: [], url: null, language: "id", location: "id" }), /minimal satu kata kunci/);
  } finally {
    global.fetch = original;
  }
});
