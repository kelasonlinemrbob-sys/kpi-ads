/** Pure mapping for the existing Daily Reports sheet (A:J); K:L belong to its users. */
export const SHEETS_MARKER_HEADER = "__KPI_ADS_REPORT_KEY_V1";
export const SHEETS_KEY_PREFIX = "kpiads:report:v1:";
export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
export type SheetCell = string | number;
export type SheetsReportSource = {
  userId: number;
  name: string;
  reportId: number;
  reportDate: string;
  submittedAt: Date;
  updatedAt: Date;
  summary: string;
  campaignId: number;
  window: string;
  performanceDate: string;
  platform: string;
  product: string;
  spent: number;
  impressions: number;
  clicks: number;
  leads: number;
};
export type SheetsReportRow = { key: string; values: SheetCell[] };

export function jakartaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function jakartaTimestamp(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}
export function fullDaySheetRows(source: SheetsReportSource[], today = jakartaDate()) {
  const selected = new Map<string, SheetsReportSource>();
  for (const row of source) {
    // A historical today_to_cutoff row never becomes a 24-hour result merely by aging.
    if (row.window !== "previous_day" || row.performanceDate >= today || row.performanceDate >= row.reportDate) continue;
    const key = `${SHEETS_KEY_PREFIX}${row.userId}:${row.performanceDate}:${row.campaignId}`;
    const old = selected.get(key);
    if (!old || row.updatedAt > old.updatedAt || (row.updatedAt.getTime() === old.updatedAt.getTime() && row.reportId > old.reportId))
      selected.set(key, row);
  }
  return [...selected]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, row]): SheetsReportRow => ({
        key,
        values: [
          jakartaTimestamp(row.submittedAt),
          row.name,
          row.performanceDate,
          row.platform === "meta" ? "Facebook" : row.platform === "google" ? "Google" : row.platform,
          row.product,
          row.spent,
          row.impressions,
          row.clicks,
          row.leads,
          row.summary,
        ],
      }),
    );
}
export function parseSheetsDestination(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Isi URL Google Sheets lengkap beserta gid tab tujuan.");
  }
  const id = /^\/spreadsheets\/d\/([\w-]+)(?:\/|$)/.exec(url.pathname)?.[1];
  const gid = new URLSearchParams(url.hash.slice(1)).get("gid") ?? url.searchParams.get("gid");
  if (
    url.protocol !== "https:" ||
    url.hostname !== "docs.google.com" ||
    !id ||
    !gid ||
    !/^\d+$/.test(gid) ||
    !Number.isSafeInteger(Number(gid))
  )
    throw new Error("URL harus berasal dari docs.google.com/spreadsheets dan memiliki gid tab tujuan.");
  return { spreadsheetId: id, sheetId: Number(gid) };
}
export function sheetsUrl(destination: { spreadsheetId: string; sheetId: number }) {
  return `https://docs.google.com/spreadsheets/d/${destination.spreadsheetId}/edit#gid=${destination.sheetId}`;
}
export function columnName(index: number) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}
export function sheetRange(title: string, range: string) {
  return `'${title.replaceAll("'", "''")}'!${range}`;
}
export function validateReportHeaders(headers: SheetCell[]) {
  const expected = ["timestamp", "timestamp", "date", "platform", "product", "spent", "impression", "click", "result lead", "catatan"];
  const normalized = headers.map((v) => String(v).trim().toLowerCase());
  // The legacy sheet calls column B Timestamp, but stores advertiser names there.
  if (
    expected.some((value, index) =>
      index === 1 ? !["timestamp", "nama", "advertiser", "nama advertiser"].includes(normalized[index]) : normalized[index] !== value,
    )
  ) {
    throw new Error(
      "Header tab tidak sesuai template. Kolom A–J harus: Timestamp, Timestamp/Nama advertiser, Date, Platform, Product, Spent, Impression, Click, Result Lead, Catatan. Tidak ada data yang diubah.",
    );
  }
}
export function planSheetSync(existing: SheetCell[][], markerColumn: number, desired: SheetsReportRow[]) {
  const managed = new Map<string, number>();
  existing.slice(1).forEach((row, index) => {
    const key = String(row[markerColumn] ?? "");
    if (!key.startsWith(SHEETS_KEY_PREFIX)) return;
    if (managed.has(key)) throw new Error("Penanda laporan duplikat ditemukan di sheet. Rapikan baris duplikat sebelum sinkronisasi.");
    managed.set(key, index + 1);
  });
  let nextRow = Math.max(1, existing.length);
  const changes: { rowIndex: number; key: string; values: SheetCell[]; kind: "append" | "update" | "remove" }[] = [];
  let unchanged = 0;
  for (const row of desired) {
    const index = managed.get(row.key);
    if (index === undefined) changes.push({ rowIndex: nextRow++, ...row, kind: "append" });
    else {
      managed.delete(row.key);
      if (row.values.every((v, col) => v === (existing[index][col] ?? ""))) unchanged++;
      else changes.push({ rowIndex: index, ...row, kind: "update" });
    }
  }
  // Only managed report cells are cleared; legacy rows and K:L are never overwritten.
  for (const [key, rowIndex] of managed) changes.push({ rowIndex, key, values: Array(10).fill(""), kind: "remove" });
  return { changes, unchanged };
}
