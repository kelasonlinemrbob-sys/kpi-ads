/** Tabs of Performa SEO, shared by the server page (reading ?tab=) and the client dashboard. */
export const SEO_TABS = ["overview", "queries", "pages", "opportunities", "research", "audience", "ai"] as const;
export type SeoTab = (typeof SEO_TABS)[number];
export const isSeoTab = (v: unknown): v is SeoTab => SEO_TABS.includes(v as SeoTab);
