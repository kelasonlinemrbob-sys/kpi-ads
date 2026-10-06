import "server-only";
import type { GoogleCredentials } from "./google-credentials";
import { SHEETS_MARKER_HEADER, columnName, sheetRange, validateReportHeaders, type SheetCell } from "./sheets-report";

export class SheetsError extends Error {}
export function sheetsErrorMessage(error: unknown) {
  return error instanceof SheetsError ? error.message : "Google Sheets belum dapat diproses. Periksa koneksi server dan coba lagi.";
}
function apiError(body: { error?: { status?: string; details?: { reason?: string }[] } }, status: number) {
  const reasons = body.error?.details?.map((d) => d.reason) ?? [];
  if (reasons.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT"))
    return new SheetsError(
      "Token belum memiliki izin Google Sheets. Buat Refresh Token dengan scope https://www.googleapis.com/auth/spreadsheets melalui OAuth Playground.",
    );
  if (reasons.includes("SERVICE_DISABLED"))
    return new SheetsError("Aktifkan Google Sheets API pada Google Cloud project pemilik Client ID.");
  if (status === 403)
    return new SheetsError(
      "Akses sheet ditolak. Akun Google harus memiliki akses Editor, termasuk izin mengedit tab/range yang diproteksi.",
    );
  if (status === 404)
    return new SheetsError("Spreadsheet tidak ditemukan atau akun Google tidak memiliki akses. Periksa URL dan pengaturan berbagi.");
  if (status === 429 || status >= 500)
    return new SheetsError("Google Sheets sedang sibuk atau kuota sementara habis. Sinkronisasi akan dicoba lagi pada jadwal berikutnya.");
  return new SheetsError(`Permintaan Google Sheets gagal (HTTP ${status}). Periksa tab tujuan, proteksi sel, dan konfigurasi koneksi.`);
}
export async function createSheetsClient(credentials: GoogleCredentials) {
  let token: string;
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: credentials.refreshToken,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json()) as { access_token?: string };
    if (!response.ok || !body.access_token)
      throw new SheetsError(
        "Otorisasi Google Sheets gagal. Periksa Client ID/Secret pada koneksi Google Ads dan buat ulang Refresh Token Sheets dari client yang sama.",
      );
    token = body.access_token;
  } catch (error) {
    throw error instanceof SheetsError ? error : new SheetsError("Tidak dapat menghubungi otorisasi Google. Coba lagi nanti.");
  }
  async function request<T>(path: string, body?: unknown): Promise<T> {
    try {
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      const result = await response.json();
      if (!response.ok) throw apiError(result, response.status);
      return result as T;
    } catch (error) {
      throw error instanceof SheetsError
        ? error
        : new SheetsError("Respons Google Sheets belum dapat dipastikan. Coba sinkron ulang; penanda baris mencegah pengiriman ganda.");
    }
  }
  return { request };
}
export type SheetsClient = Awaited<ReturnType<typeof createSheetsClient>>;
export type SheetInfo = { sheetId: number; title: string; gridProperties: { rowCount: number; columnCount: number } };
export async function inspectReportSheet(client: SheetsClient, spreadsheetId: string, sheetId: number) {
  const metadata = await client.request<{ properties: { title: string }; sheets: { properties: SheetInfo }[] }>(
    `${spreadsheetId}?fields=properties(title),sheets(properties)`,
  );
  const sheet = metadata.sheets.find((s) => s.properties.sheetId === sheetId)?.properties;
  if (!sheet?.gridProperties) throw new SheetsError("Tab dengan gid tersebut tidak ditemukan atau bukan tab data biasa.");
  const header = await client.request<{ values?: SheetCell[][] }>(
    `${spreadsheetId}/values/${encodeURIComponent(sheetRange(sheet.title, "1:1"))}?valueRenderOption=UNFORMATTED_VALUE`,
  );
  const headers = header.values?.[0] ?? [];
  try {
    validateReportHeaders(headers);
  } catch (error) {
    throw new SheetsError((error as Error).message);
  }
  const markerColumns = headers.flatMap((value, index) => (value === SHEETS_MARKER_HEADER ? [index] : []));
  if (markerColumns.length > 1 || (markerColumns.length && markerColumns[0] < 12))
    throw new SheetsError("Kolom penanda KPI Ads tidak valid atau duplikat. Tidak ada data yang diubah.");
  return { sheet, title: metadata.properties.title, markerColumn: markerColumns[0] ?? null };
}
export async function ensureMarkerColumn(client: SheetsClient, spreadsheetId: string, sheet: SheetInfo, markerColumn: number | null) {
  if (markerColumn !== null) return markerColumn;
  const column = Math.max(12, sheet.gridProperties.columnCount);
  await client.request(`${spreadsheetId}:batchUpdate`, {
    requests: [
      { appendDimension: { sheetId: sheet.sheetId, dimension: "COLUMNS", length: column + 1 - sheet.gridProperties.columnCount } },
      {
        updateCells: {
          start: { sheetId: sheet.sheetId, rowIndex: 0, columnIndex: column },
          rows: [{ values: [{ userEnteredValue: { stringValue: SHEETS_MARKER_HEADER } }] }],
          fields: "userEnteredValue",
        },
      },
      {
        updateDimensionProperties: {
          range: { sheetId: sheet.sheetId, dimension: "COLUMNS", startIndex: column, endIndex: column + 1 },
          properties: { hiddenByUser: true },
          fields: "hiddenByUser",
        },
      },
    ],
  });
  return column;
}
export async function readReportSheetRows(client: SheetsClient, spreadsheetId: string, sheet: SheetInfo, markerColumn: number) {
  const result = await client.request<{ values?: SheetCell[][] }>(
    `${spreadsheetId}/values/${encodeURIComponent(sheetRange(sheet.title, `A:${columnName(markerColumn)}`))}?valueRenderOption=UNFORMATTED_VALUE`,
  );
  return result.values ?? [];
}
