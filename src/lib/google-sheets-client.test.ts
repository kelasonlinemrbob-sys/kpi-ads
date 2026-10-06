import test from "node:test";
import assert from "node:assert/strict";
import {
  createSheetsClient,
  ensureMarkerColumn,
  inspectReportSheet,
  SheetsError,
  sheetsErrorMessage,
  type SheetsClient,
} from "./google-sheets-client";
const credentials = {
  clientId: "test.apps.googleusercontent.com",
  clientSecret: "do-not-log-secret",
  refreshToken: "do-not-log-token",
  loginCustomerId: "",
};
test("scope denial explains reauthorization without echoing credentials or API bodies", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).includes("oauth2.googleapis.com")
      ? Response.json({ access_token: "private-access" })
      : Response.json(
          { error: { message: "do-not-log-secret", details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } },
          { status: 403 },
        );
  try {
    const client = await createSheetsClient(credentials);
    await assert.rejects(
      client.request("test-id"),
      (error: unknown) => error instanceof SheetsError && error.message.includes("scope") && !error.message.includes("do-not-log"),
    );
  } finally {
    globalThis.fetch = original;
  }
  assert.ok(!sheetsErrorMessage(new Error("private-access")).includes("private-access"));
});
test("invalid headers / target tab fail before any metadata or value writes", async () => {
  const requests: string[] = [];
  const client = {
    request: async (path: string) => {
      requests.push(path);
      return path.includes("/values/")
        ? { values: [["Wrong header"]] }
        : {
            properties: { title: "Daily" },
            sheets: [{ properties: { sheetId: 4, title: "Rep", gridProperties: { rowCount: 100, columnCount: 12 } } }],
          };
    },
  } as SheetsClient;
  await assert.rejects(inspectReportSheet(client, "test", 4), /Header/);
  await assert.rejects(inspectReportSheet(client, "test", 5), /gid/);
  assert.ok(requests.every((path) => !path.includes(":batchUpdate")));
});
test("marker uses newly allocated hidden column, never overwrites ID/Post Name; existing marker reused", async () => {
  const calls: unknown[] = [];
  const client = {
    request: async (_path: string, body: unknown) => {
      calls.push(body);
      return {};
    },
  } as SheetsClient;
  const sheet = { sheetId: 4, title: "Rep", gridProperties: { rowCount: 100, columnCount: 26 } };
  assert.equal(await ensureMarkerColumn(client, "test", sheet, null), 26);
  const requests = (calls[0] as { requests: Record<string, any>[] }).requests;
  assert.equal(requests[0].appendDimension.length, 1);
  assert.equal(requests[1].updateCells.start.columnIndex, 26);
  assert.equal(requests[2].updateDimensionProperties.properties.hiddenByUser, true);
  assert.equal(await ensureMarkerColumn(client, "test", sheet, 26), 26);
  assert.equal(calls.length, 1);
});
