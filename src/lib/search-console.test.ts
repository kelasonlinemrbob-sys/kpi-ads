import assert from "node:assert/strict";
import { test } from "node:test";
import { createSearchConsoleClient } from "./search-console-client";
import { mergeSearchConsoleCredentials, searchConsoleRange, searchConsoleToday, shiftSearchDate } from "./search-console-input";
import { can, ROLES } from "./roles";

const credentials = { clientId: "123-test.apps.googleusercontent.com", clientSecret: "secret-test", refreshToken: "refresh-test" };
test("dates respect Pacific time, inclusive 28 days, calendar validity and bounds", () => {
  assert.equal(searchConsoleToday(new Date("2026-10-08T02:00:00Z")), "2026-10-07");
  assert.deepEqual(searchConsoleRange({}, "2026-10-08"), { start: "2026-09-08", end: "2026-10-05" });
  for (const input of [{ start: "2026-02-30" }, { start: "2026-10-07", end: "2026-10-06" }, { end: "2026-10-09" }, { start: "2020-01-01" }, { start: "" }]) assert.throws(() => searchConsoleRange(input, "2026-10-08"));
  assert.deepEqual(searchConsoleRange({ start: "2026-10-08", end: "2026-10-08" }, "2026-10-08"), { start: "2026-10-08", end: "2026-10-08" });
});
test("credential changes require matching secrets, empty secrets preserve existing values", () => {
  assert.deepEqual(mergeSearchConsoleCredentials({ ...credentials, siteUrl: "", clientSecret: "", refreshToken: "" }, credentials), credentials);
  assert.throws(() => mergeSearchConsoleCredentials({ ...credentials, siteUrl: "", clientId: "new.apps.googleusercontent.com", refreshToken: "" }, credentials));
  assert.throws(() => mergeSearchConsoleCredentials({ ...credentials, siteUrl: "", refreshToken: "" }, null));
});
test("SEO access is limited to supervisor, SEO and webmaster", () => {
  for (const role of ROLES) {
    const allowed = ["supervisor", "seo", "webmaster"].includes(role);
    assert.equal(can.viewSearchConsole(role), allowed);
  }
});
test("properties, encoded URLs, final web requests and independent totals", async () => {
  const original = global.fetch;
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  global.fetch = async (url, init) => {
    if (String(url).includes("oauth2")) return Response.json({ access_token: "access-test" });
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer access-test");
    assert.equal(init?.cache, "no-store");
    if (String(url).endsWith("/sites")) return Response.json({ siteEntry: [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }, { siteUrl: "https://example.com/", permissionLevel: "siteRestrictedUser" }, { siteUrl: "sc-domain:hidden.com", permissionLevel: "siteUnverifiedUser" }] });
    const body = JSON.parse(String(init?.body)); requests.push({ url: String(url), body });
    return Response.json({ rows: [{ keys: body.dimensions.length ? ["example"] : undefined, clicks: body.dimensions.length ? 3 : 123, impressions: 1000, ctr: 0.123, position: 7.8 }] });
  };
  try {
    const client = await createSearchConsoleClient(credentials);
    assert.equal((await client.listSites()).length, 2);
    const range = searchConsoleRange({});
    const report = await client.report("https://example.com/folder/", range);
    assert.equal(report.total?.clicks, 123); assert.equal(report.queries[0].clicks, 3);
    assert.equal(requests.length, 5);
    for (const request of requests) {
      assert.ok(request.url.includes("https%3A%2F%2Fexample.com%2Ffolder%2F"));
      assert.equal(request.body.dataState, "final"); assert.equal(request.body.type, "web");
      assert.equal(request.body.startDate, range.start);
    }
    assert.equal(requests.find((r) => (r.body.dimensions as string[])[0] === "page")?.body.aggregationType, "auto");
    assert.equal(requests[0].body.aggregationType, "byProperty");
    await client.query("sc-domain:example.com", range);
    assert.ok(requests.at(-1)?.url.includes("sc-domain%3Aexample.com"));
    global.fetch = async () => Response.json({});
    assert.deepEqual(await client.listSites(), []);
    assert.equal((await client.report("sc-domain:example.com", range)).total, null);
    await assert.rejects(client.query("sc-domain:example.com", { start: "bad", end: shiftSearchDate(searchConsoleToday(), -1) }));
  } finally { global.fetch = original; }
});
test("OAuth, scope, disabled API, quota, network and invalid responses never expose upstream secrets", async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => Response.json({ error_description: "secret-leak" }, { status: 400 });
    await assert.rejects(createSearchConsoleClient(credentials), (e: Error) => /Refresh Token/.test(e.message) && !e.message.includes("secret-leak"));
    global.fetch = async () => Response.json({ access_token: "test" });
    const client = await createSearchConsoleClient(credentials);
    for (const [status, reason, expected] of [[403, "ACCESS_TOKEN_SCOPE_INSUFFICIENT", /scope/], [403, "SERVICE_DISABLED", /Aktifkan/], [403, "", /ditolak/], [401, "", /kedaluwarsa/], [429, "", /kuota/], [503, "", /sibuk/]] as const) {
      global.fetch = async () => Response.json({ error: { message: "secret-leak", details: [{ reason }] } }, { status });
      await assert.rejects(client.listSites(), (e: Error) => expected.test(e.message) && !e.message.includes("secret-leak"));
    }
    global.fetch = async () => { throw new Error("secret-leak"); };
    await assert.rejects(client.listSites(), (e: Error) => !e.message.includes("secret-leak"));
    global.fetch = async () => Response.json({ rows: [{ clicks: "secret-leak" }] });
    await assert.rejects(client.query("sc-domain:example.com", searchConsoleRange({})), /tidak valid/);
  } finally { global.fetch = original; }
});
