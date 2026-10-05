export const targetMinimum = (key: string) => key === "seo_score" ? 85 : key === "articles" ? 1 : key === "seo_impressions" || key === "seo_clicks" ? 5 : key === "task_completion" ? 100 : 0;
export const targetMaximum = (key: string) => key === "seo_score" || key === "task_completion" ? 100 : undefined;

export function validTarget(key: string, value: number | null, isDefault = false) {
  if (value === null) return !isDefault || targetMinimum(key) === 0;
  return Number.isFinite(value) && value >= targetMinimum(key) && value <= (targetMaximum(key) ?? Infinity);
}
