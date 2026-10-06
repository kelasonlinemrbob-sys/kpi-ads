import "server-only";
import { Client } from "pg";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { advertiserReportItems, appSettings, dailyReports, users } from "@/db/schema";
import { decryptSecret, encryptSecret } from "./secret-box";
import { getSharedSheetsCredentials } from "./google-connection";
import {
  createSheetsClient,
  ensureMarkerColumn,
  inspectReportSheet,
  readReportSheetRows,
  SheetsError,
  sheetsErrorMessage,
} from "./google-sheets-client";
import { fullDaySheetRows, jakartaDate, parseSheetsDestination, planSheetSync, sheetsUrl } from "./sheets-report";

const CONNECTION_KEY = "sheets.connection";
const STATUS_KEY = "sheets.status";
const LOCK_KEY = 7_302_419;
export type SheetsConnection = { spreadsheetId: string; sheetId: number; enabled: boolean; refreshToken?: string; clientId?: string; clientSecret?: string };
export type SheetsSyncResult = {
  at: string;
  eligible: number;
  excluded: number;
  appended: number;
  updated: number;
  removed: number;
  unchanged: number;
};
type SyncStatus = { checkedAt?: string; title?: string; tab?: string; error?: string; result?: SheetsSyncResult };
export type SheetsStatus = {
  url: string;
  configured: boolean;
  enabled: boolean;
  hasRefreshToken: boolean;
  hasGoogleClient: boolean;
  clientId: string;
  hasClientSecret: boolean;
  eligible: number;
  excluded: number;
} & SyncStatus;
async function readSetting(key: string) {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key));
  return row?.value;
}
async function putSetting(key: string, value: string, userId?: number) {
  await db
    .insert(appSettings)
    .values({ key, value, updatedById: userId ?? null })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date(), ...(userId ? { updatedById: userId } : {}) } });
}
export async function readSheetsConnection(): Promise<SheetsConnection | null> {
  const stored = await readSetting(CONNECTION_KEY);
  if (!stored) return null;
  try {
    const plain = decryptSecret(stored);
    if (!plain) throw new Error();
    const parsed = JSON.parse(plain) as SheetsConnection;
    if (
      !/^[\w-]+$/.test(parsed.spreadsheetId) ||
      !Number.isSafeInteger(parsed.sheetId) ||
      parsed.sheetId < 0 ||
      typeof parsed.enabled !== "boolean"
    )
      throw new Error();
    return parsed;
  } catch {
    throw new SheetsError("Konfigurasi Sheets tidak dapat dibaca. Simpan ulang koneksi Google Sheets.");
  }
}
async function readStatus(): Promise<SyncStatus> {
  const value = await readSetting(STATUS_KEY);
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}
export async function getSheetsReportData() {
  const source = await db
    .select({
      userId: users.id,
      name: users.name,
      reportId: dailyReports.id,
      reportDate: dailyReports.date,
      submittedAt: dailyReports.createdAt,
      updatedAt: dailyReports.updatedAt,
      summary: dailyReports.summary,
      campaignId: advertiserReportItems.campaignId,
      window: advertiserReportItems.window,
      performanceDate: advertiserReportItems.performanceDate,
      platform: advertiserReportItems.platform,
      product: advertiserReportItems.product,
      spent: advertiserReportItems.spent,
      impressions: advertiserReportItems.impressions,
      clicks: advertiserReportItems.clicks,
      leads: advertiserReportItems.leads,
    })
    .from(advertiserReportItems)
    .innerJoin(dailyReports, eq(dailyReports.id, advertiserReportItems.reportId))
    .innerJoin(users, eq(users.id, dailyReports.userId))
    .where(eq(dailyReports.source, "app"));
  const rows = fullDaySheetRows(source, jakartaDate());
  return {
    rows,
    excluded: source.filter((r) => r.window !== "previous_day" || r.performanceDate >= jakartaDate() || r.performanceDate >= r.reportDate)
      .length,
  };
}
export async function getSheetsStatus(): Promise<SheetsStatus> {
  const [status, google, data] = await Promise.all([readStatus(), getSharedSheetsCredentials(), getSheetsReportData()]);
  let connection: SheetsConnection | null = null;
  try {
    connection = await readSheetsConnection();
  } catch (error) {
    status.error = sheetsErrorMessage(error);
  }
  return {
    ...status,
    url: connection ? sheetsUrl(connection) : "",
    configured: Boolean(connection),
    enabled: connection?.enabled ?? false,
    hasRefreshToken: Boolean(connection?.refreshToken),
    hasGoogleClient: Boolean(connection?.clientSecret && connection.clientId || google),
    clientId: connection?.clientId || google?.clientId || "",
    hasClientSecret: Boolean(connection?.clientSecret || google?.clientSecret),
    eligible: data.rows.length,
    excluded: data.excluded,
  };
}
async function credentialsFor(connection: SheetsConnection) {
  if (connection.clientId && connection.clientSecret && connection.refreshToken)
    return { clientId: connection.clientId, clientSecret: connection.clientSecret, refreshToken: connection.refreshToken, loginCustomerId: "" };
  // Legacy Sheets credentials are kept independent from personal Google Ads changes.
  const google = await getSharedSheetsCredentials();
  if (!google) throw new SheetsError("Isi Client ID, Client Secret, dan Refresh Token Google Sheets.");
  if (connection.refreshToken && connection.clientId !== google.clientId)
    throw new SheetsError("Client ID berubah. Simpan kredensial dan Refresh Token Sheets yang sesuai.");
  return { ...google, refreshToken: connection.refreshToken || google.refreshToken };
}
/** Dedicated session lock serializes timer, manual sync and connection changes across processes. */
async function withSheetsLock<T>(operation: () => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [LOCK_KEY]);
    if (!result.rows[0]?.locked) throw new SheetsError("Sinkronisasi Google Sheets sedang berjalan. Tunggu sebentar lalu muat ulang.");
    return await operation();
  } finally {
    await client.end();
  }
}
export async function saveSheetsConnection(input: { url: string; refreshToken: string; enabled: boolean; clientId?: string; clientSecret?: string }, userId: number) {
  let destination: ReturnType<typeof parseSheetsDestination>;
  try {
    destination = parseSheetsDestination(input.url);
  } catch (error) {
    throw new SheetsError((error as Error).message);
  }
  if (input.refreshToken.length > 4000 || /\s/.test(input.refreshToken))
    throw new SheetsError("Refresh Token tidak valid: hapus spasi dan gunakan token dari OAuth Playground.");
  return withSheetsLock(async () => {
    const previous = await readSheetsConnection().catch(() => null);
    const legacy = await getSharedSheetsCredentials();
    const current: {clientId?: string; clientSecret?: string; refreshToken?: string} = previous?.clientSecret ? previous : { ...legacy, refreshToken: previous?.refreshToken || legacy?.refreshToken };
    const clientId = input.clientId?.trim() || current?.clientId || "";
    const clientSecret = input.clientSecret?.trim() || current?.clientSecret || "";
    const refreshToken = input.refreshToken || current?.refreshToken || "";
    if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId) || clientId.length > 250)
      throw new SheetsError("Client ID Google Sheets tidak valid.");
    if (!clientSecret || clientSecret.length > 1000 || /\s/.test(clientSecret)) throw new SheetsError("Client Secret Google Sheets tidak valid.");
    if (!refreshToken) throw new SheetsError("Isi Refresh Token dengan izin spreadsheets.");
    if (current?.clientId && clientId !== current.clientId && (!input.clientSecret?.trim() || !input.refreshToken))
      throw new SheetsError("Jika Client ID diganti, isi juga Client Secret dan Refresh Token Sheets baru.");
    const connection: SheetsConnection = { ...destination, enabled: input.enabled, clientId, clientSecret, refreshToken };
    const client = await createSheetsClient(await credentialsFor(connection));
    const info = await inspectReportSheet(client, connection.spreadsheetId, connection.sheetId);
    await putSetting(CONNECTION_KEY, encryptSecret(JSON.stringify(connection)), userId);
    const old = previous?.spreadsheetId === connection.spreadsheetId && previous.sheetId === connection.sheetId ? await readStatus() : {};
    await putSetting(
      STATUS_KEY,
      JSON.stringify({ ...old, checkedAt: new Date().toISOString(), title: info.title, tab: info.sheet.title, error: undefined }),
      userId,
    );
    return info;
  });
}
export async function pauseSheetsSync(userId: number) {
  return withSheetsLock(async () => {
    const connection = await readSheetsConnection();
    if (connection) await putSetting(CONNECTION_KEY, encryptSecret(JSON.stringify({ ...connection, enabled: false })), userId);
  });
}
export async function syncGoogleSheets(options: { automatic?: boolean } = {}) {
  return withSheetsLock(async () => {
    const connection = await readSheetsConnection();
    if (!connection || (options.automatic && !connection.enabled)) return { skipped: true as const };
    const oldStatus = await readStatus();
    try {
      const client = await createSheetsClient(await credentialsFor(connection));
      const info = await inspectReportSheet(client, connection.spreadsheetId, connection.sheetId);
      const { rows, excluded } = await getSheetsReportData();
      // On an empty app, do not alter the destination's structure merely to run a test.
      if (!rows.length && info.markerColumn === null) {
        const result = { at: new Date().toISOString(), eligible: 0, excluded, appended: 0, updated: 0, removed: 0, unchanged: 0 };
        await putSetting(STATUS_KEY, JSON.stringify({ checkedAt: result.at, title: info.title, tab: info.sheet.title, result }));
        return { skipped: false as const, result };
      }
      const markerColumn = await ensureMarkerColumn(client, connection.spreadsheetId, info.sheet, info.markerColumn);
      const existing = await readReportSheetRows(client, connection.spreadsheetId, info.sheet, markerColumn);
      const plan = planSheetSync(existing, markerColumn, rows);
      let capacity = info.sheet.gridProperties.rowCount;
      for (let start = 0; start < plan.changes.length; start += 100) {
        const chunk = plan.changes.slice(start, start + 100);
        const required = Math.max(...chunk.map((change) => change.rowIndex + 1));
        const requests: unknown[] = [];
        if (required > capacity)
          requests.push({ appendDimension: { sheetId: connection.sheetId, dimension: "ROWS", length: required - capacity } });
        for (const change of chunk) {
          if (change.kind === "append" && existing.length > 1)
            requests.push({
              copyPaste: {
                source: {
                  sheetId: connection.sheetId,
                  startRowIndex: existing.length - 1,
                  endRowIndex: existing.length,
                  startColumnIndex: 0,
                  endColumnIndex: 10,
                },
                destination: {
                  sheetId: connection.sheetId,
                  startRowIndex: change.rowIndex,
                  endRowIndex: change.rowIndex + 1,
                  startColumnIndex: 0,
                  endColumnIndex: 10,
                },
                pasteType: "PASTE_FORMAT",
              },
            });
          requests.push({
            updateCells: {
              start: { sheetId: connection.sheetId, rowIndex: change.rowIndex, columnIndex: 0 },
              rows: [
                {
                  values: change.values.map((value) => ({
                    userEnteredValue: typeof value === "number" ? { numberValue: value } : { stringValue: value },
                  })),
                },
              ],
              fields: "userEnteredValue",
            },
          });
          requests.push({
            updateCells: {
              start: { sheetId: connection.sheetId, rowIndex: change.rowIndex, columnIndex: markerColumn },
              rows: [{ values: [{ userEnteredValue: { stringValue: change.kind === "remove" ? "" : change.key } }] }],
              fields: "userEnteredValue",
            },
          });
        }
        // Values and stable keys are atomic: a lost response cannot cause duplicate rows on retry.
        await client.request(`${connection.spreadsheetId}:batchUpdate`, { requests });
        capacity = Math.max(capacity, required);
      }
      const result: SheetsSyncResult = {
        at: new Date().toISOString(),
        eligible: rows.length,
        excluded,
        appended: plan.changes.filter((c) => c.kind === "append").length,
        updated: plan.changes.filter((c) => c.kind === "update").length,
        removed: plan.changes.filter((c) => c.kind === "remove").length,
        unchanged: plan.unchanged,
      };
      await putSetting(STATUS_KEY, JSON.stringify({ checkedAt: result.at, title: info.title, tab: info.sheet.title, result }));
      return { skipped: false as const, result };
    } catch (error) {
      const message =
        error instanceof SheetsError
          ? error.message
          : error instanceof Error && error.message.startsWith("Penanda laporan duplikat")
            ? error.message
            : sheetsErrorMessage(error);
      await putSetting(STATUS_KEY, JSON.stringify({ ...oldStatus, checkedAt: new Date().toISOString(), error: message }));
      throw new SheetsError(message);
    }
  });
}
