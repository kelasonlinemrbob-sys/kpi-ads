/** Unknown is distinct from a measured zero; clicks are never substituted for LPV. */
export function metaLandingPageViews(actions?: { action_type: string; value: string }[]): number | null {
  const action = actions?.find((a) => a.action_type === "landing_page_view");
  if (!action) return 0; // Insights omits zero-count actions.
  const value = Number(action.value);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

export function sumLandingPageViews(rows: { landingPageViews?: number | null }[], empty: number | null = 0): number | null {
  if (!rows.length) return empty;
  return rows.some((r) => r.landingPageViews == null) ? null : rows.reduce((sum, r) => sum + r.landingPageViews!, 0);
}

export function generatedMetricStrings(metrics: { spent: number; impressions: number; clicks: number; leads: number; landingPageViews: number | null }) {
  return { spent: String(metrics.spent), impressions: String(metrics.impressions), clicks: String(metrics.clicks), leads: String(metrics.leads),
    landingPageViews: metrics.landingPageViews === null ? "" : String(metrics.landingPageViews) };
}

export const validGoogleConversionResource = (value: string) => /^customers\/\d+\/conversionActions\/\d+$/.test(value);
