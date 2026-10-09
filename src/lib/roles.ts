import type { AdvertiserLevel, Role } from "@/db/schema";

export const ROLES: Role[] = ["supervisor", "advertiser", "webmaster", "seo", "creative", "cso"];

export const ROLE_LABEL: Record<Role, string> = {
  supervisor: "Supervisor",
  advertiser: "Advertiser",
  webmaster: "Web Master",
  seo: "SEO Specialist",
  creative: "Creative",
  cso: "CSO",
};

export const ADVERTISER_LEVEL_LABEL: Record<AdvertiserLevel, string> = { junior: "Junior", senior: "Senior" };

/** "Advertiser Senior" / "Advertiser Junior" for advertisers, the plain role label otherwise. */
export function roleLabel(role: Role, level?: AdvertiserLevel | null) {
  return role === "advertiser" ? `${ROLE_LABEL.advertiser} ${ADVERTISER_LEVEL_LABEL[level ?? "junior"]}` : ROLE_LABEL[role];
}

/** "Advertiser Junior 60% + SEO Specialist 40%" for a dual-role member, roleLabel() otherwise. */
export function rolesLabel(m: { role: Role; advertiserLevel?: AdvertiserLevel | null; secondaryRole?: Role | null; secondaryShare?: number | null }) {
  const main = roleLabel(m.role, m.advertiserLevel);
  if (!m.secondaryRole || m.secondaryRole === m.role || m.role === "supervisor") return main;
  const second = m.secondaryShare ?? 40;
  return `${main} ${100 - second}% + ${ROLE_LABEL[m.secondaryRole]} ${second}%`;
}

export const isSeniorAdvertiser = (user: { role: Role; advertiserLevel?: AdvertiserLevel | null }) =>
  user.role === "advertiser" && user.advertiserLevel === "senior";

/**
 * Roles limited to one area of the app (plus Pengaturan): CSO works only in Leads, Creative only in the
 * Creative page. Every other page sends them back to this home.
 */
export const RESTRICTED_HOME: Partial<Record<Role, string>> = { cso: "/leads", creative: "/creatives" };
/** Where a role lands after signing in and when a page isn't theirs. */
export const homePath = (role: Role) => RESTRICTED_HOME[role] ?? "/dashboard";

/**
 * Performa SEO, Search Console websites, Keyword Planner and the SEO AI analysis: supervisors, SEO
 * specialists and web masters, including members holding SEO or Web Master as their second role
 * (e.g. Advertiser + SEO Specialist).
 */
export function canViewSeo(m: { role: Role; secondaryRole?: Role | null }) {
  if (can.viewSearchConsole(m.role)) return true;
  return !RESTRICTED_HOME[m.role] && (m.secondaryRole === "seo" || m.secondaryRole === "webmaster");
}

/** Roles whose members submit daily KPI reports. */
export const MEMBER_ROLES: Exclude<Role, "supervisor">[] = ["advertiser", "webmaster", "seo"];

export const ROLE_BADGE: Record<Role, string> = {
  supervisor: "bg-primary/10 text-foreground border-primary/15",
  advertiser: "bg-info/10 text-info border-info/20",
  webmaster: "bg-[oklch(0.6_0.17_300)]/10 text-[oklch(0.5_0.17_300)] border-[oklch(0.6_0.17_300)]/20 dark:text-[oklch(0.75_0.13_300)]",
  seo: "bg-success/10 text-success border-success/20",
  cso: "bg-info/10 text-info border-info/20",
  creative: "bg-warning/10 text-[color-mix(in_oklch,var(--warning),black_25%)] border-warning/25 dark:text-warning",
};

export const can = {
  viewSearchConsole: (r: Role) => r === "supervisor" || r === "seo" || r === "webmaster",
  manageTeam: (r: Role) => r === "supervisor",
  manageTargets: (r: Role) => r === "supervisor",
  reviewReports: (r: Role) => r === "supervisor",
  submitReports: (r: Role) => !RESTRICTED_HOME[r] && ROLES.includes(r),
  runAds: (r: Role) => r === "supervisor" || r === "advertiser",
  viewCampaigns: (r: Role) => r === "supervisor" || r === "advertiser" || r === "webmaster",
  editCampaigns: (r: Role) => r === "supervisor" || r === "advertiser",
  /** Meta / Google Ads credentials are shared by the team and managed by supervisors. */
  manageAdsConnection: (r: Role) => r === "supervisor",
  /** Run Analisa AI / Analisa creative with the team's Kie.ai key (managed by supervisors). */
  runAiAnalysis: (r: Role) => r === "supervisor" || r === "advertiser" || r === "creative",
  viewAllMembers: (r: Role) => r === "supervisor",
  /** Creative page: ad contents pulled from Meta with their performance. */
  viewCreatives: (r: Role) => r === "supervisor" || r === "advertiser" || r === "creative",
  /** Fill in and finalise performance appraisals (senior advertisers only). */
  manageAppraisals: (r: Role) => r === "supervisor",
};
