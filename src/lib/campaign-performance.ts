import "server-only";
import { fetchGoogleConversionActions, googleConfigured, googleSearch, type AdsAccountRef } from "./ads-api";
import { validGoogleConversionResource } from "./ads-lpv";
import { getMetaToken, META_API_VERSION, META_TOKEN_MISSING, metaErrorMessage, type MetaApiError } from "./meta-connection";
import { emptyCampaignMetrics, type CampaignMetrics } from "./campaign-metrics";

type Action = { action_type: string; value: string };
export type MetaCampaignInsight = {
  campaign_id: string; campaign_name: string; spend?: string; impressions?: string; reach?: string;
  clicks?: string; inline_link_clicks?: string; outbound_clicks?: Action[]; actions?: Action[];
  action_values?: Action[]; video_play_actions?: Action[]; video_thruplay_watched_actions?: Action[];
};
// Choose the first alias present, never add overlapping aggregate and pixel events.
const actionValue = (actions: Action[] | undefined, types: string[]) => {
  const found = types.map((type) => actions?.find((a) => a.action_type === type)).find(Boolean);
  return Number(found?.value ?? 0);
};
export function parseMetaCampaign(row: MetaCampaignInsight, currency: string): CampaignMetrics {
  const purchases = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
  return { ...emptyCampaignMetrics("meta", currency), spent: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0), reach: Number(row.reach ?? 0), clicks: Number(row.clicks ?? 0),
    linkClicks: Number(row.inline_link_clicks ?? 0), outboundClicks: actionValue(row.outbound_clicks, ["outbound_click"]),
    leads: actionValue(row.actions, (process.env.META_LEAD_ACTION_TYPES ?? "lead,onsite_conversion.lead_grouped,offsite_conversion.fb_pixel_lead").split(",").map((s) => s.trim()).filter(Boolean)),
    chats: actionValue(row.actions, ["onsite_conversion.messaging_conversation_started_7d"]),
    landingPageViews: actionValue(row.actions, ["landing_page_view"]),
    purchases: actionValue(row.actions, purchases), revenue: actionValue(row.action_values, purchases),
    engagements: actionValue(row.actions, ["post_engagement"]), video3s: actionValue(row.actions, ["video_view"]),
    videoPlays: actionValue(row.video_play_actions, ["video_view"]), thruplays: actionValue(row.video_thruplay_watched_actions, ["video_view"]) };
}
export type CampaignPerformanceResult =
  | { ok: true; currency: string; lpvAvailable: boolean; campaigns: { id: string; metrics: CampaignMetrics }[]; warnings: string[] }
  | { ok: false; error: string };

/** Aggregate the entire range at the API, especially for deduplicated reach. Never sum daily reach. */
export async function fetchCampaignPerformance(account: AdsAccountRef, start: string, end: string): Promise<CampaignPerformanceResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return { ok: false, error: "Periode tidak valid." };
  try {
    if (account.platform === "google") return await googlePerformance(account, start, end);
    const token = await getMetaToken();
    if (!token) return { ok: false, error: META_TOKEN_MISSING };
    const base = `https://graph.facebook.com/${META_API_VERSION}/act_${account.accountId.replace(/\D/g, "")}`;
    const get = async (url: string) => {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      const body = await response.json();
      if (!response.ok || body.error) throw new Error(metaErrorMessage(body.error as MetaApiError, response.status));
      return body;
    };
    const url = new URL(`${base}/insights`);
    url.searchParams.set("access_token", token);
    url.searchParams.set("level", "campaign");
    url.searchParams.set("fields", "campaign_id,campaign_name,spend,impressions,reach,clicks,inline_link_clicks,outbound_clicks,actions,action_values,video_play_actions,video_thruplay_watched_actions");
    url.searchParams.set("time_range", JSON.stringify({ since: start, until: end }));
    url.searchParams.set("limit", "500");
    const [info, first] = await Promise.all([get(`${base}?fields=currency&access_token=${encodeURIComponent(token)}`), get(url.toString())]);
    if (!/^[A-Z]{3}$/.test(info.currency ?? "")) throw new Error("Mata uang akun tidak tersedia.");
    const campaigns: { id: string; metrics: CampaignMetrics }[] = [];
    let body = first;
    const seen = new Set<string>();
    while (true) {
      if (!Array.isArray(body.data)) throw new Error("Respons metrik Meta tidak lengkap.");
      for (const row of body.data as MetaCampaignInsight[]) campaigns.push({ id: row.campaign_id, metrics: parseMetaCampaign(row, info.currency) });
      const next = body.paging?.next as string | undefined;
      if (!next) break;
      if (new URL(next).origin !== "https://graph.facebook.com" || seen.has(next)) throw new Error("Pagination Meta tidak valid.");
      seen.add(next); body = await get(next);
    }
    return { ok: true, currency: info.currency, lpvAvailable: true, campaigns, warnings: [] };
  } catch {
    // Never expose request URLs (Meta tokens are in the query string) through network errors.
    return { ok: false, error: `Performa ${account.platform === "meta" ? "Meta" : "Google"} Ads gagal dimuat. Periksa koneksi akun, lalu muat ulang.` };
  }
}

async function googlePerformance(account: AdsAccountRef, start: string, end: string): Promise<CampaignPerformanceResult> {
  if (!await googleConfigured()) return { ok: false, error: "Kredensial Google Ads API belum diset." };
  const dates = `segments.date BETWEEN '${start}' AND '${end}'`;
  const [info, rows] = await Promise.all([
    googleSearch<{ customer: { currencyCode: string } }>(account.accountId, "SELECT customer.currency_code FROM customer LIMIT 1"),
    googleSearch<{ campaign: { id: string }; metrics: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number } }>(account.accountId,
      `SELECT campaign.id, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE ${dates}`),
  ]);
  const currency = info[0]?.customer.currencyCode;
  if (!currency || !/^[A-Z]{3}$/.test(currency)) throw new Error("Currency unavailable");
  let lpvAvailable = false;
  const lpv = new Map<string, number>();
  const warnings: string[] = [];
  if (account.lpvConversionAction && validGoogleConversionResource(account.lpvConversionAction)) {
    try {
      const actions = await fetchGoogleConversionActions(account.accountId);
      if (!actions.ok || !actions.actions.some((a) => a.resourceName === account.lpvConversionAction)) throw new Error("Mapping unavailable");
      const values = await googleSearch<{ campaign: { id: string }; metrics: { allConversions?: number } }>(account.accountId,
        `SELECT campaign.id, segments.conversion_action, metrics.all_conversions FROM campaign WHERE ${dates} AND segments.conversion_action = '${account.lpvConversionAction}'`);
      for (const row of values) lpv.set(row.campaign.id, (lpv.get(row.campaign.id) ?? 0) + Number(row.metrics.allConversions ?? 0));
      lpvAvailable = true;
    } catch { warnings.push("LPV Google tidak tersedia. Periksa konversi LPV yang dipilih di Akun iklan."); }
  } else warnings.push("Pilih konversi LPV Google di Akun iklan untuk menampilkan LPV dan CPLV.");
  return { ok: true, currency, lpvAvailable, warnings, campaigns: rows.map((row) => ({ id: row.campaign.id,
    metrics: { ...emptyCampaignMetrics("google", currency, lpvAvailable), spent: Number(row.metrics.costMicros ?? 0) / 1_000_000,
      impressions: Number(row.metrics.impressions ?? 0), clicks: Number(row.metrics.clicks ?? 0), conversions: Number(row.metrics.conversions ?? 0),
      landingPageViews: lpvAvailable ? Math.round(lpv.get(row.campaign.id) ?? 0) : null } })) };
}
