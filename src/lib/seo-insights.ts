/**
 * Numbers behind the SEO page and its AI analysis, computed from Search Console rows. Pure: no API access,
 * so the page and the AI read the same figures and the rules are testable.
 */

export type SeoRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

export type SeoChange = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  /** null when the row wasn't in the previous period's top list (new, or below it). */
  previous: { clicks: number; impressions: number; ctr: number; position: number } | null;
  clicksDelta: number | null;
  /** Positive = moved up (a smaller position number). */
  positionGain: number | null;
};

const keyOf = (r: SeoRow) => r.keys?.[0] ?? "";

/** Rows of this period joined to the same key in the previous period. */
export function withChanges(current: SeoRow[], previous: SeoRow[] | null): SeoChange[] {
  const before = new Map((previous ?? []).map((r) => [keyOf(r), r]));
  return current.map((r) => {
    const p = previous ? before.get(keyOf(r)) ?? null : null;
    return {
      key: keyOf(r), clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
      previous: p ? { clicks: p.clicks, impressions: p.impressions, ctr: p.ctr, position: p.position } : null,
      clicksDelta: p ? r.clicks - p.clicks : null,
      positionGain: p && p.impressions && r.impressions ? round(p.position - r.position, 1) : null,
    };
  });
}

/** Relative change in percent, null without a base. */
export function pctChange(current: number, previous: number | null | undefined) {
  if (previous === null || previous === undefined || previous === 0) return null;
  return round(((current - previous) / previous) * 100, 1);
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export const POSITION_BUCKETS = [
  { key: "top3", label: "Posisi 1–3", max: 3 },
  { key: "top10", label: "Posisi 4–10", max: 10 },
  { key: "page2", label: "Posisi 11–20", max: 20 },
  { key: "beyond", label: "Posisi > 20", max: Infinity },
] as const;
export type PositionBucket = (typeof POSITION_BUCKETS)[number]["key"];
export const bucketOf = (position: number): PositionBucket => POSITION_BUCKETS.find((b) => position <= b.max)!.key;

/** How many keywords (and their clicks) sit in each position band. */
export function positionDistribution(rows: SeoRow[]) {
  return POSITION_BUCKETS.map((b) => {
    const inBucket = rows.filter((r) => r.impressions > 0 && bucketOf(r.position) === b.key);
    return { key: b.key, label: b.label, keywords: inBucket.length, clicks: inBucket.reduce((s, r) => s + r.clicks, 0), impressions: inBucket.reduce((s, r) => s + r.impressions, 0) };
  });
}

/**
 * A typical organic CTR for a position (rounded, general web averages; not an official Google figure).
 * Used only to flag titles that get far fewer clicks than their ranking should bring.
 */
export function expectedCtr(position: number) {
  const curve = [0.28, 0.15, 0.11, 0.08, 0.065, 0.05, 0.04, 0.032, 0.027, 0.022];
  if (position < 1) return curve[0]!;
  if (position <= 10) return curve[Math.round(position) - 1]!;
  return position <= 20 ? 0.01 : 0.005;
}

export type Opportunity = {
  kind: "striking" | "low_ctr" | "declining";
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  /** Rough extra clicks a month if fixed; for ranking, not a promise. */
  potentialClicks: number;
  note: string;
};
export const OPPORTUNITY_LABEL: Record<Opportunity["kind"], string> = {
  striking: "Hampir halaman 1",
  low_ctr: "CTR di bawah wajar",
  declining: "Klik turun",
};

/**
 * Keywords worth working on: ranked 4–20 with real demand (a push reaches the top of page 1), ranked well
 * but clicked far less than usual for that position (title/description), and losing clicks since the
 * previous period. Ordered by potential, at most `limit` per kind.
 */
export function findOpportunities(rows: SeoChange[], opts: { minImpressions?: number; limit?: number } = {}): Opportunity[] {
  const min = opts.minImpressions ?? 30;
  const limit = opts.limit ?? 10;
  const pick = (kind: Opportunity["kind"], list: Opportunity[]) => list.sort((a, b) => b.potentialClicks - a.potentialClicks).slice(0, limit);
  const striking = rows
    .filter((r) => r.impressions >= min && r.position > 3 && r.position <= 20)
    .map((r): Opportunity => ({
      kind: "striking", key: r.key, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
      potentialClicks: Math.max(0, Math.round(r.impressions * expectedCtr(3) - r.clicks)),
      note: r.position <= 10 ? "Sudah di halaman 1; naik ke posisi 1–3 bisa melipatgandakan klik." : "Di halaman 2; sedikit dorongan membawanya ke halaman 1.",
    }));
  const lowCtr = rows
    .filter((r) => r.impressions >= min && r.position <= 10 && r.ctr < expectedCtr(r.position) * 0.5)
    .map((r): Opportunity => ({
      kind: "low_ctr", key: r.key, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
      potentialClicks: Math.max(0, Math.round(r.impressions * expectedCtr(r.position) - r.clicks)),
      note: "Tayang cukup tinggi tapi jarang diklik: perbaiki judul dan meta description.",
    }));
  const declining = rows
    .filter((r) => r.previous && r.clicksDelta !== null && r.clicksDelta <= -3 && r.previous.clicks > 0 && r.clicksDelta / r.previous.clicks <= -0.3)
    .map((r): Opportunity => ({
      kind: "declining", key: r.key, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
      potentialClicks: -r.clicksDelta!,
      note: r.positionGain !== null && r.positionGain < -1 ? `Posisi turun ${Math.abs(r.positionGain).toLocaleString("id-ID")} peringkat.` : "Permintaan atau CTR turun; posisi relatif stabil.",
    }));
  return [...pick("striking", striking), ...pick("low_ctr", lowCtr), ...pick("declining", declining)];
}

/**
 * Biggest changes since the previous period: in clicks, in rank (keywords with at least `minImpressions`,
 * which still says something on small sites where Google hides most clicks per keyword), and keywords new
 * in the top list.
 */
export function topMovers(rows: SeoChange[], limit = 5, minImpressions = 10) {
  const moved = rows.filter((r) => r.clicksDelta !== null && r.clicksDelta !== 0);
  const ranked = rows.filter((r) => r.positionGain !== null && r.positionGain !== 0 && r.impressions >= minImpressions);
  return {
    up: [...moved].filter((r) => r.clicksDelta! > 0).sort((a, b) => b.clicksDelta! - a.clicksDelta!).slice(0, limit),
    down: [...moved].filter((r) => r.clicksDelta! < 0).sort((a, b) => a.clicksDelta! - b.clicksDelta!).slice(0, limit),
    rankUp: ranked.filter((r) => r.positionGain! > 0).sort((a, b) => b.positionGain! - a.positionGain!).slice(0, limit),
    rankDown: ranked.filter((r) => r.positionGain! < 0).sort((a, b) => a.positionGain! - b.positionGain!).slice(0, limit),
    fresh: rows.filter((r) => r.previous === null && r.impressions > 0).sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks).slice(0, limit),
  };
}
