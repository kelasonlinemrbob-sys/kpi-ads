import "server-only";
import { getGoogleCredentials } from "./google-connection";
import { googleSearchWithCredentials } from "./google-client";
import { metaLandingPageViews, validGoogleConversionResource } from "./ads-lpv";
import { getMetaToken, META_API_VERSION, META_TOKEN_MISSING, metaErrorMessage, type MetaApiError } from "@/lib/meta-connection";

/**
 * Pulls one day of campaign-level metrics for a whole ad account from the Meta Marketing API
 * or the Google Ads API. The Meta token is set in Settings → Koneksi Meta Ads (or META_ACCESS_TOKEN);
 * Google credentials come from Settings → Integrasi, with env as a fallback. Dates are interpreted
 * in the ad account's own timezone.
 */

export type AdsMetrics = { landingPageViews: number | null; spent: number; impressions: number; clicks: number; leads: number };

export type AdsAccountRef = { platform: "meta" | "google"; accountId: string; lpvConversionAction?: string | null };

export type AdsCampaignMetrics = { id: string; name: string } & AdsMetrics;

export type AdsAccountResult = { ok: true; campaigns: AdsCampaignMetrics[]; lpvAvailable: boolean; warnings?: string[] } | { ok: false; error: string };

const digits = (value: string) => value.replace(/\D/g, "");

export function fetchAccountCampaigns(account: AdsAccountRef, date: string): Promise<AdsAccountResult> {
  return account.platform === "meta" ? fetchMetaAccount(account.accountId, date) : fetchGoogleAccount(account.accountId, date, account.lpvConversionAction);
}

/* ---------------------------------- Meta ---------------------------------- */

const META_LEAD_ACTIONS = (
  process.env.META_LEAD_ACTION_TYPES ?? "lead,onsite_conversion.lead_grouped,offsite_conversion.fb_pixel_lead"
)
  .split(",")
  .map((type) => type.trim())
  .filter(Boolean);

type MetaInsight = {
  campaign_id: string;
  campaign_name: string;
  spend?: string;
  impressions?: string;
  inline_link_clicks?: string;
  actions?: { action_type: string; value: string }[];
};

async function fetchMetaAccount(accountId: string, date: string): Promise<AdsAccountResult> {
  const token = await getMetaToken();
  if (!token) return { ok: false, error: META_TOKEN_MISSING };
  const version = META_API_VERSION;
  const url = new URL(`https://graph.facebook.com/${version}/act_${digits(accountId)}/insights`);
  url.searchParams.set("level", "campaign");
  url.searchParams.set("fields", "campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions");
  url.searchParams.set("time_range", JSON.stringify({ since: date, until: date }));
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", token);

  const campaigns: AdsCampaignMetrics[] = [];
  let next: string | undefined = url.toString();
  try {
    while (next) {
      const res = await fetch(next, { cache: "no-store" });
      const body = (await res.json()) as {
        data?: MetaInsight[];
        paging?: { next?: string };
        error?: MetaApiError;
      };
      if (!res.ok || body.error) return { ok: false, error: metaErrorMessage(body.error, res.status) };
      for (const row of body.data ?? []) {
        // The first configured action type that is present wins, so overlapping lead types aren't double-counted.
        const lead = META_LEAD_ACTIONS.map((type) => row.actions?.find((a) => a.action_type === type)).find(Boolean);
        campaigns.push({
          landingPageViews: metaLandingPageViews(row.actions),
          id: row.campaign_id,
          name: row.campaign_name,
          spent: Number(row.spend ?? 0),
          impressions: Number(row.impressions ?? 0),
          clicks: Number(row.inline_link_clicks ?? 0),
          leads: Number(lead?.value ?? 0),
        });
      }
      next = body.paging?.next;
    }
    return { ok: true, campaigns, lpvAvailable: true };
  } catch (error) {
    return { ok: false, error: `Gagal menghubungi Meta API: ${(error as Error).message}` };
  }
}

/* --------------------------------- Google --------------------------------- */

export async function googleConfigured() {
  return Boolean(await getGoogleCredentials());
}

type GoogleMetricRow = {
  campaign: { id: string; name: string };
  metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number; allConversions?: number };
};

export async function googleSearch<T>(customerId: string, query: string): Promise<T[]> {
  const credentials = await getGoogleCredentials();
  if (!credentials) throw new Error("Kredensial Google Ads belum diset. Buka Settings → Integrasi → Koneksi Google Ads.");
  return googleSearchWithCredentials<T>(credentials, customerId, query);
}

export type GoogleConversionOption = { resourceName: string; name: string; category: string };
export async function fetchGoogleConversionActions(customerId: string): Promise<{ ok: true; actions: GoogleConversionOption[] } | { ok: false; error: string }> {
  if (!await googleConfigured()) return { ok: false, error: "Kredensial Google Ads API belum diset." };
  try {
    const rows = await googleSearch<{ conversionAction: GoogleConversionOption }>(customerId,
      "SELECT conversion_action.resource_name, conversion_action.name, conversion_action.category FROM conversion_action WHERE conversion_action.status = 'ENABLED'");
    return { ok: true, actions: rows.map((r) => r.conversionAction) };
  } catch (error) { return { ok: false, error: `Gagal mengambil konversi Google Ads: ${(error as Error).message}` }; }
}

async function fetchGoogleAccount(customerId: string, date: string, lpvAction?: string | null): Promise<AdsAccountResult> {
  if (!await googleConfigured()) return { ok: false, error: "Kredensial Google Ads API belum diset." };
  try {
    const rows = await googleSearch<GoogleMetricRow>(customerId, `SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
      FROM campaign WHERE segments.date = '${date}'`);
    let lpvAvailable = false;
    const lpv = new Map<string, number>();
    const warnings: string[] = [];
    if (!lpvAction || !validGoogleConversionResource(lpvAction)) {
      warnings.push("LPV belum terhubung. Pilih konversi landing page di Campaigns → Akun iklan. LPV dapat diisi manual sementara.");
    } else {
      // Keep conversion segmentation separate: it cannot share cost/impression/click metrics.
      try {
        const actions = await fetchGoogleConversionActions(customerId);
        if (!actions.ok) throw new Error(actions.error);
        if (!actions.actions.some((a) => a.resourceName === lpvAction)) throw new Error("Konversi LPV tidak aktif atau tidak tersedia pada akun ini. Pilih ulang di Akun iklan.");
        const conversions = await googleSearch<GoogleMetricRow>(customerId, `SELECT campaign.id, segments.conversion_action, metrics.all_conversions
          FROM campaign WHERE segments.date = '${date}' AND segments.conversion_action = '${lpvAction}'`);
        for (const row of conversions) {
          const value = Number(row.metrics?.allConversions ?? 0);
          if (!Number.isFinite(value) || value < 0) throw new Error("Nilai LPV dari Google Ads tidak valid.");
          lpv.set(row.campaign.id, (lpv.get(row.campaign.id) ?? 0) + value);
        }
        lpvAvailable = true;
      } catch (error) { warnings.push(`LPV Google Ads belum tersedia: ${(error as Error).message}`); }
    }
    return { ok: true, lpvAvailable, warnings, campaigns: rows.map((row) => ({
      id: row.campaign.id, name: row.campaign.name,
      spent: Number(row.metrics?.costMicros ?? 0) / 1_000_000,
      impressions: Number(row.metrics?.impressions ?? 0), clicks: Number(row.metrics?.clicks ?? 0), leads: Number(row.metrics?.conversions ?? 0),
      // all_conversions includes secondary LPV events and may contain attribution fractions.
      landingPageViews: lpvAvailable ? Math.round(lpv.get(row.campaign.id) ?? 0) : null,
    })) };
  } catch (error) { return { ok: false, error: `Gagal menghubungi Google Ads API: ${(error as Error).message}` }; }
}

/* ----------------------------- Campaign list sync ----------------------------- */

export type AdsCampaignInfo = {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "ended";
  platformStatus: string;
  objective: string | null;
  dailyBudget: number | null;
  startDate: string | null;
  endDate: string | null;
};

export type AdsCampaignListResult = { ok: true; campaigns: AdsCampaignInfo[] } | { ok: false; error: string };

/** Lists every non-deleted campaign of an ad account with its status, budget and schedule. */
export function fetchAccountCampaignList(account: AdsAccountRef): Promise<AdsCampaignListResult> {
  return account.platform === "meta" ? listMetaCampaigns(account.accountId) : listGoogleCampaigns(account.accountId);
}

/** Currencies Meta reports budgets for in whole units instead of 1/100 (see Meta's currency offsets). */
const META_ZERO_DECIMAL = new Set(["IDR", "JPY", "KRW", "VND", "CLP", "COP", "CRC", "HUF", "ISK", "PYG", "TWD"]);

function metaStatus(effective: string): AdsCampaignInfo["status"] {
  if (effective === "ACTIVE") return "active";
  if (effective === "PAUSED" || effective === "CAMPAIGN_PAUSED" || effective === "ADSET_PAUSED") return "paused";
  if (effective === "ARCHIVED" || effective === "DELETED") return "ended";
  return "draft"; // IN_PROCESS, WITH_ISSUES, PENDING_REVIEW, …
}

async function listMetaCampaigns(accountId: string): Promise<AdsCampaignListResult> {
  const token = await getMetaToken();
  if (!token) return { ok: false, error: META_TOKEN_MISSING };
  const version = META_API_VERSION;
  const base = `https://graph.facebook.com/${version}/act_${digits(accountId)}`;

  try {
    const accountRes = await fetch(`${base}?fields=currency&access_token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const account = (await accountRes.json()) as { currency?: string; error?: MetaApiError };
    if (!accountRes.ok || account.error) return { ok: false, error: metaErrorMessage(account.error, accountRes.status) };
    const divisor = META_ZERO_DECIMAL.has(account.currency ?? "") ? 1 : 100;

    const url = new URL(`${base}/campaigns`);
    url.searchParams.set("fields", "id,name,effective_status,objective,daily_budget,start_time,stop_time");
    url.searchParams.set("limit", "500");
    url.searchParams.set("access_token", token);
    const campaigns: AdsCampaignInfo[] = [];
    let next: string | undefined = url.toString();
    while (next) {
      const res = await fetch(next, { cache: "no-store" });
      const body = (await res.json()) as {
        data?: {
          id: string;
          name: string;
          effective_status: string;
          objective?: string;
          daily_budget?: string;
          start_time?: string;
          stop_time?: string;
        }[];
        paging?: { next?: string };
        error?: MetaApiError;
      };
      if (!res.ok || body.error) return { ok: false, error: metaErrorMessage(body.error, res.status) };
      for (const c of body.data ?? []) {
        campaigns.push({
          id: c.id,
          name: c.name,
          status: metaStatus(c.effective_status),
          platformStatus: c.effective_status,
          objective: c.objective ?? null,
          dailyBudget: c.daily_budget ? Number(c.daily_budget) / divisor : null,
          startDate: c.start_time?.slice(0, 10) ?? null,
          endDate: c.stop_time?.slice(0, 10) ?? null,
        });
      }
      next = body.paging?.next;
    }
    return { ok: true, campaigns };
  } catch (error) {
    return { ok: false, error: `Gagal menghubungi Meta API: ${(error as Error).message}` };
  }
}

function googleStatus(status: string): AdsCampaignInfo["status"] {
  if (status === "ENABLED") return "active";
  if (status === "PAUSED") return "paused";
  if (status === "REMOVED") return "ended";
  return "draft";
}

/** Google returns dates as YYYY-MM-DD, and "2037-12-30" when a campaign has no end date. */
const googleDate = (value?: string) => (value && !value.startsWith("2037-12-30") ? value.slice(0, 10) : null);

async function listGoogleCampaigns(customerId: string): Promise<AdsCampaignListResult> {
  if (!await googleConfigured()) return { ok: false, error: "Kredensial Google Ads API belum diset." };
  // Newer API versions use start_date_time / end_date_time; older ones start_date / end_date.
  const first = await queryGoogleCampaigns(customerId, "start_date_time", "end_date_time");
  if (first.ok || !/start_date_time|end_date_time|unrecognized[ _]field/i.test(first.error)) return first;
  return queryGoogleCampaigns(customerId, "start_date", "end_date");
}

async function queryGoogleCampaigns(
  customerId: string,
  startField: "start_date_time" | "start_date",
  endField: "end_date_time" | "end_date",
): Promise<AdsCampaignListResult> {
  const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
      campaign.${startField}, campaign.${endField}, campaign_budget.amount_micros
    FROM campaign WHERE campaign.status != 'REMOVED'`;
  const camel = (field: string) => field.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

  try {
    type Row = {
      campaign: { id: string; name: string; status: string; advertisingChannelType?: string } & Record<string, string | undefined>;
      campaignBudget?: { amountMicros?: string };
    };
    const rows = await googleSearch<Row>(customerId, query);
    return {
      ok: true,
      campaigns: rows.map((row) => ({
          id: row.campaign.id,
          name: row.campaign.name,
          status: googleStatus(row.campaign.status),
          platformStatus: row.campaign.status,
          objective: row.campaign.advertisingChannelType ?? null,
          dailyBudget: row.campaignBudget?.amountMicros ? Number(row.campaignBudget.amountMicros) / 1_000_000 : null,
          startDate: googleDate(row.campaign[camel(startField)]),
          endDate: googleDate(row.campaign[camel(endField)]),
        })),
    };
  } catch (error) {
    return { ok: false, error: `Gagal menghubungi Google Ads API: ${(error as Error).message}` };
  }
}

/* ------------------------------ Ad contents (Creative page) ------------------------------ */

export { fetchMetaAdContents, postPermalink, type AdContent, type AdContentResult } from "./meta-creatives-api";
