import "server-only";
import { getMetaToken, META_API_VERSION, META_TOKEN_MISSING, metaErrorMessage, type MetaApiError } from "@/lib/meta-connection";

/**
 * Pulls one day of campaign-level metrics for a whole ad account from the Meta Marketing API
 * or the Google Ads API. The Meta token is set in Settings → Koneksi Meta Ads (or META_ACCESS_TOKEN);
 * Google credentials come from env (see .env.example). Dates are interpreted
 * in the ad account's own timezone.
 */

export type AdsMetrics = { spent: number; impressions: number; clicks: number; leads: number };

export type AdsAccountRef = { platform: "meta" | "google"; accountId: string };

export type AdsCampaignMetrics = { id: string; name: string } & AdsMetrics;

export type AdsAccountResult = { ok: true; campaigns: AdsCampaignMetrics[] } | { ok: false; error: string };

const digits = (value: string) => value.replace(/\D/g, "");

export function fetchAccountCampaigns(account: AdsAccountRef, date: string): Promise<AdsAccountResult> {
  return account.platform === "meta" ? fetchMetaAccount(account.accountId, date) : fetchGoogleAccount(account.accountId, date);
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
    return { ok: true, campaigns };
  } catch (error) {
    return { ok: false, error: `Gagal menghubungi Meta API: ${(error as Error).message}` };
  }
}

/* --------------------------------- Google --------------------------------- */

export function googleConfigured() {
  return Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      process.env.GOOGLE_ADS_CLIENT_ID &&
      process.env.GOOGLE_ADS_CLIENT_SECRET &&
      process.env.GOOGLE_ADS_REFRESH_TOKEN,
  );
}

let googleToken: { value: string; expiresAt: number } | null = null;

async function googleAccessToken() {
  if (googleToken && googleToken.expiresAt > Date.now() + 60_000) return googleToken.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    }),
    cache: "no-store",
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) throw new Error(body.error_description ?? `OAuth error ${res.status}`);
  googleToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return googleToken.value;
}

async function fetchGoogleAccount(customerId: string, date: string): Promise<AdsAccountResult> {
  if (!googleConfigured()) return { ok: false, error: "Kredensial Google Ads API belum diset." };
  const version = process.env.GOOGLE_ADS_API_VERSION ?? "v22";
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ? digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) : null;
  const query = `SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM campaign WHERE segments.date = '${date}'`;

  try {
    const token = await googleAccessToken();
    const res = await fetch(`https://googleads.googleapis.com/${version}/customers/${digits(customerId)}/googleAds:searchStream`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
        "Content-Type": "application/json",
        ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
      },
      body: JSON.stringify({ query }),
      cache: "no-store",
    });
    type Row = {
      campaign: { id: string; name: string };
      metrics: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number };
    };
    const body = (await res.json()) as { results?: Row[] }[] | { error?: { message?: string } };
    if (!res.ok || !Array.isArray(body)) {
      // searchStream reports errors either as an object or as the first element of the array.
      const message = (Array.isArray(body) ? (body[0] as { error?: { message?: string } } | undefined) : body)?.error?.message;
      return { ok: false, error: message ?? `Google Ads API error ${res.status}` };
    }
    return {
      ok: true,
      campaigns: body.flatMap((chunk) =>
        (chunk.results ?? []).map((row) => ({
          id: row.campaign.id,
          name: row.campaign.name,
          spent: Number(row.metrics.costMicros ?? 0) / 1_000_000,
          impressions: Number(row.metrics.impressions ?? 0),
          clicks: Number(row.metrics.clicks ?? 0),
          leads: Number(row.metrics.conversions ?? 0),
        })),
      ),
    };
  } catch (error) {
    return { ok: false, error: `Gagal menghubungi Google Ads API: ${(error as Error).message}` };
  }
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
  if (!googleConfigured()) return { ok: false, error: "Kredensial Google Ads API belum diset." };
  // Newer API versions use start_date_time / end_date_time; older ones start_date / end_date.
  const first = await queryGoogleCampaigns(customerId, "start_date_time", "end_date_time");
  if (first.ok || !/start_date_time|end_date_time|unrecognized field/i.test(first.error)) return first;
  return queryGoogleCampaigns(customerId, "start_date", "end_date");
}

async function queryGoogleCampaigns(
  customerId: string,
  startField: "start_date_time" | "start_date",
  endField: "end_date_time" | "end_date",
): Promise<AdsCampaignListResult> {
  const version = process.env.GOOGLE_ADS_API_VERSION ?? "v22";
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ? digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) : null;
  const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
      campaign.${startField}, campaign.${endField}, campaign_budget.amount_micros
    FROM campaign WHERE campaign.status != 'REMOVED'`;
  const camel = (field: string) => field.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

  try {
    const token = await googleAccessToken();
    const res = await fetch(`https://googleads.googleapis.com/${version}/customers/${digits(customerId)}/googleAds:searchStream`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
        "Content-Type": "application/json",
        ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
      },
      body: JSON.stringify({ query }),
      cache: "no-store",
    });
    type Row = {
      campaign: { id: string; name: string; status: string; advertisingChannelType?: string } & Record<string, string | undefined>;
      campaignBudget?: { amountMicros?: string };
    };
    const body = (await res.json()) as { results?: Row[] }[] | { error?: { message?: string } };
    if (!res.ok || !Array.isArray(body)) {
      const message = (Array.isArray(body) ? (body[0] as { error?: { message?: string } } | undefined) : body)?.error?.message;
      return { ok: false, error: message ?? `Google Ads API error ${res.status}` };
    }
    return {
      ok: true,
      campaigns: body.flatMap((chunk) =>
        (chunk.results ?? []).map((row) => ({
          id: row.campaign.id,
          name: row.campaign.name,
          status: googleStatus(row.campaign.status),
          platformStatus: row.campaign.status,
          objective: row.campaign.advertisingChannelType ?? null,
          dailyBudget: row.campaignBudget?.amountMicros ? Number(row.campaignBudget.amountMicros) / 1_000_000 : null,
          startDate: googleDate(row.campaign[camel(startField)]),
          endDate: googleDate(row.campaign[camel(endField)]),
        })),
      ),
    };
  } catch (error) {
    return { ok: false, error: `Gagal menghubungi Google Ads API: ${(error as Error).message}` };
  }
}
