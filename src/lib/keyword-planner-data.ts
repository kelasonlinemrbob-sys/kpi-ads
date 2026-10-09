/**
 * Google Keyword Planner rows (Google Ads API KeywordPlanIdeaService) in the shape the SEO page and its AI
 * analysis use, joined to the property's own Search Console keywords. Pure, no API access.
 */

export type ApiKeywordMetrics = {
  avgMonthlySearches?: string | number;
  competition?: string;
  competitionIndex?: string | number;
  lowTopOfPageBidMicros?: string | number;
  highTopOfPageBidMicros?: string | number;
  monthlySearchVolumes?: { month?: string; year?: string | number; monthlySearches?: string | number }[];
};
/** generateKeywordIdeas rows carry `keywordIdeaMetrics`; generateKeywordHistoricalMetrics rows `keywordMetrics`. */
export type ApiKeywordRow = { text?: string; keywordIdeaMetrics?: ApiKeywordMetrics; keywordMetrics?: ApiKeywordMetrics; closeVariants?: string[] };

export type Competition = "low" | "medium" | "high" | "unknown";
export const COMPETITION_LABEL: Record<Competition, string> = { low: "Rendah", medium: "Sedang", high: "Tinggi", unknown: "–" };

export type PlannerKeyword = {
  keyword: string;
  /** Average monthly searches over the last 12 months (Google rounds them into buckets). */
  volume: number | null;
  competition: Competition;
  /** 0–100, how many advertisers bid on it compared with other keywords. */
  competitionIndex: number | null;
  /** Top-of-page bid range in the ad account's currency. */
  bidLow: number | null;
  bidHigh: number | null;
  /** Monthly searches, oldest first. */
  trend: { month: string; searches: number }[];
  /** Last 3 months against the 3 before, in percent. */
  trendPct: number | null;
};

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const toNum = (v: string | number | undefined) => (v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const micros = (v: string | number | undefined) => { const n = toNum(v); return n === null ? null : Math.round(n / 1_000_000); };

export const normalizeKeyword = (k: string) => k.trim().toLowerCase().replace(/\s+/g, " ");

export function parsePlannerRow(row: ApiKeywordRow): PlannerKeyword | null {
  const keyword = row.text?.trim();
  if (!keyword) return null;
  const m = row.keywordIdeaMetrics ?? row.keywordMetrics ?? {};
  const trend = (m.monthlySearchVolumes ?? [])
    .map((v) => ({ y: toNum(v.year), mi: MONTHS.indexOf(v.month ?? ""), searches: toNum(v.monthlySearches) ?? 0 }))
    .filter((v) => v.y !== null && v.mi >= 0)
    .sort((a, b) => a.y! - b.y! || a.mi - b.mi)
    .map((v) => ({ month: `${v.y}-${String(v.mi + 1).padStart(2, "0")}`, searches: v.searches }));
  const sum = (list: { searches: number }[]) => list.reduce((s, v) => s + v.searches, 0);
  const last3 = trend.slice(-3);
  const prev3 = trend.slice(-6, -3);
  const competition = (m.competition ?? "").toUpperCase();
  return {
    keyword,
    volume: toNum(m.avgMonthlySearches),
    competition: competition === "LOW" ? "low" : competition === "MEDIUM" ? "medium" : competition === "HIGH" ? "high" : "unknown",
    competitionIndex: toNum(m.competitionIndex),
    bidLow: micros(m.lowTopOfPageBidMicros),
    bidHigh: micros(m.highTopOfPageBidMicros),
    trend,
    trendPct: prev3.length === 3 && sum(prev3) > 0 ? Math.round(((sum(last3) - sum(prev3)) / sum(prev3)) * 1000) / 10 : null,
  };
}

export type RankedKeyword = PlannerKeyword & {
  /** The property's Search Console figures for this keyword, null when it doesn't show for it (a content gap). */
  site: { clicks: number; impressions: number; position: number } | null;
};

/** Planner keywords with how the site does for each in Search Console (exact match, case-insensitive). */
export function joinWithSearchConsole(keywords: PlannerKeyword[], queries: { keys?: string[]; clicks: number; impressions: number; position: number }[]): RankedKeyword[] {
  const bySite = new Map(queries.map((q) => [normalizeKeyword(q.keys?.[0] ?? ""), q]));
  return keywords.map((k) => {
    const q = bySite.get(normalizeKeyword(k.keyword));
    return { ...k, site: q ? { clicks: q.clicks, impressions: q.impressions, position: q.position } : null };
  });
}

/** Unique, trimmed seed keywords (Keyword Planner takes at most 20). */
export function cleanSeeds(seeds: string[], max = 20) {
  const out: string[] = [];
  for (const s of seeds) {
    const k = s.trim().replace(/\s+/g, " ").slice(0, 80);
    if (k && !out.some((o) => normalizeKeyword(o) === normalizeKeyword(k))) out.push(k);
  }
  return out.slice(0, max);
}

/** A ready-made opening for the research tab: the keywords the site already gets the most impressions for. */
export function defaultSeeds(queries: { keys?: string[]; impressions: number }[], n = 5) {
  return cleanSeeds([...queries].sort((a, b) => b.impressions - a.impressions).map((q) => q.keys?.[0] ?? ""), n);
}

/** Planner results as CSV (Indonesian headers), for the download button. */
export function plannerCsv(rows: RankedKeyword[], currency: string) {
  const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const header = ["Kata kunci", "Volume/bulan", "Tren 3 bulan (%)", "Kompetisi", "Indeks kompetisi", `Bid rendah (${currency})`, `Bid tinggi (${currency})`, "Posisi website", "Impresi website", "Klik website"];
  return [header, ...rows.map((r) => [r.keyword, r.volume, r.trendPct, COMPETITION_LABEL[r.competition], r.competitionIndex, r.bidLow, r.bidHigh, r.site ? Math.round(r.site.position * 10) / 10 : "", r.site?.impressions ?? "", r.site?.clicks ?? ""])]
    .map((line) => line.map(esc).join(","))
    .join("\n");
}
