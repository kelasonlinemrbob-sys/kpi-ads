import "server-only";
import { getMetaToken, META_API_VERSION, META_TOKEN_MISSING, metaErrorMessage, type MetaApiError } from "./meta-connection";
import { creativePeriod, validCreativeRange } from "./creative-period";
const META_LEAD_ACTIONS = (process.env.META_LEAD_ACTION_TYPES ?? "lead,onsite_conversion.lead_grouped,offsite_conversion.fb_pixel_lead").split(",").map((v) => v.trim()).filter(Boolean);

export type AdContent = {
  adId: string;
  adName: string;
  campaignId: string | null;
  campaignName: string | null;
  objective: string | null;
  postId: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  format: "video" | "grafis" | "carousel" | "lainnya";
  status: "active" | "paused" | "review" | "takedown";
  platformStatus: string;
  createdAt: string | null;
  impressions: number;
  reach: number;
  videoViews: number;
  thruplays: number;
  avgPlayTime: number | null;
  spend: number;
  clicks: number;
  leads: number;
};

export type AdContentResult = { ok: true; ads: AdContent[] } | { ok: false; error: string };

type MetaAdRow = {
  id: string;
  name: string;
  effective_status: string;
  created_time?: string;
  campaign?: { id: string; name: string; objective?: string };
  creative?: {
    object_type?: string;
    effective_object_story_id?: string;
    thumbnail_url?: string;
    video_id?: string;
    instagram_permalink_url?: string;
    object_story_spec?: { video_data?: unknown; link_data?: { child_attachments?: unknown[] } };
  };
};

type MetaAdInsight = {
  ad_id: string;
  ad_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  impressions?: string;
  reach?: string;
  spend?: string;
  inline_link_clicks?: string;
  actions?: { action_type: string; value: string }[];
  video_thruplay_watched_actions?: { action_type: string; value: string }[];
  video_avg_time_watched_actions?: { action_type: string; value: string }[];
};

function contentStatus(effective: string): AdContent["status"] {
  if (effective === "ACTIVE") return "active";
  if (effective === "PAUSED" || effective === "CAMPAIGN_PAUSED" || effective === "ADSET_PAUSED") return "paused";
  if (effective === "DISAPPROVED" || effective === "DELETED" || effective === "ARCHIVED") return "takedown";
  return "review"; // PENDING_REVIEW, IN_PROCESS, WITH_ISSUES, PREAPPROVED, …
}

function contentFormat(creative: MetaAdRow["creative"]): AdContent["format"] {
  if (!creative) return "lainnya";
  if (creative.video_id || creative.object_type === "VIDEO" || creative.object_story_spec?.video_data) return "video";
  if ((creative.object_story_spec?.link_data?.child_attachments?.length ?? 0) > 1) return "carousel";
  if (creative.object_type === "PHOTO" || creative.object_type === "SHARE" || creative.object_type === "STATUS") return "grafis";
  return "lainnya";
}

/** "<pageId>_<postId>" → https://www.facebook.com/<pageId>/posts/<postId>/ */
export function postPermalink(storyId: string | null | undefined) {
  const [page, post] = (storyId ?? "").split("_");
  return page && post ? `https://www.facebook.com/${page}/posts/${post}/` : null;
}

class MetaCreativeError extends Error {
  constructor(message: string, readonly tooLarge = false) { super(message); }
}
async function request(url: URL) {
  try {
    const response = await fetch(url.toString(), { cache: "no-store", signal: AbortSignal.timeout(25000) });
    const body = await response.json();
    if (!response.ok || body.error) {
      const error = body.error as MetaApiError | undefined;
      const tooLarge = /reduce the amount of data|too much data/i.test(error?.message ?? "");
      throw new MetaCreativeError(tooLarge ? "Permintaan Creative masih terlalu besar untuk Meta. Coba periode 7 hari atau sinkronkan kembali nanti." : metaErrorMessage(error, response.status), tooLarge);
    }
    return body;
  } catch (error) {
    if (error instanceof MetaCreativeError) throw error;
    // Network exceptions can contain URLs with access tokens; never serialize those messages.
    throw new MetaCreativeError("Koneksi Meta terputus atau melewati batas waktu. Coba sinkronkan kembali.");
  }
}

/** Request one aggregate window, page cautiously, then fetch metadata ONLY for ads in that window. */
export async function fetchMetaAdContents(accountId: string, start = creativePeriod().start, end = creativePeriod().end): Promise<AdContentResult> {
  if (!validCreativeRange(start, end)) return { ok: false, error: "Periode Creative harus valid dan maksimal 30 hari." };
  const token = await getMetaToken();
  if (!token) return { ok: false, error: META_TOKEN_MISSING };
  const root = `https://graph.facebook.com/${META_API_VERSION}`;
  const insightsUrl = new URL(`${root}/act_${accountId.replace(/\D/g, "")}/insights`);
  insightsUrl.searchParams.set("access_token", token);
  insightsUrl.searchParams.set("level", "ad");
  insightsUrl.searchParams.set("time_range", JSON.stringify({ since: start, until: end }));
  insightsUrl.searchParams.set("fields", "ad_id,ad_name,campaign_id,campaign_name,impressions,reach,spend,inline_link_clicks,actions,video_thruplay_watched_actions,video_avg_time_watched_actions");
  let limit = 50;
  const byAd = new Map<string, MetaAdInsight>();
  try {
    let next: URL | null = insightsUrl;
    const cursors = new Set<string>();
    while (next) {
      next.searchParams.set("limit", String(limit));
      let body;
      try { body = await request(next); }
      catch (error) {
        if (error instanceof MetaCreativeError && error.tooLarge && limit > 1) { limit = limit > 10 ? 10 : 1; continue; }
        throw error;
      }
      if (!Array.isArray(body.data)) throw new MetaCreativeError("Respons metrik Creative tidak lengkap. Data sebelumnya tetap disimpan.");
      for (const row of body.data as MetaAdInsight[]) {
        if (!/^\d+$/.test(row.ad_id)) throw new MetaCreativeError("ID iklan pada respons Meta tidak valid.");
        byAd.set(row.ad_id, row);
      }
      const nextUrl = body.paging?.next;
      if (nextUrl) {
        next = new URL(nextUrl);
        if (next.origin !== "https://graph.facebook.com" || cursors.has(nextUrl)) throw new MetaCreativeError("Pagination Creative tidak valid. Coba sinkronkan kembali.");
        cursors.add(nextUrl);
      } else next = null;
    }
    if (!byAd.size) return { ok: true, ads: [] };
    const metadata = new Map<string, MetaAdRow>();
    const fields = "id,name,effective_status,created_time,campaign{id,name,objective},creative{object_type,effective_object_story_id,thumbnail_url,video_id,instagram_permalink_url,object_story_spec{video_data{video_id},link_data{child_attachments{link}}}}";
    const ids = [...byAd.keys()];
    // Fetch individual nodes: multi-ID reads were removed in newer Graph API versions.
    // Four small requests at a time avoid the former unbounded /ads expansion.
    for (let i = 0; i < ids.length; i += 4) {
      const chunk = ids.slice(i, i + 4);
      const responses = await Promise.allSettled(chunk.map(async (id) => {
        const url = new URL(`${root}/${id}`);
        url.searchParams.set("fields", fields); url.searchParams.set("access_token", token);
        const row = await request(url) as MetaAdRow;
        if (row.id !== id) throw new MetaCreativeError(`Detail iklan ${id} tidak lengkap. Data sebelumnya tetap disimpan.`);
        metadata.set(id, row);
      }));
      for (const response of responses) if (response.status === "rejected") throw response.reason;
    }
    const firstValue = (list?: { value: string }[]) => list?.length ? Number(list[0]!.value) : null;
    const ads = ids.map((id): AdContent => {
      const ad = metadata.get(id)!; const stats = byAd.get(id)!;
      const lead = META_LEAD_ACTIONS.map((type) => stats.actions?.find((a) => a.action_type === type)).find(Boolean);
      const storyId = ad.creative?.effective_object_story_id ?? null;
      return {
        adId: id, adName: ad.name || stats.ad_name || id,
        campaignId: ad.campaign?.id ?? stats.campaign_id ?? null,
        campaignName: ad.campaign?.name ?? stats.campaign_name ?? null, objective: ad.campaign?.objective ?? null,
        postId: storyId, permalink: postPermalink(storyId) ?? ad.creative?.instagram_permalink_url ?? null,
        thumbnailUrl: ad.creative?.thumbnail_url ?? null, format: contentFormat(ad.creative),
        status: contentStatus(ad.effective_status), platformStatus: ad.effective_status, createdAt: ad.created_time ?? null,
        impressions: Number(stats.impressions ?? 0), reach: Number(stats.reach ?? 0),
        videoViews: Number(stats.actions?.find((a) => a.action_type === "video_view")?.value ?? 0),
        thruplays: firstValue(stats.video_thruplay_watched_actions) ?? 0, avgPlayTime: firstValue(stats.video_avg_time_watched_actions),
        spend: Number(stats.spend ?? 0), clicks: Number(stats.inline_link_clicks ?? 0), leads: Number(lead?.value ?? 0),
      };
    });
    return { ok: true, ads };
  } catch (error) { return { ok: false, error: error instanceof MetaCreativeError ? error.message : "Data Creative gagal diproses. Coba sinkronkan kembali." }; }
}
