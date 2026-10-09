/**
 * Pure shape of one campaign's ad sets (Google: ad groups) and ads, shared by the Meta/Google fetch, the
 * Campaigns table and the AI analysis. No credentials or API access here.
 */
import type { CampaignMetrics } from "./campaign-metrics";

/** Campaigns per request when opening the Ad set / Iklan level on Campaigns. */
export const MAX_LEVEL_CAMPAIGNS = 100;

export type TreeStatus = "active" | "paused" | "ended" | "draft";

export type BreakdownAd = {
  id: string;
  name: string;
  status: TreeStatus;
  platformStatus: string | null;
  thumbnailUrl: string | null;
  metrics: CampaignMetrics;
};

export type BreakdownAdSet = {
  id: string;
  name: string;
  status: TreeStatus;
  platformStatus: string | null;
  /** In the account currency; null when the budget sits on the campaign (CBO) or is unknown. */
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  optimizationGoal: string | null;
  /** Short audience summary, e.g. "18–35 · Perempuan · Indonesia · minat: IELTS, Beasiswa". */
  audience: string | null;
  metrics: CampaignMetrics;
  ads: BreakdownAd[];
};

export type CampaignBreakdown = {
  platform: "meta" | "google";
  currency: string;
  adsets: BreakdownAdSet[];
};

/** Meta effective_status and Google status → the app's campaign status. */
export function treeStatus(raw: string | null | undefined): TreeStatus {
  const s = (raw ?? "").toUpperCase();
  if (s === "ACTIVE" || s === "ENABLED") return "active";
  if (s.endsWith("PAUSED")) return "paused";
  if (s === "ARCHIVED" || s === "DELETED" || s === "REMOVED") return "ended";
  return "draft";
}

const delivered = (m: CampaignMetrics) => (m.spent ?? 0) > 0 || (m.impressions ?? 0) > 0;

type Node<T> = { id: string; status: TreeStatus } & T;

/**
 * Joins the structure (every ad set / ad with its status) with the period's metrics. Items without
 * delivery in the period are kept only while not ended, so archived leftovers don't flood the table.
 * Sorted by spend, then name.
 */
export function buildBreakdown(opts: {
  platform: "meta" | "google";
  currency: string;
  adsets: Node<Omit<BreakdownAdSet, "metrics" | "ads">>[];
  ads: (Node<Omit<BreakdownAd, "metrics">> & { adsetId: string })[];
  adsetMetrics: Map<string, { name: string; metrics: CampaignMetrics }>;
  adMetrics: Map<string, { name: string; adsetId: string; metrics: CampaignMetrics }>;
  empty: () => CampaignMetrics;
}): CampaignBreakdown {
  const bySpend = <T extends { name: string; metrics: CampaignMetrics }>(a: T, b: T) =>
    (b.metrics.spent ?? 0) - (a.metrics.spent ?? 0) || a.name.localeCompare(b.name);

  const ads = new Map<string, (BreakdownAd & { adsetId: string })>();
  for (const ad of opts.ads) ads.set(ad.id, { ...ad, metrics: opts.adMetrics.get(ad.id)?.metrics ?? opts.empty() });
  // Ads that delivered in the period but are no longer listed (e.g. deleted since).
  for (const [id, m] of opts.adMetrics) {
    if (!ads.has(id)) ads.set(id, { id, name: m.name, adsetId: m.adsetId, status: "ended", platformStatus: null, thumbnailUrl: null, metrics: m.metrics });
  }

  const adsets = new Map<string, BreakdownAdSet>();
  for (const s of opts.adsets) adsets.set(s.id, { ...s, metrics: opts.adsetMetrics.get(s.id)?.metrics ?? opts.empty(), ads: [] });
  for (const [id, m] of opts.adsetMetrics) {
    if (!adsets.has(id)) adsets.set(id, { id, name: m.name, status: "ended", platformStatus: null, dailyBudget: null, lifetimeBudget: null, optimizationGoal: null, audience: null, metrics: m.metrics, ads: [] });
  }
  for (const { adsetId, ...ad } of ads.values()) {
    if (ad.status === "ended" && !delivered(ad.metrics)) continue;
    adsets.get(adsetId)?.ads.push(ad);
  }
  const list = [...adsets.values()].filter((s) => s.status !== "ended" || delivered(s.metrics) || s.ads.length > 0);
  for (const s of list) s.ads.sort(bySpend);
  return { platform: opts.platform, currency: opts.currency, adsets: list.sort(bySpend) };
}

/* ------------------------------ Meta targeting ------------------------------ */

export type MetaTargeting = {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations?: { countries?: string[]; regions?: { name?: string }[]; cities?: { name?: string }[]; custom_locations?: unknown[] };
  flexible_spec?: Record<string, { name?: string }[] | undefined>[];
  custom_audiences?: { name?: string }[];
  excluded_custom_audiences?: { name?: string }[];
  targeting_automation?: { advantage_audience?: number };
};

const names = (items: { name?: string }[] | undefined) => (items ?? []).map((i) => i.name).filter((n): n is string => Boolean(n));
const firstFew = (items: string[], n = 3) => (items.length > n ? `${items.slice(0, n).join(", ")} +${items.length - n}` : items.join(", "));

/** "18–35 · Perempuan · ID · minat: IELTS, Beasiswa +2 · Advantage+" — enough for the table and the AI. */
export function describeTargeting(t: MetaTargeting | null | undefined): string | null {
  if (!t) return null;
  const parts: string[] = [];
  if (t.age_min || t.age_max) parts.push(`${t.age_min ?? 18}–${t.age_max && t.age_max < 65 ? t.age_max : "65+"}`);
  const g = t.genders ?? [];
  if (g.length === 1) parts.push(g[0] === 1 ? "Laki-laki" : "Perempuan");
  const geo = [...(t.geo_locations?.countries ?? []), ...names(t.geo_locations?.regions), ...names(t.geo_locations?.cities)];
  if (geo.length) parts.push(firstFew(geo));
  else if (t.geo_locations?.custom_locations?.length) parts.push(`${t.geo_locations.custom_locations.length} titik lokasi`);
  const interests = (t.flexible_spec ?? []).flatMap((spec) => Object.values(spec).flatMap((v) => names(v)));
  if (interests.length) parts.push(`minat: ${firstFew(interests)}`);
  const custom = names(t.custom_audiences);
  if (custom.length) parts.push(`audiens: ${firstFew(custom, 2)}`);
  const excluded = names(t.excluded_custom_audiences);
  if (excluded.length) parts.push(`kecuali: ${firstFew(excluded, 2)}`);
  if (t.targeting_automation?.advantage_audience === 1) parts.push("Advantage+ audience");
  return parts.length ? parts.join(" · ") : null;
}
