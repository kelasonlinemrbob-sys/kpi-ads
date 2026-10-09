import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { adAccounts } from "@/db/schema";
import type { CreativeAnalysisInput } from "./ai-ads-analysis";
import { getMetaToken, META_API_VERSION, metaErrorMessage, type MetaApiError } from "./meta-connection";
import { META_RESULT_FIELDS, metaLeads, type MetaResult } from "./meta-results";

/**
 * Extra Meta data for "Analisa AI", pulled when an analysis runs (not stored by the Creative sync):
 * the previous period for the same ads, the daily trend, placement / age / gender breakdowns and the
 * creative images. Everything is filtered to the analysed ads, so it describes exactly what the model reads.
 * Rates and changes are computed here; the model only interprets them.
 */

export const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`;
const STATS_FIELDS = "spend,impressions,reach,inline_link_clicks,actions";
/** Segments with fewer results than this are shown but not judged best or worst. */
const MIN_SEGMENT_RESULTS = 3;
/** Creative images sent to the model, biggest spend first. */
export const MAX_ANALYSIS_IMAGES = 6;
const MAX_IMAGE_BYTES = 3_500_000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type ImageMediaType = (typeof IMAGE_TYPES)[number];

/* --------------------------------- Maths --------------------------------- */

export type Stats = { spend: number; impressions: number; reach: number; clicks: number; results: number };
const ZERO: Stats = { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0 };
const add = (a: Stats, b: Stats): Stats => ({
  spend: a.spend + b.spend,
  impressions: a.impressions + b.impressions,
  reach: a.reach + b.reach,
  clicks: a.clicks + b.clicks,
  results: a.results + b.results,
});

const round = (v: number | null, digits = 2) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** digits) / 10 ** digits);
const div = (a: number, b: number) => (b > 0 ? a / b : null);

export type PeriodTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  ctrPct: number | null;
  cpm: number | null;
  cpc: number | null;
  costPerResult: number | null;
};

export function periodTotals(s: Stats): PeriodTotals {
  return {
    spend: Math.round(s.spend),
    impressions: s.impressions,
    clicks: s.clicks,
    results: s.results,
    ctrPct: round(s.impressions > 0 ? (s.clicks / s.impressions) * 100 : null),
    cpm: round(s.impressions > 0 ? (s.spend / s.impressions) * 1000 : null, 0),
    cpc: round(div(s.spend, s.clicks), 0),
    costPerResult: round(div(s.spend, s.results), 0),
  };
}

/** Percent change from `previous` to `current`; null when there is nothing to compare with. */
export function changePct(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return round(((current - previous) / previous) * 100, 1);
}

export type Change = { spend: number | null; results: number | null; costPerResult: number | null; ctr: number | null; cpm: number | null };
const changeOf = (current: PeriodTotals, previous: PeriodTotals): Change => ({
  spend: changePct(current.spend, previous.spend),
  results: changePct(current.results, previous.results),
  costPerResult: changePct(current.costPerResult, previous.costPerResult),
  ctr: changePct(current.ctrPct, previous.ctrPct),
  cpm: changePct(current.cpm, previous.cpm),
});

export type Segment = PeriodTotals & {
  segment: string;
  spendSharePct: number | null;
  /** Cost per result against the average of all segments; negative = cheaper. */
  costVsAveragePct: number | null;
  sufficientData: boolean;
};

export type DailyPoint = PeriodTotals & { date: string; frequency: number | null };

export type AdPrevious = PeriodTotals & { change: Change };

export type AnalysisEnrichment = {
  /** How much of the analysed view the extra data covers (the analysed ads, by spend). */
  coverage: { ads: number; spendSharePct: number | null };
  comparison: { previousPeriod: { start: string; end: string }; current: PeriodTotals; previous: PeriodTotals; change: Change } | null;
  daily: DailyPoint[];
  /** True when the period ends today, so the last day is still running. */
  partialLastDay: boolean;
  breakdowns: { placement: Segment[]; age: Segment[]; gender: Segment[] };
  /** Refs whose creative image was sent to the model. */
  imageRefs: number[];
  /** Data that couldn't be pulled; the model is told not to draw conclusions from it. */
  gaps: string[];
};

/** The same number of days, right before the period. */
export function previousRange(start: string, days: number) {
  const end = new Date(`${start}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const begin = new Date(end);
  begin.setUTCDate(begin.getUTCDate() - days + 1);
  return { start: begin.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

const PLATFORM: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", audience_network: "Audience Network", messenger: "Messenger", threads: "Threads" };
const POSITION: Record<string, string> = {
  feed: "Feed",
  instagram_stories: "Stories",
  facebook_stories: "Stories",
  story: "Stories",
  instagram_reels: "Reels",
  facebook_reels: "Reels",
  facebook_reels_overlay: "Reels overlay",
  instagram_explore: "Explore",
  instagram_explore_grid_home: "Explore home",
  instagram_profile_feed: "Profile feed",
  marketplace: "Marketplace",
  video_feeds: "Video feeds",
  instream_video: "In-stream video",
  right_hand_column: "Kolom kanan",
  search: "Search",
  an_classic: "Native, banner & interstitial",
  rewarded_video: "Rewarded video",
  messenger_inbox: "Inbox",
};
const titleCase = (v: string) => v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
export const placementLabel = (platform?: string, position?: string) =>
  `${PLATFORM[platform ?? ""] ?? titleCase(platform ?? "Lainnya")} · ${POSITION[position ?? ""] ?? titleCase(position ?? "lainnya")}`;
export const genderLabel = (g?: string) => ({ male: "Pria", female: "Wanita" })[g ?? ""] ?? "Tidak diketahui";
export const ageLabel = (a?: string) => (!a || a === "Unknown" ? "Tidak diketahui" : a);

/** Merges segments from several accounts, biggest spend first, with shares and cost against the average. */
export function buildSegments(rows: { segment: string; stats: Stats }[]): Segment[] {
  const merged = new Map<string, Stats>();
  for (const r of rows) merged.set(r.segment, add(merged.get(r.segment) ?? ZERO, r.stats));
  const total = [...merged.values()].reduce(add, ZERO);
  const average = div(total.spend, total.results);
  return [...merged.entries()]
    .filter(([, s]) => s.spend > 0 || s.impressions > 0)
    .sort(([, a], [, b]) => b.spend - a.spend)
    .map(([segment, s]) => {
      const t = periodTotals(s);
      return {
        segment,
        ...t,
        spendSharePct: round(total.spend > 0 ? (s.spend / total.spend) * 100 : null, 1),
        costVsAveragePct: changePct(t.costPerResult, average === null ? null : Math.round(average)),
        sufficientData: s.results >= MIN_SEGMENT_RESULTS,
      };
    });
}

export function buildDaily(rows: { date: string; stats: Stats }[]): DailyPoint[] {
  const merged = new Map<string, Stats>();
  for (const r of rows) merged.set(r.date, add(merged.get(r.date) ?? ZERO, r.stats));
  return [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, s]) => ({ date, ...periodTotals(s), frequency: round(div(s.impressions, s.reach)) }));
}

/** What `fetchMetaEnrichment` pulled; null = that part failed (or wasn't requested). */
export type MetaEnrichmentRaw = {
  previousPeriod: { start: string; end: string };
  /** Previous-period stats per ref; refs missing here didn't run then. */
  previous: Record<number, Stats> | null;
  daily: { date: string; stats: Stats }[] | null;
  placement: { segment: string; stats: Stats }[] | null;
  age: { segment: string; stats: Stats }[] | null;
  gender: { segment: string; stats: Stats }[] | null;
  /** Per-ad daily rows of the period, for daily frequency / reach and landing page views. */
  adDaily: Record<number, AdDailyTotals> | null;
  gaps: string[];
};

/** Daily averages (Meta's period frequency hides how often people see an ad per day) and landing page views. */
export type AdDailyTotals = { days: number; impressions: number; reachSum: number; frequencySum: number; landingPageViews: number };

export const dailyFrequencyOf = (t: AdDailyTotals) => (t.days ? Math.round((t.frequencySum / t.days) * 100) / 100 : null);
export const dailyReachOf = (t: AdDailyTotals) => (t.days ? Math.round(t.reachSum / t.days) : null);

const statsOfAd = (a: CreativeAnalysisInput["ads"][number]): Stats => ({ spend: a.spend, impressions: a.impressions, reach: a.reach, clicks: a.clicks, results: a.results });

/** Adds the computed extra data to the input: per-ad previous period, the comparison, daily trend and breakdowns. */
export function applyEnrichment(
  input: CreativeAnalysisInput,
  raw: MetaEnrichmentRaw | null,
  images: { refs: number[]; gaps: string[] },
  today: string,
): CreativeAnalysisInput {
  const covered = input.ads.reduce((s, a) => add(s, statsOfAd(a)), ZERO);
  const gaps = [...(raw?.gaps ?? []), ...images.gaps];
  const ads = input.ads.map((ad) => {
    let a = ad;
    if (raw?.adDaily) {
      const d = raw.adDaily[a.ref];
      a = { ...a, dailyFrequency: d ? dailyFrequencyOf(d) : null, dailyReach: d ? dailyReachOf(d) : null, landingPageViews: d ? d.landingPageViews : null };
    }
    const prev = raw?.previous?.[a.ref];
    if (!raw?.previous) return a;
    if (!prev || prev.impressions === 0) return { ...a, previous: null };
    const p = periodTotals(prev);
    return { ...a, previous: { ...p, change: changeOf(periodTotals(statsOfAd(a)), p) } };
  });

  let comparison: AnalysisEnrichment["comparison"] = null;
  if (raw?.previous) {
    const previous = Object.values(raw.previous).reduce(add, ZERO);
    if (previous.impressions > 0) {
      const current = periodTotals(covered);
      const prev = periodTotals(previous);
      comparison = { previousPeriod: raw.previousPeriod, current, previous: prev, change: changeOf(current, prev) };
    } else gaps.push("Iklan-iklan ini belum berjalan di periode sebelumnya, jadi tidak ada pembanding.");
  }

  return {
    ...input,
    ads,
    enrichment: {
      coverage: { ads: input.ads.length, spendSharePct: round(input.totals.spend > 0 ? (covered.spend / input.totals.spend) * 100 : null, 1) },
      comparison,
      daily: raw?.daily ? buildDaily(raw.daily) : [],
      partialLastDay: input.period.end === today,
      breakdowns: {
        placement: raw?.placement ? buildSegments(raw.placement) : [],
        age: raw?.age ? buildSegments(raw.age) : [],
        gender: raw?.gender ? buildSegments(raw.gender) : [],
      },
      imageRefs: images.refs,
      gaps,
    },
  };
}

/* ---------------------------------- Meta ---------------------------------- */

type InsightRow = {
  ad_id?: string;
  date_start?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  inline_link_clicks?: string;
  actions?: { action_type: string; value: string }[];
  age?: string;
  gender?: string;
  publisher_platform?: string;
  platform_position?: string;
  objective?: string;
  /** Meta's Results (named `results` by the API; unrelated to Stats.results). */
  results?: MetaResult[];
};

const statsOf = (r: InsightRow): Stats => ({
  spend: Number(r.spend ?? 0),
  impressions: Number(r.impressions ?? 0),
  reach: Number(r.reach ?? 0),
  clicks: Number(r.inline_link_clicks ?? 0),
  results: metaLeads(r),
});

export class MetaRequestError extends Error {}

/** One Graph API GET. Network errors can carry the token in the URL, so their messages are never passed on. */
export async function graphGet<T>(url: URL): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25000) });
  } catch {
    throw new MetaRequestError("koneksi ke Meta terputus atau melewati batas waktu");
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: MetaApiError }) | null;
  if (!body) throw new MetaRequestError(`respons Meta tidak valid (HTTP ${res.status})`);
  if (!res.ok || body.error) throw new MetaRequestError(metaErrorMessage(body.error, res.status));
  return body;
}

async function insights(accountId: string, token: string, params: Record<string, string>): Promise<InsightRow[]> {
  const url = new URL(`${GRAPH}/act_${accountId.replace(/\D/g, "")}/insights`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "500");
  const rows: InsightRow[] = [];
  let next: URL | null = url;
  for (let page = 0; next && page < 20; page++) {
    const body: { data?: InsightRow[]; paging?: { next?: string } } = await graphGet(next);
    if (!Array.isArray(body.data)) throw new MetaRequestError("respons Meta tidak lengkap");
    rows.push(...body.data);
    const nextUrl = body.paging?.next;
    next = nextUrl && new URL(nextUrl).origin === "https://graph.facebook.com" ? new URL(nextUrl) : null;
  }
  return rows;
}

export type EnrichTarget = { ref: number; adAccountId: number; adId: string };

export async function accountsFor(targets: { adAccountId: number }[]) {
  const ids = [...new Set(targets.map((t) => t.adAccountId))];
  if (!ids.length) return [];
  return db.select().from(adAccounts).where(and(inArray(adAccounts.id, ids), eq(adAccounts.platform, "meta")));
}

/**
 * Pulls the extra data per ad account with the team's Meta connection (the same token the
 * Creative sync uses). A dimension that fails for any account is dropped entirely rather than shown partial.
 */
export async function fetchMetaEnrichment(targets: EnrichTarget[], period: { start: string; end: string; days: number }): Promise<MetaEnrichmentRaw> {
  const previousPeriod = previousRange(period.start, period.days);
  const raw: MetaEnrichmentRaw = { previousPeriod, previous: {}, daily: [], placement: [], age: [], gender: [], adDaily: {}, gaps: [] };
  const fail = (part: "previous" | "daily" | "placement" | "age" | "gender" | "adDaily") => (raw[part] = null);
  const none = { previous: null, daily: null, placement: null, age: null, gender: null, adDaily: null };
  const accounts = await accountsFor(targets);
  if (!accounts.length) {
    return { ...raw, ...none, gaps: ["Akun iklan Meta untuk iklan-iklan ini tidak ditemukan."] };
  }

  const token = await getMetaToken();
  if (!token) {
    return { ...raw, ...none, gaps: ["Data tambahan tidak ditarik: koneksi Meta Ads tim belum diisi."] };
  }
  for (const account of accounts) {
    const own = targets.filter((t) => t.adAccountId === account.id);
    const filtering = JSON.stringify([{ field: "ad.id", operator: "IN", value: own.map((t) => t.adId) }]);
    const current = { time_range: JSON.stringify({ since: period.start, until: period.end }), filtering, fields: STATS_FIELDS };
    const parts = [
      { key: "adDaily", label: "Data harian per iklan", params: { ...current, level: "ad", time_increment: "1", fields: `ad_id,date_start,impressions,reach,actions,${META_RESULT_FIELDS}` } },
      { key: "previous", label: "Periode sebelumnya", params: { ...current, level: "ad", fields: `ad_id,${STATS_FIELDS},${META_RESULT_FIELDS}`, time_range: JSON.stringify({ since: previousPeriod.start, until: previousPeriod.end }) } },
      // Campaign level, so each row carries its objective and a sales campaign's chats or purchases count.
      { key: "daily", label: "Tren harian", params: { ...current, fields: `${STATS_FIELDS},objective`, level: "campaign", time_increment: "1" } },
      { key: "placement", label: "Breakdown placement", params: { ...current, fields: `${STATS_FIELDS},objective`, level: "campaign", breakdowns: "publisher_platform,platform_position" } },
      { key: "age", label: "Breakdown umur", params: { ...current, fields: `${STATS_FIELDS},objective`, level: "campaign", breakdowns: "age" } },
      { key: "gender", label: "Breakdown gender", params: { ...current, fields: `${STATS_FIELDS},objective`, level: "campaign", breakdowns: "gender" } },
    ] as const;
    const settled = await Promise.allSettled(parts.map((p) => insights(account.accountId, token, p.params)));
    settled.forEach((res, i) => {
      const part = parts[i]!;
      if (res.status === "rejected") {
        fail(part.key);
        raw.gaps.push(`${part.label} akun ${account.name} gagal ditarik: ${res.reason instanceof MetaRequestError ? res.reason.message : "kesalahan tidak dikenal"}.`);
        return;
      }
      const rows = res.value;
      if (part.key === "adDaily" && raw.adDaily) {
        for (const r of rows) {
          const target = own.find((t) => t.adId === r.ad_id);
          if (!target) continue;
          const t = (raw.adDaily[target.ref] ??= { days: 0, impressions: 0, reachSum: 0, frequencySum: 0, landingPageViews: 0 });
          const impressions = Number(r.impressions ?? 0);
          const reach = Number(r.reach ?? 0);
          t.impressions += impressions;
          t.landingPageViews += Number(r.actions?.find((x) => x.action_type === "landing_page_view")?.value ?? 0);
          if (reach > 0) {
            t.days++;
            t.reachSum += reach;
            t.frequencySum += impressions / reach;
          }
        }
      } else if (part.key === "previous" && raw.previous) {
        for (const r of rows) {
          const target = own.find((t) => t.adId === r.ad_id);
          if (target) raw.previous[target.ref] = statsOf(r);
        }
      } else if (part.key === "daily" && raw.daily) {
        raw.daily.push(...rows.filter((r) => r.date_start).map((r) => ({ date: r.date_start!, stats: statsOf(r) })));
      } else if (part.key === "placement" && raw.placement) {
        raw.placement.push(...rows.map((r) => ({ segment: placementLabel(r.publisher_platform, r.platform_position), stats: statsOf(r) })));
      } else if (part.key === "age" && raw.age) {
        raw.age.push(...rows.map((r) => ({ segment: ageLabel(r.age), stats: statsOf(r) })));
      } else if (part.key === "gender" && raw.gender) {
        raw.gender.push(...rows.map((r) => ({ segment: genderLabel(r.gender), stats: statsOf(r) })));
      }
    });
  }
  return raw;
}

export type CreativeImage = { ref: number; mediaType: ImageMediaType; data: string };

/** Meta serves creative media from its own CDNs; anything else is refused. */
export function isMetaMediaUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)(fbcdn\.net|facebook\.com|fbsbx\.com|cdninstagram\.com)$/.test(url.hostname);
  } catch {
    return false;
  }
}

export async function downloadImage(url: string): Promise<{ mediaType: ImageMediaType; data: string } | null> {
  if (!isMetaMediaUrl(url)) return null;
  try {
    const res = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    const type = res.headers.get("content-type")?.split(";")[0]?.trim() as ImageMediaType | undefined;
    if (!res.ok || !type || !IMAGE_TYPES.includes(type)) return null;
    if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return bytes.length && bytes.length <= MAX_IMAGE_BYTES ? { mediaType: type, data: bytes.toString("base64") } : null;
  } catch {
    return null;
  }
}

/**
 * The creative image of the biggest ads: the full image for image ads, else a 600px thumbnail
 * (video cover, first carousel card). The thumbnail stored by the sync is only 64px, too small to judge.
 */
export async function fetchCreativeImages(targets: EnrichTarget[], max = MAX_ANALYSIS_IMAGES): Promise<{ images: CreativeImage[]; gaps: string[] }> {
  const picked = targets.slice(0, max);
  const token = await getMetaToken();
  const images: CreativeImage[] = [];
  let missing = 0;
  for (let i = 0; i < picked.length; i += 3) {
    const chunk = picked.slice(i, i + 3);
    const results = await Promise.all(
      chunk.map(async (t) => {
        if (!token) return null;
        try {
          const adUrl = new URL(`${GRAPH}/${t.adId}`);
          adUrl.searchParams.set("fields", "creative{id,image_url}");
          adUrl.searchParams.set("access_token", token);
          const ad = await graphGet<{ creative?: { id?: string; image_url?: string } }>(adUrl);
          let src = ad.creative?.image_url ?? null;
          if (!src && ad.creative?.id && /^\d+$/.test(ad.creative.id)) {
            const creativeUrl = new URL(`${GRAPH}/${ad.creative.id}`);
            creativeUrl.searchParams.set("fields", "thumbnail_url");
            creativeUrl.searchParams.set("thumbnail_width", "600");
            creativeUrl.searchParams.set("thumbnail_height", "600");
            creativeUrl.searchParams.set("access_token", token);
            src = (await graphGet<{ thumbnail_url?: string }>(creativeUrl)).thumbnail_url ?? null;
          }
          const image = src ? await downloadImage(src) : null;
          return image ? { ref: t.ref, ...image } : null;
        } catch {
          return null;
        }
      }),
    );
    for (const r of results) r ? images.push(r) : missing++;
  }
  return { images, gaps: missing ? [`Gambar creative ${missing} iklan tidak bisa diambil dari Meta, jadi visualnya tidak dinilai.`] : [] };
}
