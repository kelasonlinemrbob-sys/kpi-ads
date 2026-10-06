import assert from "node:assert/strict";
import { after, test, mock } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, users } from "@/db/schema";
import { getGoogleConnectionStatus, getGoogleCredentials, saveGoogleConnection, disableGoogleConnection, testGoogleConnection } from "./google-connection";
import { decryptSecret } from "./secret-box";
after(async () => { await db.$client.end(); });
test("encrypted configuration, failed replacement, redacted DTO, disable-env precedence and reconnect (rolled back)", async () => {
  const rollback = new Error("ROLLBACK_TEST"); const original = global.fetch;
  const envKeys = ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN"];
  const env = envKeys.map((key) => process.env[key]);
  let oauthFail = false;
  global.fetch = async (url) => String(url).includes("oauth2")
    ? oauthFail ? Response.json({ error: "invalid_grant", error_description: "secret-leak" }, { status: 400 }) : Response.json({ access_token: "test-only" })
    : Response.json([{ results: [{ customer: { id: "1234567890", descriptiveName: "Fixture", currencyCode: "IDR", manager: false } }] }]);
  try {
    await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ name: "Google fixture", email: `google-${crypto.randomUUID()}@example.invalid`, passwordHash: "unused", role: "supervisor" }).returning();
      await tx.delete(appSettings).where(eq(appSettings.key, `user.${user.id}.google.connection`));
      const mocks = [mock.method(db, "select", tx.select.bind(tx)), mock.method(db, "insert", tx.insert.bind(tx)), mock.method(db, "update", tx.update.bind(tx))];
      try {
        for (const key of envKeys) delete process.env[key];
        assert.equal((await getGoogleConnectionStatus(user.id)).state, "none");
        const input = { clientId: "123-test.apps.googleusercontent.com", clientSecret: "secret-test", refreshToken: "refresh-test", customerId: "1234567890", loginCustomerId: "" };
        const result = await saveGoogleConnection(input, user.id); assert.ok(result.ok);
        const [stored] = await tx.select().from(appSettings).where(eq(appSettings.key, `user.${user.id}.google.connection`));
        assert.ok(stored.value.startsWith("v1:")); assert.ok(!stored.value.includes("refresh-test"));
        assert.equal(JSON.parse(decryptSecret(stored.value)!).credentials.refreshToken, "refresh-test");
        const dto = await getGoogleConnectionStatus(user.id); assert.equal(dto.state, "ok");
        assert.ok(!JSON.stringify(dto).includes("refresh-test") && !JSON.stringify(dto).includes("secret-test"));
        assert.ok((await saveGoogleConnection({ ...input, clientSecret: "", refreshToken: "" }, user.id)).ok);
        oauthFail = true;
        const failed = await saveGoogleConnection({ ...input, refreshToken: "bad-new" }, user.id); assert.equal(failed.ok, false);
        assert.equal((await getGoogleCredentials(user.id))!.refreshToken, "refresh-test");
        assert.equal((await testGoogleConnection("1234567890", user.id)).ok, false);
        assert.equal((await getGoogleConnectionStatus(user.id)).state, "error");
        oauthFail = false;
        assert.equal((await testGoogleConnection("1234567890", user.id)).ok, true);
        assert.equal((await getGoogleConnectionStatus(user.id)).state, "ok");
        for (const key of envKeys) process.env[key] = "env-fallback-test";
        await disableGoogleConnection(user.id);
        assert.equal(await getGoogleCredentials(user.id), null); assert.equal((await getGoogleConnectionStatus(user.id)).state, "disabled");
        assert.ok((await saveGoogleConnection(input, user.id)).ok);
        // Tampered credentials must fail closed, never silently switch to env credentials.
        await tx.update(appSettings).set({ value: "invalid-encrypted-value" }).where(eq(appSettings.key, `user.${user.id}.google.connection`));
        assert.equal(await getGoogleCredentials(user.id), null); assert.equal((await getGoogleConnectionStatus(user.id)).state, "error");
      } finally { for (const m of mocks) m.mock.restore(); }
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { global.fetch = original; envKeys.forEach((key, i) => { if (env[i] === undefined) delete process.env[key]; else process.env[key] = env[i]; }); }
});
