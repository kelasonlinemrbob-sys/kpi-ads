/** Ad performance numbers and the ratios derived from them, formatted the Indonesian way (1.250.000). */
export type AdMetrics = { spent: number; impressions: number; clicks: number; leads: number };

export const ZERO_METRICS: AdMetrics = { spent: 0, impressions: 0, clicks: 0, leads: 0 };

export function sumMetrics(rows: AdMetrics[]): AdMetrics {
  return rows.reduce(
    (total, row) => ({
      spent: total.spent + row.spent,
      impressions: total.impressions + row.impressions,
      clicks: total.clicks + row.clicks,
      leads: total.leads + row.leads,
    }),
    ZERO_METRICS,
  );
}

/** Cost per result = spent ÷ leads. */
export const cpr = (m: Pick<AdMetrics, "spent" | "leads">) => (m.leads > 0 ? m.spent / m.leads : null);
/** Click-through rate in percent. */
export const ctr = (m: Pick<AdMetrics, "clicks" | "impressions">) => (m.impressions > 0 ? (m.clicks / m.impressions) * 100 : null);

const idNumber = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const idPercent = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatId = (value: number | null) => (value === null ? "—" : idNumber.format(Math.round(value)));
export const formatRp = (value: number | null) => (value === null ? "—" : `Rp ${idNumber.format(Math.round(value))}`);
export const formatPct = (value: number | null) => (value === null ? "—" : `${idPercent.format(value)}%`);
