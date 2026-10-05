import assert from "node:assert/strict";
import { test } from "node:test";
import { clearGoogleTokenCache, googleSearchWithCredentials, verifyGoogleCredentials } from "./google-client";
import { googleConnectionInput, mergeGoogleCredentials } from "./google-credentials";
const credentials = { clientId: "123-test.apps.googleusercontent.com", clientSecret: "secret-test", refreshToken: "refresh-test", loginCustomerId: "9876543210" };
test("validate customer/MCC IDs and prevent mixing credentials after changing OAuth client", () => {
  const parsed = googleConnectionInput.parse({ ...credentials, customerId: "123-456-7890", loginCustomerId: "987-654-3210", clientSecret: "", refreshToken: "" });
  assert.equal(parsed.customerId, "1234567890"); assert.equal(parsed.loginCustomerId, "9876543210");
  assert.deepEqual(mergeGoogleCredentials(parsed, credentials), credentials);
  assert.throws(() => mergeGoogleCredentials({ ...parsed, clientId: "new.apps.googleusercontent.com" }, credentials), /Client ID diganti/);
  assert.throws(() => mergeGoogleCredentials(parsed, null), /wajib diisi/);
  assert.equal(googleConnectionInput.safeParse({ ...parsed, customerId: "1234567890' OR 1=1" }).success, false);
  assert.equal(mergeGoogleCredentials({ ...parsed, loginCustomerId: "" }, credentials).loginCustomerId, "");
});
test("OAuth cache keyed by credentials, tests force refresh, no developer token, MCC header optional", async () => {
  const original = global.fetch; clearGoogleTokenCache();
  let exchanges = 0; const headers: Headers[] = [];
  global.fetch = async (url, init) => {
    if (String(url).includes("oauth2")) { exchanges++; const form = init!.body as URLSearchParams; assert.equal(form.get("grant_type"), "refresh_token"); return Response.json({ access_token: `access-${exchanges}`, expires_in: 3600 }); }
    headers.push(new Headers(init!.headers));
    return Response.json([{ results: [{ customer: { id: "1234567890", descriptiveName: "Test ads", currencyCode: "IDR", manager: false } }] }]);
  };
  try {
    await googleSearchWithCredentials(credentials, "1234567890", "SELECT customer.id FROM customer");
    await googleSearchWithCredentials(credentials, "1234567890", "SELECT customer.id FROM customer"); assert.equal(exchanges, 1);
    const account = await verifyGoogleCredentials(credentials, "1234567890"); assert.equal(exchanges, 2); assert.equal(account.name, "Test ads");
    await googleSearchWithCredentials({ ...credentials, refreshToken: "new-refresh", loginCustomerId: "" }, "1234567890", "SELECT customer.id FROM customer"); assert.equal(exchanges, 3);
    assert.ok(headers.every((h) => !h.has("developer-token")));
    assert.equal(headers[0].get("login-customer-id"), "9876543210"); assert.equal(headers.at(-1)!.has("login-customer-id"), false);
  } finally { global.fetch = original; clearGoogleTokenCache(); }
});
test("manager account is rejected as a campaign customer", async () => {
  const original = global.fetch;
  global.fetch = async (url) => String(url).includes("oauth2") ? Response.json({ access_token: "test" }) : Response.json([{ results: [{ customer: { id: "1234567890", manager: true } }] }]);
  try { await assert.rejects(verifyGoogleCredentials(credentials, "1234567890"), /akun manager/); }
  finally { global.fetch = original; clearGoogleTokenCache(); }
});
test("OAuth/API/network errors are actionable without echoing raw secrets", async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => Response.json({ error: "invalid_grant", error_description: "echo-secret-test" }, { status: 400 });
    await assert.rejects(verifyGoogleCredentials(credentials, "1234567890"), (e: Error) => /Refresh Token/.test(e.message) && !e.message.includes("echo-secret-test"));
    global.fetch = async (url) => String(url).includes("oauth2") ? Response.json({ access_token: "test" }) : Response.json({ error: { message: "echo-secret-test", details: [{ errors: [{ errorCode: { authorizationError: "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION" } }] }] } }, { status: 403 });
    await assert.rejects(verifyGoogleCredentials(credentials, "1234567890"), (e: Error) => /Explorer/.test(e.message) && !e.message.includes("echo-secret-test"));
    global.fetch = async () => { throw new Error("network echo-secret-test"); };
    await assert.rejects(verifyGoogleCredentials(credentials, "1234567890"), (e: Error) => !e.message.includes("echo-secret-test"));
  } finally { global.fetch = original; clearGoogleTokenCache(); }
});
