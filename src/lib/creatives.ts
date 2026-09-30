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
