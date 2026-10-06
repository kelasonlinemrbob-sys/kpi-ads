import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { Client } from "pg";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { advertiserReportItems, appSettings, campaigns, dailyReports, users } from "@/db/schema";
import { getSheetsStatus, pauseSheetsSync, saveSheetsConnection, syncGoogleSheets } from "./google-sheets";
import { encryptSecret } from "./secret-box";
import { SHEETS_KEY_PREFIX } from "./sheets-report";
after(async () => {
  await db.$client.end();
});

test("full sync: exact values, encrypted credentials, atomic retry, updates/deletions, pause and concurrency (DB rolled back, Google mocked)", async () => {
  const rollback = new Error("ROLLBACK_SHEETS_FIXTURES");
  const originalFetch = globalThis.fetch;
  const legacy = [
    "2026-01-01 10:00:00",
    "legacy advertiser",
    "2025-12-31",
    "Facebook",
    "legacy product",
    100,
    20,
    2,
    1,
    "keep",
    "ID",
    "post",
  ];
  const grid: (string | number)[][] = [
    ["Timestamp", "Timestamp", "Date", "Platform", "Product", "Spent", "Impression", "Click", "Result Lead", "Catatan", "ID", "Post Name"],
    [...legacy],
  ];
  const properties = { sheetId: 12, title: "Rep", gridProperties: { rowCount: 2, columnCount: 12 } };
  let loseResponse = false;
  let tokenDenied = false;
  let requests = 0;
  globalThis.fetch = async (url, init) => {
    requests++;
    const path = String(url);
    if (path === "https://oauth2.googleapis.com/token")
      return tokenDenied ? Response.json({ error: "invalid_grant" }, { status: 400 }) : Response.json({ access_token: "test-access" });
    assert.ok(path.startsWith("https://sheets.googleapis.com/v4/spreadsheets/fixture-id"), "Unexpected network request");
    if (path.endsWith(":batchUpdate")) {
      const body = JSON.parse(String(init?.body));
      let writes = false;
      for (const request of body.requests) {
        if (request.appendDimension) {
          const d = request.appendDimension;
          if (d.dimension === "ROWS") properties.gridProperties.rowCount += d.length;
          else properties.gridProperties.columnCount += d.length;
        }
        if (request.updateCells) {
          const { start, rows, fields } = request.updateCells;
          assert.equal(fields, "userEnteredValue");
          for (let i = 0; i < rows.length; i++) {
            grid[start.rowIndex + i] ??= [];
            rows[i].values.forEach((cell: { userEnteredValue: { stringValue?: string; numberValue?: number } }, j: number) => {
              grid[start.rowIndex + i][start.columnIndex + j] =
                cell.userEnteredValue.numberValue ?? cell.userEnteredValue.stringValue ?? "";
            });
          }
          if (start.rowIndex > 0) writes = true;
        }
      }
      if (loseResponse && writes) {
        loseResponse = false;
        throw new Error("Mock connection lost AFTER commit");
      }
      return Response.json({ replies: [] });
    }
    if (path.includes("/values/")) return Response.json({ values: decodeURIComponent(path).includes("1:1") ? [grid[0]] : grid });
    return Response.json({ properties: { title: "Fixture Sheet" }, sheets: [{ properties }] });
  };
  try {
    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ name: "=SUM(1,2)", email: `sheets-${crypto.randomUUID()}@example.invalid`, passwordHash: "unused", role: "supervisor" })
        .returning();
      const [product] = await tx
        .insert(campaigns)
        .values({ name: "Fixture", product: "Fixture", platform: "meta", ownerId: user.id })
        .returning();
      const [report] = await tx
        .insert(dailyReports)
        .values({ userId: user.id, date: "2001-01-02", summary: "=IMPORTXML(unsafe)" })
        .returning();
      const [item] = await tx
        .insert(advertiserReportItems)
        .values([
          {
            reportId: report.id,
            campaignId: product.id,
            window: "previous_day",
            performanceDate: "2001-01-01",
            platform: "meta",
            product: "Fixture",
            spent: 99.25,
            impressions: 123,
            clicks: 4,
            leads: 2,
          },
          {
            reportId: report.id,
            campaignId: product.id,
            window: "today_to_cutoff",
            performanceDate: "2001-01-02",
            platform: "meta",
            product: "Fixture",
            spent: 45,
            impressions: 60,
            clicks: 2,
            leads: 1,
          },
        ])
        .returning();
      await tx.delete(appSettings).where(inArray(appSettings.key, ["google.connection", "sheets.connection", "sheets.status"]));
      await tx
        .insert(appSettings)
        .values({
          key: "google.connection",
          value: encryptSecret(
            JSON.stringify({
              credentials: {
                clientId: "fixture.apps.googleusercontent.com",
                clientSecret: "fixture-secret",
                refreshToken: "ads-token",
                loginCustomerId: "",
              },
            }),
          ),
        });
      const mocks = [
        mock.method(db, "select", tx.select.bind(tx)),
        mock.method(db, "insert", tx.insert.bind(tx)),
        mock.method(db, "update", tx.update.bind(tx)),
      ];
      try {
        await saveSheetsConnection(
          { url: "https://docs.google.com/spreadsheets/d/fixture-id/edit#gid=12", refreshToken: "sheets-private-token", enabled: true },
          user.id,
        );
        const status = await getSheetsStatus();
        assert.ok(status.hasRefreshToken);
        assert.ok(status.eligible > 0);
        assert.ok(!JSON.stringify(status).includes("sheets-private-token"));
        const [setting] = await tx.select().from(appSettings).where(eq(appSettings.key, "sheets.connection"));
        assert.ok(setting.value.startsWith("v1:"));
        assert.ok(!setting.value.includes("sheets-private-token"));
        await tx.delete(appSettings).where(eq(appSettings.key,"google.connection"));
        assert.equal((await getSheetsStatus()).hasGoogleClient,true,"Sheets keeps its own client after Ads configuration is removed");
        await assert.rejects(saveSheetsConnection({url:"https://docs.google.com/spreadsheets/d/fixture-id/edit#gid=12",clientId:"changed.apps.googleusercontent.com",refreshToken:"",enabled:true},user.id), /Client ID diganti/);
        loseResponse = true;
        await assert.rejects(syncGoogleSheets(), /Respons Google Sheets/);
        const firstLength = grid.length;
        const recovered = await syncGoogleSheets();
        assert.ok(!recovered.skipped);
        assert.equal(grid.length - firstLength, recovered.result.appended);
        const fullLength = grid.length;
        const rerun = await syncGoogleSheets();
        assert.ok(!rerun.skipped);
        assert.equal(rerun.result.appended, 0);
        assert.equal(grid.length, fullLength);
        assert.deepEqual(grid[1], legacy);
        const marker = properties.gridProperties.columnCount - 1;
        const key = `${SHEETS_KEY_PREFIX}${user.id}:2001-01-01:${product.id}`;
        const index = grid.findIndex((row) => row[marker] === key);
        assert.ok(index > 1);
        assert.equal(grid[index][5], 99.25);
        assert.equal(grid[index][9], "=IMPORTXML(unsafe)");
        assert.equal(grid[index][1], "=SUM(1,2)");
        assert.ok(!grid.some((r) => String(r[marker]).includes(`${user.id}:2001-01-02:`)));
        await tx.update(advertiserReportItems).set({ spent: 500 }).where(eq(advertiserReportItems.id, item.id));
        const changed = await syncGoogleSheets();
        assert.ok(!changed.skipped);
        assert.equal(changed.result.updated, 1);
        assert.equal(grid[index][5], 500);
        grid[index][10] = "user annotation";
        grid[index][11] = "post untouched";
        await tx
          .delete(advertiserReportItems)
          .where(and(eq(advertiserReportItems.reportId, report.id), eq(advertiserReportItems.window, "previous_day")));
        const removed = await syncGoogleSheets();
        assert.ok(!removed.skipped);
        assert.equal(removed.result.removed, 1);
        assert.deepEqual(grid[index].slice(0, 10), Array(10).fill(""));
        assert.equal(grid[index][10], "user annotation");
        assert.equal(grid[index][11], "post untouched");
        tokenDenied = true;
        await assert.rejects(
          saveSheetsConnection(
            { url: "https://docs.google.com/spreadsheets/d/fixture-id/edit#gid=12", refreshToken: "bad-new-token", enabled: true },
            user.id,
          ),
          /Otorisasi/,
        );
        assert.ok((await getSheetsStatus()).hasRefreshToken);
        tokenDenied = false;
        await pauseSheetsSync(user.id);
        const before = requests;
        assert.deepEqual(await syncGoogleSheets({ automatic: true }), { skipped: true });
        assert.equal(requests, before);
        const lock = new Client({ connectionString: process.env.DATABASE_URL });
        await lock.connect();
        try {
          await lock.query("SELECT pg_advisory_lock(7302419)");
          await assert.rejects(syncGoogleSheets(), /sedang berjalan/);
          assert.equal(requests, before);
        } finally {
          await lock.end();
        }
      } finally {
        mocks.forEach((m) => m.mock.restore());
      }
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    globalThis.fetch = originalFetch;
  }
});
