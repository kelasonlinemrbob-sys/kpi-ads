import type { AdCreative } from "@/db/schema";

/** Labels for the Creative page ("Konten Iklan"), shared by the page, the CSV export and the sync. */

export const CREATIVE_FORMAT_LABEL: Record<AdCreative["format"], string> = {
  video: "Video",
  grafis: "Grafis",
  carousel: "Carousel",
  lainnya: "Lainnya",
};

export const CREATIVE_STATUS_LABEL: Record<AdCreative["status"], string> = {
  active: "Active",
  paused: "Paused",
  review: "Review",
  takedown: "Takedown",
};

/** "Keterangan": the team's verdict on a content. */
export const CREATIVE_LABEL: Record<NonNullable<AdCreative["label"]>, string> = {
  winning: "Winning",
  good: "Good",
  average: "Average",
  poor: "Kurang",
};

/** Campaign objective as the team names the kind of ad, e.g. OUTCOME_SALES → "Iklan konversi". */
export function objectiveLabel(objective: string | null) {
  switch (objective) {
    case "OUTCOME_SALES":
    case "CONVERSIONS":
    case "PRODUCT_CATALOG_SALES":
      return "Iklan konversi";
    case "OUTCOME_TRAFFIC":
    case "LINK_CLICKS":
      return "Iklan traffic";
    case "OUTCOME_LEADS":
    case "LEAD_GENERATION":
      return "Iklan leads";
    case "OUTCOME_ENGAGEMENT":
    case "POST_ENGAGEMENT":
    case "PAGE_LIKES":
      return "Iklan engagement";
    case "MESSAGES":
      return "Iklan pesan";
    case "VIDEO_VIEWS":
      return "Iklan video views";
    case "OUTCOME_AWARENESS":
    case "REACH":
    case "BRAND_AWARENESS":
      return "Iklan awareness";
    case "OUTCOME_APP_PROMOTION":
    case "APP_INSTALLS":
      return "Iklan aplikasi";
    default:
      return objective ? objective.toLowerCase().replace(/^outcome_/, "iklan ").replace(/_/g, " ") : "–";
  }
}

/** Average play time as the sheet shows it: whole seconds, or m:ss from a minute. */
export function formatPlayTime(seconds: number | null) {
  if (seconds === null) return "–";
  const s = Math.round(seconds);
  return s < 60 ? String(s) : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* ------------------------------ Performance maths ------------------------------ */

export type CreativeNumbers = {
  format: AdCreative["format"];
  impressions: number;
  reach: number;
  videoViews: number;
  thruplays: number;
  avgPlayTime: number | null;
  spend: number;
  clicks: number;
  leads: number;
};

export type CreativeTotals = {
  count: number;
  impressions: number;
  reach: number;
  spend: number;
  clicks: number;
  leads: number;
  /** Video-only sums, so hook / hold rates aren't diluted by images. */
  videoImpressions: number;
  videoViews: number;
  thruplays: number;
  /** Average play time weighted by impressions (seconds). */
  avgPlayTime: number | null;
};

export function sumCreatives(rows: CreativeNumbers[]): CreativeTotals {
  const t: CreativeTotals = {
    count: rows.length,
    impressions: 0,
    reach: 0,
    spend: 0,
    clicks: 0,
    leads: 0,
    videoImpressions: 0,
    videoViews: 0,
    thruplays: 0,
    avgPlayTime: null,
  };
  let playWeighted = 0;
  let playWeight = 0;
  for (const r of rows) {
    t.impressions += r.impressions;
    t.reach += r.reach;
    t.spend += r.spend;
    t.clicks += r.clicks;
    t.leads += r.leads;
    if (r.format === "video") {
      t.videoImpressions += r.impressions;
      t.videoViews += r.videoViews;
      t.thruplays += r.thruplays;
      if (r.avgPlayTime !== null && r.impressions > 0) {
        playWeighted += r.avgPlayTime * r.impressions;
        playWeight += r.impressions;
      }
    }
  }
  t.avgPlayTime = playWeight ? playWeighted / playWeight : null;
  return t;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

/** Rates the team reads a content by. Percentages are 0–100. */
export function creativeRates(t: Pick<CreativeTotals, "impressions" | "spend" | "clicks" | "leads" | "videoImpressions" | "videoViews" | "thruplays">) {
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
  return {
    /** Link clicks ÷ impressions. */
    ctr: pct(t.clicks, t.impressions),
    /** Cost per 1.000 impressions. */
    cpm: t.impressions ? (t.spend / t.impressions) * 1000 : null,
    /** 3-second views ÷ impressions: does the opening stop the scroll? */
    hook: pct(t.videoViews, t.videoImpressions),
    /** ThruPlays ÷ 3-second views: do viewers stay? */
    hold: pct(t.thruplays, t.videoViews),
    /** Cost per lead. */
    cpl: ratio(t.spend, t.leads),
  };
}

const id0 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const id1 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const idCompact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

export const fmt = {
  num: (v: number | null) => (v === null ? "–" : id0.format(v)),
  compact: (v: number | null) => (v === null ? "–" : idCompact.format(v)),
  pct: (v: number | null) => (v === null ? "–" : `${id1.format(v)}%`),
  rp: (v: number | null) => (v === null ? "–" : `Rp ${id0.format(Math.round(v))}`),
  rpCompact: (v: number | null) => (v === null ? "–" : `Rp ${idCompact.format(v)}`),
};
