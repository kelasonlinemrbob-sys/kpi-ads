import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, mock, test } from "node:test";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, users } from "@/db/schema";
import { canClaimAdAccount } from "./ad-account-ownership";
import { encryptSecret } from "./secret-box";
import { getMetaToken, removeMetaConnection, saveMetaConnection } from "./meta-connection";
import { getGoogleCredentials, getGoogleConnectionStatus, getSharedSheetsCredentials, saveGoogleConnection, disableGoogleConnection } from "./google-connection";
import { fetchAccountCampaigns } from "./ads-api";

const SHARED_KEYS = ["shared.meta.access_token", "shared.meta.app_id", "shared.meta.app_secret", "shared.meta.token_info", "shared.google_ads.connection"];

after(async () => db.$client.end());

test("claim rule: free accounts for anyone, supervisor's for advertisers, another advertiser's never", () => {
  const adv = { id: 2, role: "advertiser" as const };
  const sup = { id: 1, role: "supervisor" as const };
  assert.equal(canClaimAdAccount(null, adv), true);
  assert.equal(canClaimAdAccount({ id: 1, role: "supervisor" }, adv), true);
  assert.equal(canClaimAdAccount({ id: 3, role: "advertiser" }, adv), false);
  assert.equal(canClaimAdAccount({ id: 2, role: "advertiser" }, adv), false);
  assert.equal(canClaimAdAccount({ id: 3, role: "advertiser" }, sup), false);
  assert.equal(canClaimAdAccount({ id: 4, role: "supervisor" }, sup), false);
});

test("one team connection: migration carries the supervisor's credentials, personal and server ones are never inherited, Sheets keeps its own", async () => {
  const rollback = new Error("rollback");
  const originalFetch = global.fetch;
  const envKeys = ["META_ACCESS_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN"];
  const originalEnv = envKeys.map((key) => process.env[key]);
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
    if (url.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "access-test", expires_in: 3600 });
    if (url.hostname === "googleads.googleapis.com") return Response.json([{ results: [{ customer: { id: "1234567890", descriptiveName: "Fixture", currencyCode: "IDR", manager: false } }] }]);
    throw new Error("Unexpected external request");
  };
  try {
    await db.transaction(async (tx) => {
      await tx.delete(appSettings).where(inArray(appSettings.key, SHARED_KEYS));
      const [sup, adv] = await tx
        .insert(users)
        .values([
          { name: "Team supervisor", email: `team-sup-${crypto.randomUUID()}@example.invalid`, passwordHash: "unused", role: "supervisor" as const },
          { name: "Team advertiser", email: `team-adv-${crypto.randomUUID()}@example.invalid`, passwordHash: "unused", role: "advertiser" as const },
        ])
        .returning();
      const later = sql`now() + interval '1 day'`;
      const google = { clientId: "123-sup.apps.googleusercontent.com", clientSecret: "sup-secret", refreshToken: "sup-refresh", loginCustomerId: "" };
      // The supervisor's personal connection (newest), an advertiser's personal token, and the legacy Sheets row.
      await tx.insert(appSettings).values([
        { key: `user.${sup!.id}.meta.access_token`, value: encryptSecret("supervisor-meta"), updatedById: sup!.id, updatedAt: later },
        { key: `user.${sup!.id}.meta.app_id`, value: "4242", updatedById: sup!.id, updatedAt: later },
        { key: `user.${sup!.id}.google.connection`, value: encryptSecret(JSON.stringify({ credentials: google })), updatedById: sup!.id, updatedAt: later },
        { key: `user.${adv!.id}.meta.access_token`, value: encryptSecret("advertiser-meta"), updatedById: adv!.id, updatedAt: later },
      ]);
      const legacySheets = { clientId: "123-old.apps.googleusercontent.com", clientSecret: "legacy-secret", refreshToken: "legacy-refresh", loginCustomerId: "" };
      await tx.insert(appSettings).values({ key: "google.connection", value: encryptSecret(JSON.stringify({ credentials: legacySheets })), updatedById: sup!.id })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: encryptSecret(JSON.stringify({ credentials: legacySheets })) } });

      const mocks = [mock.method(db, "select", tx.select.bind(tx)), mock.method(db, "insert", tx.insert.bind(tx)), mock.method(db, "update", tx.update.bind(tx)), mock.method(db, "transaction", async (callback: (transaction: typeof tx) => unknown) => callback(tx))];
      try {
        // Before the migration nothing personal or from the server environment is used.
        assert.equal(await getMetaToken(), null);
        assert.equal(await getGoogleCredentials(), null);
        assert.equal((await getGoogleConnectionStatus()).state, "none");

        const migration = readFileSync("drizzle/0034_shared_ads_credentials.sql", "utf8").split("--> statement-breakpoint");
        for (const statement of migration) await tx.execute(sql.raw(statement));
        assert.equal(await getMetaToken(), "supervisor-meta");
        assert.equal((await getGoogleCredentials())?.refreshToken, "sup-refresh");
        const [appId] = await tx.select().from(appSettings).where(eq(appSettings.key, "shared.meta.app_id"));
        assert.equal(appId?.value, "4242");

        // Every account, whoever picked it, is read with the team token.
        requests.length = 0;
        assert.ok((await fetchAccountCampaigns({ platform: "meta", accountId: "123" }, "2026-10-05")).ok);
        assert.deepEqual(requests, ["supervisor-meta"]);

        // A supervisor replaces the team connection; the advertiser's old personal token is never read.
        assert.equal((await saveMetaConnection({ token: "team-meta-2" }, sup!.id)).ok, true);
        assert.equal(await getMetaToken(), "team-meta-2");
        const input = { clientId: "123-new.apps.googleusercontent.com", clientSecret: "team-secret", refreshToken: "team-refresh", customerId: "1234567890", loginCustomerId: "" };
        assert.equal((await saveGoogleConnection(input, sup!.id)).ok, true);
        assert.equal((await getGoogleCredentials())?.refreshToken, "team-refresh");
        assert.ok(!JSON.stringify(await getGoogleConnectionStatus()).includes("team-secret"));
        const [stored] = await tx.select().from(appSettings).where(eq(appSettings.key, "shared.google_ads.connection"));
        assert.ok(stored!.value.startsWith("v1:") && !stored!.value.includes("team-refresh"));
        assert.equal((await getSharedSheetsCredentials())?.refreshToken, "legacy-refresh", "Ads changes must not change the Sheets authorization");

        await removeMetaConnection(sup!.id);
        await disableGoogleConnection(sup!.id);
        assert.equal(await getMetaToken(), null);
        assert.equal(await getGoogleCredentials(), null);
        requests.length = 0;
        assert.equal((await fetchAccountCampaigns({ platform: "meta", accountId: "123" }, "2026-10-05")).ok, false);
        assert.equal(requests.length, 0);
      } finally {
        mocks.forEach((m) => m.mock.restore());
      }
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    global.fetch = originalFetch;
    envKeys.forEach((key, i) => (originalEnv[i] === undefined ? delete process.env[key] : (process.env[key] = originalEnv[i])));
  }
});

test("migration falls back to the legacy global rows a supervisor saved (how older releases stored them)", async () => {
  const rollback = new Error("rollback");
  try {
    await db.transaction(async (tx) => {
      await tx.delete(appSettings).where(inArray(appSettings.key, [...SHARED_KEYS, "google.connection", "meta.access_token", "meta.app_id", "meta.app_secret", "meta.token_info"]));
      // Personal supervisor rows elsewhere in the database would win; drop them for this scenario.
      await tx.delete(appSettings).where(sql`${appSettings.key} ~ '^user\\.[0-9]+\\.(meta\\.|google\\.connection)'`);
      const [sup, adv] = await tx
        .insert(users)
        .values([
          { name: "Legacy supervisor", email: `legacy-sup-${crypto.randomUUID()}@example.invalid`, passwordHash: "unused", role: "supervisor" as const },
          { name: "Legacy advertiser", email: `legacy-adv-${crypto.randomUUID()}@example.invalid`, passwordHash: "unused", role: "advertiser" as const },
        ])
        .returning();
      const google = encryptSecret(JSON.stringify({ credentials: { clientId: "123-legacy.apps.googleusercontent.com", clientSecret: "s", refreshToken: "legacy-google", loginCustomerId: "" } }));
      await tx.insert(appSettings).values([
        { key: "google.connection", value: google, updatedById: sup!.id },
        { key: "meta.access_token", value: encryptSecret("legacy-meta"), updatedById: sup!.id },
        { key: "meta.token_info", value: "{}", updatedById: adv!.id },
      ]);
      for (const statement of readFileSync("drizzle/0034_shared_ads_credentials.sql", "utf8").split("--> statement-breakpoint")) await tx.execute(sql.raw(statement));
      const rows = await tx.select().from(appSettings).where(inArray(appSettings.key, SHARED_KEYS));
      const byKey = new Map(rows.map((r) => [r.key, r]));
      assert.equal(byKey.get("shared.google_ads.connection")?.value, google);
      assert.ok(byKey.get("shared.meta.access_token"));
      assert.equal(byKey.has("shared.meta.token_info"), false, "rows saved by an advertiser are not carried over");
      const [legacy] = await tx.select().from(appSettings).where(eq(appSettings.key, "google.connection"));
      assert.equal(legacy?.value, google, "the Sheets fallback row stays");
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});

test("Kie key migration: the newest supervisor key becomes the team key; advertisers' keys are not used", async () => {
  const rollback = new Error("rollback");
  const kieKeys = ["shared.kie.api_key", "shared.kie.key_info"];
  try {
    await db.transaction(async (tx) => {
      await tx.delete(appSettings).where(inArray(appSettings.key, kieKeys));
      await tx.delete(appSettings).where(sql`${appSettings.key} ~ '^(user\\.[0-9]+\\.)?kie\\.'`);
      const [sup, adv] = await tx.insert(users).values([
        { name: "Kie supervisor", email: `kie-sup-${crypto.randomUUID()}@example.invalid`, passwordHash: "unused", role: "supervisor" as const },
        { name: "Kie advertiser", email: `kie-adv-${crypto.randomUUID()}@example.invalid`, passwordHash: "unused", role: "advertiser" as const },
      ]).returning();
      const later = sql`now() + interval '2 day'`;
      await tx.insert(appSettings).values([
        { key: `user.${sup!.id}.kie.api_key`, value: encryptSecret("supervisor-kie"), updatedById: sup!.id, updatedAt: sql`now() + interval '1 day'` },
        { key: `user.${sup!.id}.kie.key_info`, value: '{"keyHint":"-kie"}', updatedById: sup!.id },
        { key: `user.${adv!.id}.kie.api_key`, value: encryptSecret("advertiser-kie"), updatedById: adv!.id, updatedAt: later },
      ]);
      const mocks = [mock.method(db, "select", tx.select.bind(tx))];
      try {
        const { getKieApiKey } = await import("./kie-connection");
        assert.equal(await getKieApiKey(), null, "nothing personal is read before the migration");
        await tx.execute(sql.raw(readFileSync("drizzle/0035_shared_kie_key.sql", "utf8")));
        assert.equal(await getKieApiKey(), "supervisor-kie");
        const [info] = await tx.select().from(appSettings).where(eq(appSettings.key, "shared.kie.key_info"));
        assert.equal(info?.value, '{"keyHint":"-kie"}');
      } finally {
        mocks.forEach((m) => m.mock.restore());
      }
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});
