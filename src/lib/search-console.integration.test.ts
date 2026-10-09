import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, users } from "@/db/schema";
import { disconnectSearchConsole, getSearchConsoleMemberStatus, getSearchConsoleStatus, listSearchConsoleWebsiteChoices, loadSearchConsoleReport, saveSearchConsole, saveSearchConsoleWebsites, seoReportFigures, toggleSearchConsoleWebsite } from "./search-console";
import { searchConsoleToday, searchConsoleRange } from "./search-console-input";
import { decryptSecret } from "./secret-box";

after(async () => { await db.$client.end(); });
test("encrypted storage, failed replacement, property access, disconnect and concurrent changes (rolled back)", async () => {
  const rollback = new Error("ROLLBACK_TEST");
  const original = global.fetch;
  let fail = false;
  let accessible = true;
  let onQuery: (() => Promise<void>) | undefined;
  global.fetch = async (url) => {
    if (String(url).includes("oauth2")) return fail ? Response.json({ error_description: "secret-leak" }, { status: 400 }) : Response.json({ access_token: "test-only" });
    if (String(url).endsWith("/sites")) return Response.json({ siteEntry: accessible ? [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }] : [] });
    await onQuery?.();
    return Response.json({ rows: [{ clicks: 10, impressions: 100, ctr: 0.1, position: 8 }] });
  };
  try {
    await db.transaction(async (tx) => {
      const key = "shared.search_console.connection";
      const [user] = await tx.insert(users).values({ name: "Search Console fixture", email: `gsc-${crypto.randomUUID()}@example.invalid`, passwordHash: "unused", role: "supervisor" }).returning();
      await tx.delete(appSettings).where(eq(appSettings.key, key));
      const mocks = [mock.method(db, "select", tx.select.bind(tx)), mock.method(db, "insert", tx.insert.bind(tx)), mock.method(db, "update", tx.update.bind(tx))];
      const input = { clientId: "123-test.apps.googleusercontent.com", clientSecret: "secret-test", refreshToken: "refresh-test", siteUrl: "" };
      try {
        assert.equal((await getSearchConsoleStatus()).connected, false);
        assert.equal(await loadSearchConsoleReport(user, undefined, searchConsoleRange({})), null);
        assert.ok((await saveSearchConsole(input, user.id)).ok);
        const [row] = await tx.select().from(appSettings).where(eq(appSettings.key, key));
        assert.ok(row.value.startsWith("v1:")); assert.ok(!row.value.includes("refresh-test"));
        assert.equal(JSON.parse(decryptSecret(row.value)!).credentials.refreshToken, "refresh-test");
        const status = await getSearchConsoleStatus();
        assert.equal(status.connected, true); assert.equal(status.siteUrl, "sc-domain:example.com");
        assert.ok(!JSON.stringify(status).includes("secret-test")); assert.ok(!JSON.stringify(status).includes("refresh-test"));
        assert.ok((await saveSearchConsole({ ...input, clientSecret: "", refreshToken: "" }, user.id)).ok);
        fail = true;
        const result = await saveSearchConsole({ ...input, refreshToken: "bad-token" }, user.id);
        assert.equal(result.ok, false); assert.ok(!JSON.stringify(result).includes("secret-leak"));
        assert.equal((await getSearchConsoleStatus()).connected, true);
        fail = false;
        assert.equal((await saveSearchConsole({ ...input, siteUrl: "sc-domain:unknown.com" }, user.id)).ok, false);
        await assert.rejects(loadSearchConsoleReport(user, "sc-domain:unknown.com", searchConsoleRange({})), /tidak tersedia/);
        assert.equal((await loadSearchConsoleReport(user, undefined, searchConsoleRange({})))?.report?.total?.clicks, 10);
        accessible = false;
        await assert.rejects(loadSearchConsoleReport(user, undefined, searchConsoleRange({})), /akses telah dicabut/);
        accessible = true;
        onQuery = () => disconnectSearchConsole(user.id);
        assert.equal((await saveSearchConsole(input, user.id)).ok, false);
        assert.equal((await getSearchConsoleStatus()).connected, false);
        assert.equal(await loadSearchConsoleReport(user, undefined, searchConsoleRange({})), null);
        onQuery = undefined;
        assert.ok((await saveSearchConsole(input, user.id)).ok);
        await tx.update(appSettings).set({ value: "tampered" }).where(eq(appSettings.key, key));
        assert.ok((await getSearchConsoleStatus()).error);
        await assert.rejects(loadSearchConsoleReport(user, undefined, searchConsoleRange({})), /mengisi ulang/);
        assert.ok((await saveSearchConsole(input, user.id)).ok);
      } finally { for (const m of mocks) m.mock.restore(); }
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { global.fetch = original; }
});

test("members pick persistent websites using the team connection; report access stays scoped to their own selections", async () => {
  const rollback = new Error("ROLLBACK_SELECTION_TEST");
  const original = global.fetch;
  let sites = ["sc-domain:first.example", "https://second.example/"];
  let queries = 0;
  global.fetch = async (url) => {
    if (String(url).includes("oauth2")) return Response.json({ access_token: "test-only" });
    if (String(url).endsWith("/sites")) return Response.json({ siteEntry: sites.map((siteUrl) => ({ siteUrl, permissionLevel: "siteOwner" })) });
    queries++;
    return Response.json({ rows: [{ clicks: 5, impressions: 50, ctr: 0.1, position: 3 }] });
  };
  try {
    await db.transaction(async (tx) => {
      const members = await tx.insert(users).values((["supervisor", "seo", "seo", "advertiser", "webmaster"] as const).map((role) => ({ name: `GSC ${role}`, email: `gsc-${crypto.randomUUID()}@example.invalid`, passwordHash: "unused", role }))).returning();
      const [supervisor, seo, otherSeo, advertiser, webmaster] = members;
      await tx.delete(appSettings).where(eq(appSettings.key, "shared.search_console.connection"));
      const mocks = [mock.method(db, "select", tx.select.bind(tx)), mock.method(db, "insert", tx.insert.bind(tx)), mock.method(db, "update", tx.update.bind(tx))];
      try {
        const range = searchConsoleRange({});
        assert.ok((await saveSearchConsole({ clientId: "123-test.apps.googleusercontent.com", clientSecret: "secret-test", refreshToken: "refresh-test" }, supervisor.id)).ok);
        const memberStatus = await getSearchConsoleMemberStatus();
        assert.deepEqual(memberStatus, { connected: true, error: null });
        assert.equal((await loadSearchConsoleReport(seo, undefined, range))?.report, null);
        assert.deepEqual((await listSearchConsoleWebsiteChoices(seo)).map((site) => site.selected), [false, false]);
        const before = queries;
        await assert.rejects(loadSearchConsoleReport(seo, sites[0], range), /belum Anda pilih/);
        assert.equal(queries, before, "unselected properties never reach Search Analytics");
        await assert.rejects(saveSearchConsoleWebsites(seo, ["sc-domain:not-in-team.example"]), /tidak lagi tersedia/);
        await assert.rejects(saveSearchConsoleWebsites(seo, "not-an-array"), /tidak valid/);
        await assert.rejects(saveSearchConsoleWebsites(advertiser, [sites[0]]), /tidak memiliki akses/);
        await assert.rejects(listSearchConsoleWebsiteChoices(advertiser), /tidak memiliki akses/);
        await assert.rejects(loadSearchConsoleReport(advertiser, undefined, range), /tidak memiliki akses/);
        assert.deepEqual(await saveSearchConsoleWebsites(seo, [sites[0], sites[0]]), [sites[0]]);
        await saveSearchConsoleWebsites(otherSeo, [sites[1]]);
        await saveSearchConsoleWebsites(webmaster, [sites[0]]);
        // Shown like ad accounts: kind, permission, and the teammates who picked it (a website can be shared).
        const seen = await listSearchConsoleWebsiteChoices(otherSeo);
        assert.deepEqual(seen.map((c) => [c.kind, c.permission, c.selected]), [["url", "siteOwner", true], ["domain", "siteOwner", false]]);
        assert.ok(["GSC seo", "GSC webmaster"].every((n) => seen.find((c) => c.siteUrl === sites[0])!.usedBy.includes(n)));
        assert.ok(!seen.find((c) => c.siteUrl === sites[1])!.usedBy.includes("GSC seo"), "nobody else picked the second one");
        // Pick / Lepas one at a time, keeping the others: more than one website per member.
        assert.deepEqual(await toggleSearchConsoleWebsite(seo, sites[1], true), [sites[0], sites[1]]);
        assert.deepEqual(await toggleSearchConsoleWebsite(seo, sites[1], false), [sites[0]]);
        await assert.rejects(toggleSearchConsoleWebsite(seo, "sc-domain:not-in-team.example", true), /tidak lagi tersedia/);
        await assert.rejects(toggleSearchConsoleWebsite(advertiser, sites[0], true), /tidak memiliki akses/);
        const [stored] = await tx.select().from(appSettings).where(eq(appSettings.key, `user.${seo.id}.search_console.sites`));
        assert.deepEqual(JSON.parse(stored.value), [sites[0]]);
        assert.equal(stored.updatedById, seo.id);
        const report = await loadSearchConsoleReport(seo, undefined, range);
        assert.equal(report?.siteUrl, sites[0]);
        assert.deepEqual(report?.sites.map((site) => site.siteUrl), [sites[0]]);
        assert.equal(report?.report?.total?.clicks, 5);
        assert.equal((await loadSearchConsoleReport(otherSeo, undefined, range))?.siteUrl, sites[1]);
        await assert.rejects(loadSearchConsoleReport(seo, sites[1], range), /belum Anda pilih/);
        assert.equal((await loadSearchConsoleReport(supervisor, sites[1], range))?.sites.length, 2);
        // Daily SEO report: the member's own websites summed (supervisor: all), fresh data, top-10 keywords counted.
        const day = range.end;
        const own = await seoReportFigures(seo, day);
        assert.deepEqual([own.sites.map((x) => x.siteUrl), own.clicks, own.impressions, own.top10, own.final], [[sites[0]], 5, 50, 1, true]);
        assert.deepEqual([(await seoReportFigures(supervisor, day)).sites.length, (await seoReportFigures(supervisor, day)).clicks], [2, 10]);
        await assert.rejects(seoReportFigures(seo, "2999-01-01"), /belum ada/);
        await assert.rejects(seoReportFigures(advertiser, day), /tidak memiliki akses/);
        const fresh = await seoReportFigures(seo, searchConsoleToday());
        assert.equal(fresh.final, false, "the last days are marked as not final yet");
        // Revoked properties remain removable, but cannot be read using an old selection.
        sites = [sites[1]];
        const missing = (await listSearchConsoleWebsiteChoices(seo)).find((site) => site.selected);
        assert.equal(missing?.available, false);
        await assert.rejects(loadSearchConsoleReport(seo, undefined, range), /akses telah dicabut/);
        await disconnectSearchConsole(supervisor.id);
        assert.equal((await listSearchConsoleWebsiteChoices(seo))[0].selected, true);
        await saveSearchConsoleWebsites(seo, []);
        assert.deepEqual(await listSearchConsoleWebsiteChoices(seo), []);
        assert.equal((await listSearchConsoleWebsiteChoices(otherSeo)).length, 1, "one user's changes never overwrite another user's selection");
      } finally { for (const m of mocks) m.mock.restore(); }
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { global.fetch = original; }
});
