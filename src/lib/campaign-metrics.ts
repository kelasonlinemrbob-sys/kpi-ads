/** Shared presentation/math only: no credentials or API access. */
export const CAMPAIGN_PERIODS = [
  { value: "today", label: "Hari ini" }, { value: "yesterday", label: "Kemarin" },
  { value: "7d", label: "7 hari terakhir" }, { value: "30d", label: "30 hari terakhir" },
  { value: "month", label: "Bulan ini" }, { value: "last-month", label: "Bulan lalu" },
];
export function campaignPeriod(value: string | undefined, today: string) {
  const key = CAMPAIGN_PERIODS.some((p) => p.value === value) ? value! : "month";
  const shift = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  let start = today, end = today;
  if (key === "yesterday") start = end = shift(today, -1);
  if (key === "7d" || key === "30d") start = shift(today, key === "7d" ? -6 : -29);
  if (key === "month") start = `${today.slice(0, 7)}-01`;
  if (key === "last-month") { end = shift(`${today.slice(0, 7)}-01`, -1); start = `${end.slice(0, 7)}-01`; }
  return { key, start, end };
}
export type CampaignMetrics = {
  currency: string | null;
  spent: number | null; impressions: number | null; reach: number | null;
  clicks: number | null; linkClicks: number | null; outboundClicks: number | null;
  leads: number | null; conversions: number | null; chats: number | null; landingPageViews: number | null;
  purchases: number | null; revenue: number | null; engagements: number | null;
  videoPlays: number | null; video3s: number | null; thruplays: number | null;
};
export function emptyCampaignMetrics(platform: "meta" | "google", currency: string | null, lpvAvailable = true): CampaignMetrics {
  return { currency, spent: 0, impressions: 0, clicks: 0, conversions: platform === "google" ? 0 : null,
    reach: platform === "meta" ? 0 : null, linkClicks: platform === "meta" ? 0 : null,
    outboundClicks: platform === "meta" ? 0 : null, leads: platform === "meta" ? 0 : null,
    chats: platform === "meta" ? 0 : null, landingPageViews: lpvAvailable ? 0 : null,
    purchases: platform === "meta" ? 0 : null, revenue: platform === "meta" ? 0 : null,
    engagements: platform === "meta" ? 0 : null, videoPlays: platform === "meta" ? 0 : null,
    video3s: platform === "meta" ? 0 : null, thruplays: platform === "meta" ? 0 : null };
}
export function ratio(a: number | null, b: number | null, factor = 1): number | null {
  return a !== null && b !== null && b > 0 ? a / b * factor : null;
}
export function derivedCampaignMetrics(m: CampaignMetrics) {
  return { ...m, frequency: ratio(m.impressions, m.reach), ctr: ratio(m.clicks, m.impressions, 100),
    linkCtr: ratio(m.linkClicks, m.impressions, 100), cpc: ratio(m.spent, m.clicks),
    linkCpc: ratio(m.spent, m.linkClicks), cpm: ratio(m.spent, m.impressions, 1000),
    cpr: ratio(m.spent, m.leads), costPerChat: ratio(m.spent, m.chats),
    costPerConversion: ratio(m.spent, m.conversions), cplv: ratio(m.spent, m.landingPageViews),
    lpvRate: ratio(m.landingPageViews, m.linkClicks, 100), costPerPurchase: ratio(m.spent, m.purchases),
    roas: ratio(m.revenue, m.spent), costPerThruplay: ratio(m.spent, m.thruplays) };
}
/** Unknown data stays unknown; reach is NOT additive across campaigns. Ratios use totals. */
export function totalCampaignMetrics(rows: (CampaignMetrics | null)[]): CampaignMetrics {
  const total = emptyCampaignMetrics("meta", null);
  const currencies = new Set(rows.map((r) => r?.currency));
  total.currency = currencies.size === 1 ? rows[0]?.currency ?? null : null;
  for (const key of Object.keys(total) as (keyof CampaignMetrics)[]) {
    if (key === "currency") continue;
    total[key] = rows.length && rows.every((r) => r?.[key] !== null && r?.[key] !== undefined)
      ? rows.reduce((sum, r) => sum + r![key]!, 0) : null;
  }
  total.reach = null;
  if (!total.currency) { total.spent = null; total.revenue = null; }
  return total;
}
export function campaignMoney(value: number | null, currency: string | null) {
  if (value === null || !currency) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: currency === "IDR" ? 0 : 2 }).format(value);
}
