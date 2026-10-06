import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, users } from "@/db/schema";
import { encryptSecret } from "./secret-box";
import { getMetaToken, removeMetaConnection, saveMetaConnection } from "./meta-connection";
import { getGoogleCredentials, getGoogleConnectionStatus, getSharedSheetsCredentials, testGoogleConnection, saveGoogleConnection, disableGoogleConnection } from "./google-connection";
import { fetchAccountCampaigns } from "./ads-api";
import { userIntegrationKey } from "./integration-settings";

after(async () => db.$client.end());
test("personal integrations isolate owners, preserve legacy Sheets, and never inherit server credentials", async () => {
  const rollback = new Error("rollback");
  const originalFetch = global.fetch;
  const envKeys = ["META_ACCESS_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN"];
  const originalEnv = envKeys.map(key => process.env[key]);
  for (const key of envKeys) process.env[key] = "must-not-inherit-server-secret";
  const requests: string[] = [];
  global.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "graph.facebook.com") {
      requests.push(url.searchParams.get("access_token") ?? "");
      if (url.pathname.endsWith("/me")) return Response.json({ id: "fixture", name: "Fixture" });
      if (url.pathname.endsWith("/debug_token")) return Response.json({ data: { is_valid: true, type: "SYSTEM_USER", expires_at: 0, scopes: ["ads_read"] } });
      return Response.json({ data: [] });
    }
    if (url.hostname === "oauth2.googleapis.com") {
      const body = new URLSearchParams(String(init?.body));
      requests.push(body.get("refresh_token") ?? "");
      return Response.json({ access_token: `access-${body.get("refresh_token")}`, expires_in: 3600 });
    }
    if (url.hostname === "googleads.googleapis.com") {
      requests.push(String((init?.headers as Record<string, string>).Authorization));
      return Response.json([{ results: [{ customer: { id: "1234567890", descriptiveName: "Fixture", currencyCode: "IDR", manager: false } }] }]);
    }
    throw new Error("Unexpected external request");
  };
  try {
    await db.transaction(async tx => {
      const fixtures = await tx.insert(users).values(["A", "B"].map(name => ({name: `Isolation ${name}`, email: `isolation-${crypto.randomUUID()}@example.invalid`, passwordHash: "unused", role: "advertiser" as const}))).returning();
      const [a, b] = fixtures;
      const legacyGoogle = { clientId: "123-old.apps.googleusercontent.com", clientSecret: "legacy-secret", refreshToken: "legacy-refresh", loginCustomerId: "" };
      const legacyRows = [{ key: "google.connection", value: encryptSecret(JSON.stringify({ credentials: legacyGoogle })), updatedById: a.id }, { key: "meta.access_token", value: encryptSecret("legacy-meta"), updatedById: a.id }];
      for (const row of legacyRows) await tx.insert(appSettings).values(row).onConflictDoUpdate({ target: appSettings.key, set: row });
      const mocks = [mock.method(db, "select", tx.select.bind(tx)), mock.method(db, "insert", tx.insert.bind(tx)), mock.method(db, "update", tx.update.bind(tx)), mock.method(db, "transaction", async (callback: (transaction: typeof tx) => unknown) => callback(tx))];
      try {
        assert.equal(await getMetaToken(a.id), "legacy-meta");
        assert.equal(await getMetaToken(b.id), null);
        assert.equal(await getMetaToken(null), null);
        assert.equal((await getGoogleCredentials(a.id))?.refreshToken, "legacy-refresh");
        assert.equal(await getGoogleCredentials(b.id), null);
        assert.equal(await getGoogleCredentials(null), null);
        assert.equal((await getGoogleConnectionStatus(b.id)).state, "none");
        assert.ok((await testGoogleConnection("1234567890", a.id)).ok);
        assert.equal((await getGoogleConnectionStatus(a.id)).state, "ok", "legacy connection tests persist a personal status");
        assert.equal((await saveMetaConnection({ token: "personal-meta-b" }, b.id)).ok, true);
        const input = { clientId: "123-new.apps.googleusercontent.com", clientSecret: "personal-secret-b", refreshToken: "personal-refresh-b", customerId: "1234567890", loginCustomerId: "" };
        assert.equal((await saveGoogleConnection(input, b.id)).ok, true);
        assert.equal(await getMetaToken(a.id), "legacy-meta");
        assert.equal(await getMetaToken(b.id), "personal-meta-b");
        assert.equal((await getGoogleCredentials(a.id))?.refreshToken, "legacy-refresh");
        assert.equal((await getGoogleCredentials(b.id))?.refreshToken, "personal-refresh-b");
        assert.ok(!JSON.stringify(await getGoogleConnectionStatus(b.id)).includes("personal-secret-b"));
        requests.length = 0;
        assert.ok((await fetchAccountCampaigns({ platform: "meta", accountId: "123", createdById: b.id }, "2026-10-05")).ok);
        assert.deepEqual(requests, ["personal-meta-b"]);
        requests.length = 0;
        assert.equal((await fetchAccountCampaigns({ platform: "meta", accountId: "123", createdById: null }, "2026-10-05")).ok, false);
        assert.equal(requests.length, 0);
        await removeMetaConnection(a.id);
        await disableGoogleConnection(a.id);
        assert.equal(await getMetaToken(a.id), null, "disconnect must not resurrect the legacy token");
        assert.equal(await getGoogleCredentials(a.id), null);
        assert.equal(await getMetaToken(b.id), "personal-meta-b");
        assert.equal((await getSharedSheetsCredentials())?.refreshToken, "legacy-refresh", "personal Ads changes must not change shared Sheets authorization");
        const [stored] = await tx.select().from(appSettings).where(eq(appSettings.key, userIntegrationKey("google.connection", b.id)));
        assert.ok(stored.value.startsWith("v1:"));
        assert.ok(!stored.value.includes("personal-refresh-b"));
      } finally { mocks.forEach(m => m.mock.restore()); }
      throw rollback;
    });
  } catch(error) { if (error !== rollback) throw error; }
  finally { global.fetch = originalFetch; envKeys.forEach((key, i) => { if (originalEnv[i] === undefined) delete process.env[key]; else process.env[key] = originalEnv[i]; }); }
});
