import "server-only";
import { z } from "zod";
import { previousRange, searchConsoleRange, type SearchConsoleCredentials } from "./search-console-input";

export class SearchConsoleError extends Error {}
export const searchConsoleSite = z.object({ siteUrl: z.string().min(1), permissionLevel: z.enum(["siteOwner", "siteFullUser", "siteRestrictedUser", "siteUnverifiedUser"]) });
export type SearchConsoleSite = z.infer<typeof searchConsoleSite>;
const metrics = z.object({ keys: z.array(z.string()).optional(), clicks: z.number().nonnegative(), impressions: z.number().nonnegative(), ctr: z.number().min(0).max(1), position: z.number().nonnegative() });
export type SearchConsoleRow = z.infer<typeof metrics>;
export type SearchConsolePeriod = { total: SearchConsoleRow | null; daily: SearchConsoleRow[]; queries: SearchConsoleRow[]; pages: SearchConsoleRow[] };
export type SearchConsoleReport = SearchConsolePeriod & {
  devices: SearchConsoleRow[];
  countries: SearchConsoleRow[];
  /** The same number of days just before, for the change in every figure; null when Google refuses it. */
  previous: (SearchConsolePeriod & { range: { start: string; end: string } }) | null;
};
/** Keywords and pages read per period: enough to compare the top ones with the previous period. */
const TOP_ROWS = 250;

function apiError(body: unknown, status: number) {
  const parsed = z.object({ error: z.object({ details: z.array(z.object({ reason: z.string().optional() })).optional() }).optional() }).safeParse(body);
  const reasons = parsed.success ? parsed.data.error?.details?.map((d) => d.reason) ?? [] : [];
  if (reasons.includes("SERVICE_DISABLED")) return new SearchConsoleError("Aktifkan Google Search Console API pada Google Cloud project pemilik Client ID.");
  if (reasons.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT")) return new SearchConsoleError("Refresh Token belum memiliki scope https://www.googleapis.com/auth/webmasters.readonly. Buat token baru dengan izin tersebut.");
  if (status === 401) return new SearchConsoleError("Otorisasi Search Console kedaluwarsa. Hubungkan kembali dengan Refresh Token baru.");
  if (status === 403) return new SearchConsoleError("Akses Search Console ditolak. Periksa izin properti, scope webmasters.readonly, dan aktivasi Search Console API.");
  if (status === 404) return new SearchConsoleError("Properti Search Console tidak ditemukan atau aksesnya telah dicabut.");
  if (status === 429 || status >= 500) return new SearchConsoleError("Search Console sedang sibuk atau kuota habis. Coba lagi nanti.");
  return new SearchConsoleError(`Permintaan Search Console gagal (HTTP ${status}). Periksa properti dan rentang tanggal.`);
}

export async function createSearchConsoleClient(credentials: SearchConsoleCredentials) {
  let token: string;
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(20_000),
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: credentials.clientId, client_secret: credentials.clientSecret, refresh_token: credentials.refreshToken }),
    });
    const body = await response.json();
    if (!response.ok || typeof body.access_token !== "string" || !body.access_token) throw new SearchConsoleError("Otorisasi Search Console gagal. Periksa Client ID, Client Secret, dan Refresh Token dari OAuth client yang sama.");
    token = body.access_token;
  } catch (error) {
    throw error instanceof SearchConsoleError ? error : new SearchConsoleError("Tidak dapat menghubungi otorisasi Google. Coba lagi nanti.");
  }
  async function request(path: string, body?: unknown): Promise<unknown> {
    try {
      const response = await fetch(`https://www.googleapis.com/webmasters/v3/${path}`, {
        method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal: AbortSignal.timeout(30_000),
      });
      const result: unknown = await response.json();
      if (!response.ok) throw apiError(result, response.status);
      return result;
    } catch (error) {
      throw error instanceof SearchConsoleError ? error : new SearchConsoleError("Respons Search Console tidak dapat dibaca. Coba lagi nanti.");
    }
  }
  async function listSites() {
    const parsed = z.object({ siteEntry: z.array(searchConsoleSite).optional() }).safeParse(await request("sites"));
    if (!parsed.success) throw new SearchConsoleError("Daftar properti Search Console tidak valid. Coba lagi nanti.");
    return (parsed.data.siteEntry ?? []).filter((site) => site.permissionLevel !== "siteUnverifiedUser").sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
  }
  /** `fresh`: include Google's not-yet-final data (the last 2–3 days), for daily reports. */
  async function query(siteUrl: string, range: { start: string; end: string }, dimension?: "date" | "query" | "page" | "device" | "country", opts: { fresh?: boolean; rowLimit?: number } = {}) {
    searchConsoleRange(range);
    const parsed = z.object({ rows: z.array(metrics).optional() }).safeParse(await request(`sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      startDate: range.start, endDate: range.end, type: "web", dataState: opts.fresh ? "all" : "final",
      dimensions: dimension ? [dimension] : [], rowLimit: opts.rowLimit ?? (dimension === "date" ? 1000 : dimension === "query" || dimension === "page" ? TOP_ROWS : dimension ? 50 : 1),
      aggregationType: dimension === "page" ? "auto" : "byProperty",
    }));
    if (!parsed.success) throw new SearchConsoleError("Data performa Search Console tidak valid. Coba lagi nanti.");
    return parsed.data.rows ?? [];
  }
  async function period(siteUrl: string, range: { start: string; end: string }): Promise<SearchConsolePeriod> {
    const [total, daily, queries, pages] = await Promise.all([
      query(siteUrl, range), query(siteUrl, range, "date"), query(siteUrl, range, "query"), query(siteUrl, range, "page"),
    ]);
    // Site totals come from an ungrouped request, never from summing truncated/anonymized query rows.
    return { total: total[0] ?? null, daily, queries, pages };
  }
  async function report(siteUrl: string, range: { start: string; end: string }): Promise<SearchConsoleReport> {
    const before = previousRange(range);
    const [current, devices, countries, previous] = await Promise.all([
      period(siteUrl, range), query(siteUrl, range, "device"), query(siteUrl, range, "country"),
      // Older than Search Console keeps (16 months): the page still works without the comparison.
      period(siteUrl, before).then((p) => ({ ...p, range: before })).catch(() => null),
    ]);
    return { ...current, devices, countries, previous };
  }
  return { listSites, query, report };
}
