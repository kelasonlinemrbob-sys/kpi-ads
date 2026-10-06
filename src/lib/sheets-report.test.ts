import test from "node:test";
import assert from "node:assert/strict";
import {
  columnName,
  fullDaySheetRows,
  jakartaDate,
  parseSheetsDestination,
  planSheetSync,
  SHEETS_KEY_PREFIX,
  sheetRange,
  validateReportHeaders,
  type SheetsReportSource,
} from "./sheets-report";
const source: SheetsReportSource = {
  userId: 7,
  name: "Wahib",
  reportId: 10,
  reportDate: "2026-10-06",
  submittedAt: new Date("2026-10-06T03:00:00Z"),
  updatedAt: new Date("2026-10-06T03:00:00Z"),
  summary: "Optimasi iklan",
  campaignId: 8,
  window: "previous_day",
  performanceDate: "2026-10-05",
  platform: "meta",
  product: "Kelas Online",
  spent: 510337.25,
  impressions: 45867,
  clicks: 263,
  leads: 21,
};
test("exports exact A:J values for full days; never exports aging partials or current/future dates", () => {
  const result = fullDaySheetRows(
    [
      source,
      { ...source, campaignId: 9, window: "today_to_cutoff", performanceDate: "2026-10-02" },
      { ...source, campaignId: 10, performanceDate: "2026-10-06" },
      { ...source, campaignId: 11, performanceDate: "2026-10-07" },
    ],
    "2026-10-06",
  );
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].values, [
    "2026-10-06 10:00:00",
    "Wahib",
    "2026-10-05",
    "Facebook",
    "Kelas Online",
    510337.25,
    45867,
    263,
    21,
    "Optimasi iklan",
  ]);
  assert.equal(result[0].key, `${SHEETS_KEY_PREFIX}7:2026-10-05:8`);
});
test("Monday includes three separate full days and excludes Monday cutoff", () => {
  const result = fullDaySheetRows(
    ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"].map((performanceDate) => ({
      ...source,
      reportDate: "2026-10-05",
      performanceDate,
      window: performanceDate.endsWith("05") ? "today_to_cutoff" : "previous_day",
    })),
    "2026-10-06",
  );
  assert.deepEqual(
    result.map((r) => r.values[2]),
    ["2026-10-02", "2026-10-03", "2026-10-04"],
  );
});
test("stable identity survives resaving items and selects newest source; advertiser/product remain distinct", () => {
  const result = fullDaySheetRows(
    [
      source,
      { ...source, reportId: 30, spent: 900, updatedAt: new Date("2026-10-07T00:00:00Z") },
      { ...source, userId: 9 },
      { ...source, campaignId: 99, platform: "google" },
    ],
    "2026-10-07",
  );
  assert.equal(result.length, 3);
  assert.equal(result.find((r) => r.key.endsWith("7:2026-10-05:8"))!.values[5], 900);
  assert.ok(result.some((r) => r.values[3] === "Google"));
});
test("Jakarta midnight eligibility does not depend on server TZ", () => {
  assert.equal(jakartaDate(new Date("2026-10-05T16:59:59Z")), "2026-10-05");
  assert.equal(jakartaDate(new Date("2026-10-05T17:00:00Z")), "2026-10-06");
});
test("destination parses exact tab ID including zero and rejects off-domain or missing gid", () => {
  assert.deepEqual(parseSheetsDestination("https://docs.google.com/spreadsheets/d/test-id/edit?gid=15#gid=0"), {
    spreadsheetId: "test-id",
    sheetId: 0,
  });
  for (const url of [
    "https://evil.test/spreadsheets/d/x/edit#gid=0",
    "https://docs.google.com/spreadsheets/d/x/edit",
    "https://docs.google.com/spreadsheets/d/x/edit#gid=-2",
    "http://docs.google.com/spreadsheets/d/x/edit#gid=0",
  ])
    assert.throws(() => parseSheetsDestination(url));
  assert.equal(sheetRange("Bob's reports", "A:J"), "'Bob''s reports'!A:J");
  assert.equal(columnName(26), "AA");
  assert.equal(columnName(701), "ZZ");
});
test("upsert preserves legacy rows and detects moved rows by key; rerun is idempotent", () => {
  const desired = fullDaySheetRows([source], "2026-10-06");
  const existing = [
    Array(13).fill("header"),
    ["legacy", "manual data", "2026-10-04", "Facebook", "Product", 120],
    [...desired[0].values, "ID owned by user", "Post owned by user", desired[0].key],
  ];
  assert.deepEqual(planSheetSync(existing, 12, desired), { changes: [], unchanged: 1 });
  const updated = [{ ...desired[0], values: desired[0].values.map((value, index) => (index === 5 ? 123 : value)) }];
  const moved = [existing[0], existing[2], existing[1]];
  const plan = planSheetSync(moved, 12, updated);
  assert.equal(plan.changes[0].rowIndex, 1);
  assert.equal(plan.changes[0].values.length, 10);
  assert.equal(plan.changes[0].kind, "update");
  assert.equal(existing[2][10], "ID owned by user");
  const remove = planSheetSync(existing, 12, []);
  assert.equal(remove.changes.length, 1);
  assert.equal(remove.changes[0].kind, "remove");
  assert.equal(remove.changes[0].rowIndex, 2);
  const append = planSheetSync(existing.slice(0, 2), 12, desired);
  assert.equal(append.changes[0].rowIndex, 2);
  assert.throws(() => planSheetSync([existing[0], existing[2], existing[2]], 12, desired), /duplikat/);
});
test("header validation matches legacy template and fails closed before writes", () => {
  const headers = [
    "Timestamp",
    "Timestamp",
    "Date",
    "Platform",
    "Product",
    "Spent",
    "Impression",
    "Click",
    "Result Lead",
    "Catatan",
    "ID",
    "Post Name",
  ];
  assert.doesNotThrow(() => validateReportHeaders(headers));
  assert.doesNotThrow(() => validateReportHeaders(headers.map((h, i) => (i === 1 ? "Nama advertiser" : h))));
  assert.throws(() => validateReportHeaders(headers.map((h, i) => (i === 5 ? "Revenue" : h))), /Header/);
});
