import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adAccounts } from "@/db/schema";
import { GoogleConnectionError, googleAdsPost, googleSearchWithCredentials } from "./google-client";
import { getGoogleCredentials } from "./google-connection";
import { cleanSeeds, parsePlannerRow, type ApiKeywordRow, type PlannerKeyword } from "./keyword-planner-data";

/**
 * Google Keyword Planner through the team's Google Ads connection (KeywordPlanIdeaService). It needs Basic
 * or Standard access on the Google Ads API project; with Explorer access Google refuses it. Results are
 * cached in memory for 12 hours: search volumes change monthly and the API has a daily quota.
 */

export const PLANNER_LANGUAGES = { id: { label: "Bahasa Indonesia", constant: "languageConstants/1025" }, en: { label: "Bahasa Inggris", constant: "languageConstants/1000" } } as const;
export const PLANNER_LOCATIONS = { id: { label: "Indonesia", constants: ["geoTargetConstants/2360"] }, all: { label: "Semua lokasi", constants: [] as string[] } } as const;
export type PlannerLanguage = keyof typeof PLANNER_LANGUAGES;
export type PlannerLocation = keyof typeof PLANNER_LOCATIONS;
export type PlannerOptions = { language: PlannerLanguage; location: PlannerLocation };

export class KeywordPlannerError extends Error {}
export const PLANNER_ACCESS_MESSAGE =
  "Keyword Planner butuh akses Basic atau Standard pada Google Ads API. Project Google Cloud tim masih Explorer access: ajukan Basic access di Google Ads API (Google Cloud → Google Ads API → Overview / API Center di akun MCC). Setelah disetujui, fitur ini langsung aktif.";

function plannerError(error: unknown) {
  if (error instanceof KeywordPlannerError) return error;
  if (error instanceof GoogleConnectionError) {
    if (error.codes.includes("DEVELOPER_TOKEN_NOT_APPROVED") || error.codes.includes("CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION")) return new KeywordPlannerError(PLANNER_ACCESS_MESSAGE);
    return new KeywordPlannerError(error.message);
  }
  return new KeywordPlannerError("Keyword Planner belum dapat diproses. Coba lagi nanti.");
}

const TTL = 12 * 3600_000;
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return value;
}

/** The Google Ads account the planner runs in (it costs nothing): GOOGLE_KEYWORD_PLANNER_CUSTOMER_ID, else the first registered one. */
async function plannerAccount() {
  const credentials = await getGoogleCredentials();
  if (!credentials) throw new KeywordPlannerError("Koneksi Google Ads tim belum diisi. Supervisor dapat mengisinya di Pengaturan → Integrasi → Google Ads.");
  const fixed = process.env.GOOGLE_KEYWORD_PLANNER_CUSTOMER_ID?.replace(/\D/g, "");
  const customerId = fixed || (await db.select({ accountId: adAccounts.accountId }).from(adAccounts).where(eq(adAccounts.platform, "google")).orderBy(asc(adAccounts.id)).limit(1))[0]?.accountId;
  if (!customerId) throw new KeywordPlannerError("Belum ada akun Google Ads terdaftar. Tambahkan satu akun Google Ads di Campaigns → Akun iklan.");
  const currency = await cached(`currency:${customerId}`, async () => {
    const rows = await googleSearchWithCredentials<{ customer: { currencyCode?: string } }>(credentials, customerId, "SELECT customer.currency_code FROM customer LIMIT 1");
    return rows[0]?.customer.currencyCode ?? "IDR";
  });
  return { credentials, customerId, currency };
}

const target = (o: PlannerOptions) => ({
  language: PLANNER_LANGUAGES[o.language].constant,
  ...(PLANNER_LOCATIONS[o.location].constants.length ? { geoTargetConstants: PLANNER_LOCATIONS[o.location].constants } : {}),
  keywordPlanNetwork: "GOOGLE_SEARCH",
});

export type PlannerResult = { keywords: PlannerKeyword[]; currency: string };

/** New keyword ideas from seed keywords and/or a page of the site, with volume, trend, competition and bids. */
export async function keywordIdeas(input: { seeds: string[]; url?: string | null } & PlannerOptions, limit = 300): Promise<PlannerResult> {
  const seeds = cleanSeeds(input.seeds);
  const url = input.url && /^https?:\/\//.test(input.url) ? input.url : null;
  if (!seeds.length && !url) throw new KeywordPlannerError("Isi minimal satu kata kunci awal atau pakai halaman website.");
  try {
    const { credentials, customerId, currency } = await plannerAccount();
    const seed = seeds.length && url ? { keywordAndUrlSeed: { keywords: seeds, url } } : seeds.length ? { keywordSeed: { keywords: seeds } } : { urlSeed: { url } };
    const key = JSON.stringify(["ideas", customerId, seed, input.language, input.location]);
    const keywords = await cached(key, async () => {
      const rows: ApiKeywordRow[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < 3 && rows.length < limit; page++) {
        const res = await googleAdsPost<{ results?: ApiKeywordRow[]; nextPageToken?: string }>(credentials, customerId, "generateKeywordIdeas",
          { ...target(input), includeAdultKeywords: false, pageSize: Math.min(1000, limit), ...seed, ...(pageToken ? { pageToken } : {}) });
        rows.push(...(res.results ?? []));
        pageToken = res.nextPageToken;
        if (!pageToken) break;
      }
      return rows.map(parsePlannerRow).filter((k): k is PlannerKeyword => k !== null).sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1)).slice(0, limit);
    });
    return { keywords, currency };
  } catch (error) {
    throw plannerError(error);
  }
}

/** Search volume and the rest for keywords the site already has (e.g. its Search Console queries). */
export async function keywordVolumes(input: { keywords: string[] } & PlannerOptions): Promise<PlannerResult> {
  const keywords = cleanSeeds(input.keywords, 500);
  if (!keywords.length) return { keywords: [], currency: "IDR" };
  try {
    const { credentials, customerId, currency } = await plannerAccount();
    const key = JSON.stringify(["volumes", customerId, [...keywords].sort(), input.language, input.location]);
    const rows = await cached(key, async () => {
      const res = await googleAdsPost<{ results?: ApiKeywordRow[] }>(credentials, customerId, "generateKeywordHistoricalMetrics", { ...target(input), keywords });
      return (res.results ?? []).flatMap((r) => {
        const parsed = parsePlannerRow(r);
        // Google merges close variants into one row: give the figures to each variant the site asked for.
        return parsed ? [parsed, ...(r.closeVariants ?? []).filter((v) => v !== parsed.keyword).map((v) => ({ ...parsed, keyword: v }))] : [];
      });
    });
    return { keywords: rows, currency };
  } catch (error) {
    throw plannerError(error);
  }
}
