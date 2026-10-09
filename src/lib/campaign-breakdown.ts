import "server-only";
import { googleConfigured, googleSearch, type AdsAccountRef } from "./ads-api";
import { emptyCampaignMetrics, type CampaignMetrics } from "./campaign-metrics";
import { parseMetaCampaign, type MetaCampaignInsight } from "./campaign-performance";
import { buildBreakdown, describeTargeting, treeStatus, type BreakdownAd, type BreakdownAdSet, type CampaignBreakdown, type MetaTargeting } from "./campaign-tree";
import { getMetaToken, META_API_VERSION, META_TOKEN_MISSING, metaErrorMessage, type MetaApiError } from "./meta-connection";
import { META_RESULT_FIELDS } from "./meta-results";

export type CampaignBreakdownResult = { ok: true; breakdown: CampaignBreakdown } | { ok: false; error: string };
export type CampaignBreakdownsResult = { ok: true; breakdowns: Map<string, CampaignBreakdown> } | { ok: false; error: string };

/** Currencies Meta reports budgets for in whole units instead of 1/100 (same list as the campaign sync). */
const META_ZERO_DECIMAL = new Set(["IDR", "JPY", "KRW", "VND", "CLP", "COP", "CRC", "HUF", "ISK", "PYG", "TWD"]);
const INSIGHT_FIELDS = `spend,impressions,reach,clicks,inline_link_clicks,outbound_clicks,actions,action_values,video_play_actions,video_thruplay_watched_actions,${META_RESULT_FIELDS}`;
/** Pages read per list, so a runaway account can't keep the request going. */
const MAX_PAGES = 20;
/** Campaign ids per request (Meta "IN" filter / GAQL IN list). */
const CHUNK = 50;

const chunks = <T,>(items: T[]) => Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, i) => items.slice(i * CHUNK, (i + 1) * CHUNK));

/** Ad sets and ads of one campaign for a period (Campaigns → Analisa AI). */
export async function fetchCampaignBreakdown(account: AdsAccountRef, campaignId: string, start: string, end: string): Promise<CampaignBreakdownResult> {
  const res = await fetchCampaignBreakdowns(account, [campaignId], start, end);
  return res.ok ? { ok: true, breakdown: res.breakdowns.get(campaignId)! } : res;
}

/**
 * Ad sets and ads of several campaigns of one ad account for a period, read at account level with a
 * campaign filter (a few requests per account, not per campaign). Metrics are aggregated over the whole
 * range at the API, like the campaign rows (reach is never summed). Every requested campaign gets an entry.
 */
export async function fetchCampaignBreakdowns(account: AdsAccountRef, campaignIds: string[], start: string, end: string): Promise<CampaignBreakdownsResult> {
  const ids = [...new Set(campaignIds)];
  if (!ids.length || ids.some((id) => !/^\d+$/.test(id))) return { ok: false, error: "ID campaign tidak valid." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return { ok: false, error: "Periode tidak valid." };
  try {
    const parts = await Promise.all(chunks(ids).map((chunk) => (account.platform === "google" ? googleBreakdowns(account, chunk, start, end) : metaBreakdowns(account, chunk, start, end))));
    return { ok: true, breakdowns: new Map(parts.flatMap((p) => [...p])) };
  } catch (error) {
    // Never expose request URLs (Meta tokens are in the query string) through network errors. Google's
    // own messages (e.g. an expired refresh token) carry no secrets and tell the supervisor what to fix.
    const google = account.platform === "google" && error instanceof Error && !error.message.includes("://") ? error.message : null;
    const known = error instanceof BreakdownError ? error.message : google;
    return { ok: false, error: known ?? `Ad ${account.platform === "google" ? "group" : "set"} gagal dimuat. Coba lagi beberapa saat lagi.` };
  }
}

class BreakdownError extends Error {}

type AdSetNode = Omit<BreakdownAdSet, "metrics" | "ads">;
type AdNode = Omit<BreakdownAd, "metrics"> & { adsetId: string };
type Grouped = {
  adsets: AdSetNode[];
  ads: AdNode[];
  adsetMetrics: Map<string, { name: string; metrics: CampaignMetrics }>;
  adMetrics: Map<string, { name: string; adsetId: string; metrics: CampaignMetrics }>;
};
const grouped = (ids: string[]) => new Map<string, Grouped>(ids.map((id) => [id, { adsets: [], ads: [], adsetMetrics: new Map(), adMetrics: new Map() }]));
function assemble(platform: "meta" | "google", currency: string, groups: Map<string, Grouped>, empty: () => CampaignMetrics) {
  return new Map([...groups].map(([id, g]) => [id, buildBreakdown({ platform, currency, empty, ...g })] as const));
}

/* ---------------------------------- Meta ---------------------------------- */

async function metaBreakdowns(account: AdsAccountRef, campaignIds: string[], start: string, end: string) {
  const token = await getMetaToken();
  if (!token) throw new BreakdownError(META_TOKEN_MISSING);
  const root = `https://graph.facebook.com/${META_API_VERSION}`;
  const act = `act_${account.accountId.replace(/\D/g, "")}`;
  const get = async (url: string) => {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
    const body = await response.json();
    if (!response.ok || body.error) throw new BreakdownError(metaErrorMessage(body.error as MetaApiError, response.status));
    return body;
  };
  const all = async <T,>(path: string, params: Record<string, string>) => {
    const url = new URL(`${root}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("access_token", token);
    const rows: T[] = [];
    let next: string | undefined = url.toString();
    for (let page = 0; next && page < MAX_PAGES; page++) {
      const body = await get(next);
      if (!Array.isArray(body.data)) throw new BreakdownError("Respons Meta tidak lengkap.");
      rows.push(...(body.data as T[]));
      next = body.paging?.next;
      if (next && new URL(next).origin !== "https://graph.facebook.com") throw new BreakdownError("Pagination Meta tidak valid.");
    }
    return rows;
  };
  const filtering = JSON.stringify([{ field: "campaign.id", operator: "IN", value: campaignIds }]);
  const range = JSON.stringify({ since: start, until: end });

  type AdSetRow = { id: string; name: string; campaign_id: string; effective_status?: string; daily_budget?: string; lifetime_budget?: string; optimization_goal?: string; targeting?: MetaTargeting };
  type AdRow = { id: string; name: string; campaign_id: string; adset_id: string; effective_status?: string; creative?: { thumbnail_url?: string } };
  type Insight = MetaCampaignInsight & { adset_id?: string; adset_name?: string; ad_id?: string; ad_name?: string };

  const [info, adsets, ads, adsetInsights, adInsights] = await Promise.all([
    get(`${root}/${act}?fields=currency&access_token=${encodeURIComponent(token)}`) as Promise<{ currency?: string }>,
    all<AdSetRow>(`${act}/adsets`, { fields: "id,name,campaign_id,effective_status,daily_budget,lifetime_budget,optimization_goal,targeting", filtering, limit: "200" }),
    all<AdRow>(`${act}/ads`, { fields: "id,name,campaign_id,adset_id,effective_status,creative{thumbnail_url}", filtering, limit: "200" }),
    all<Insight>(`${act}/insights`, { level: "adset", fields: `campaign_id,adset_id,adset_name,${INSIGHT_FIELDS}`, filtering, time_range: range, limit: "500" }),
    all<Insight>(`${act}/insights`, { level: "ad", fields: `campaign_id,ad_id,ad_name,adset_id,${INSIGHT_FIELDS}`, filtering, time_range: range, limit: "500" }),
  ]);
  const currency = info.currency ?? "";
  if (!/^[A-Z]{3}$/.test(currency)) throw new BreakdownError("Mata uang akun tidak tersedia.");
  const divisor = META_ZERO_DECIMAL.has(currency) ? 1 : 100;
  const money = (v?: string) => (v && Number(v) > 0 ? Number(v) / divisor : null);
  const parse = (row: Insight) => parseMetaCampaign({ ...row, campaign_name: "" }, currency);

  const groups = grouped(campaignIds);
  for (const s of adsets) {
    groups.get(s.campaign_id)?.adsets.push({
      id: s.id, name: s.name, status: treeStatus(s.effective_status), platformStatus: s.effective_status ?? null,
      dailyBudget: money(s.daily_budget), lifetimeBudget: money(s.lifetime_budget),
      optimizationGoal: s.optimization_goal ?? null, audience: describeTargeting(s.targeting),
    });
  }
  for (const a of ads) {
    groups.get(a.campaign_id)?.ads.push({ id: a.id, name: a.name, adsetId: a.adset_id, status: treeStatus(a.effective_status), platformStatus: a.effective_status ?? null, thumbnailUrl: safeImage(a.creative?.thumbnail_url) });
  }
  for (const r of adsetInsights) if (r.adset_id) groups.get(r.campaign_id)?.adsetMetrics.set(r.adset_id, { name: r.adset_name ?? r.adset_id, metrics: parse(r) });
  for (const r of adInsights) if (r.ad_id && r.adset_id) groups.get(r.campaign_id)?.adMetrics.set(r.ad_id, { name: r.ad_name ?? r.ad_id, adsetId: r.adset_id, metrics: parse(r) });
  return assemble("meta", currency, groups, () => emptyCampaignMetrics("meta", currency));
}

/** Only https images from Meta's CDN reach the page. */
function safeImage(url: string | undefined) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname.endsWith(".fbcdn.net") || u.hostname.endsWith(".facebook.com")) ? url : null;
  } catch {
    return null;
  }
}

/* --------------------------------- Google --------------------------------- */

type GoogleMetrics = { costMicros?: string; impressions?: string; clicks?: string; conversions?: number };

const AD_TYPE: Record<string, string> = {
  RESPONSIVE_SEARCH_AD: "Responsive search ad",
  RESPONSIVE_DISPLAY_AD: "Responsive display ad",
  EXPANDED_TEXT_AD: "Expanded text ad",
  VIDEO_AD: "Video ad",
  VIDEO_RESPONSIVE_AD: "Video responsive ad",
  IMAGE_AD: "Image ad",
  DEMAND_GEN_MULTI_ASSET_AD: "Demand Gen ad",
  APP_AD: "App ad",
};

async function googleBreakdowns(account: AdsAccountRef, campaignIds: string[], start: string, end: string) {
  if (!await googleConfigured()) throw new BreakdownError("Kredensial Google Ads API belum diset.");
  const where = `campaign.id IN (${campaignIds.join(", ")})`;
  const dates = `segments.date BETWEEN '${start}' AND '${end}'`;
  const metricFields = "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions";
  type Ad = { id: string; name?: string; type?: string };
  const [info, groupsList, groupStats, ads, adStats] = await Promise.all([
    googleSearch<{ customer: { currencyCode: string } }>(account.accountId, "SELECT customer.currency_code FROM customer LIMIT 1"),
    googleSearch<{ campaign: { id: string }; adGroup: { id: string; name: string; status: string } }>(account.accountId,
      `SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status FROM ad_group WHERE ${where} AND ad_group.status != 'REMOVED'`),
    googleSearch<{ campaign: { id: string }; adGroup: { id: string; name: string }; metrics: GoogleMetrics }>(account.accountId,
      `SELECT campaign.id, ad_group.id, ad_group.name, ${metricFields} FROM ad_group WHERE ${where} AND ${dates}`),
    googleSearch<{ campaign: { id: string }; adGroup: { id: string }; adGroupAd: { status: string; ad: Ad } }>(account.accountId,
      `SELECT campaign.id, ad_group.id, ad_group_ad.status, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type FROM ad_group_ad WHERE ${where} AND ad_group_ad.status != 'REMOVED'`),
    googleSearch<{ campaign: { id: string }; adGroup: { id: string }; adGroupAd: { ad: Ad }; metrics: GoogleMetrics }>(account.accountId,
      `SELECT campaign.id, ad_group.id, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ${metricFields} FROM ad_group_ad WHERE ${where} AND ${dates}`),
  ]);
  const currency = info[0]?.customer.currencyCode ?? "";
  if (!/^[A-Z]{3}$/.test(currency)) throw new BreakdownError("Mata uang akun Google tidak tersedia.");
  const metrics = (m: GoogleMetrics): CampaignMetrics => ({
    ...emptyCampaignMetrics("google", currency, false),
    spent: Number(m.costMicros ?? 0) / 1_000_000, impressions: Number(m.impressions ?? 0), clicks: Number(m.clicks ?? 0), conversions: Number(m.conversions ?? 0),
  });
  const adName = (ad: Ad) => ad.name?.trim() || `${AD_TYPE[ad.type ?? ""] ?? "Ad"} #${ad.id}`;

  const groups = grouped(campaignIds);
  for (const { campaign, adGroup: g } of groupsList) groups.get(campaign.id)?.adsets.push({ id: g.id, name: g.name, status: treeStatus(g.status), platformStatus: g.status, dailyBudget: null, lifetimeBudget: null, optimizationGoal: null, audience: null });
  for (const r of groupStats) groups.get(r.campaign.id)?.adsetMetrics.set(r.adGroup.id, { name: r.adGroup.name, metrics: metrics(r.metrics) });
  for (const { campaign, adGroup, adGroupAd } of ads) groups.get(campaign.id)?.ads.push({ id: adGroupAd.ad.id, name: adName(adGroupAd.ad), adsetId: adGroup.id, status: treeStatus(adGroupAd.status), platformStatus: adGroupAd.status, thumbnailUrl: null });
  for (const r of adStats) groups.get(r.campaign.id)?.adMetrics.set(r.adGroupAd.ad.id, { name: adName(r.adGroupAd.ad), adsetId: r.adGroup.id, metrics: metrics(r.metrics) });
  return assemble("google", currency, groups, () => emptyCampaignMetrics("google", currency, false));
}
