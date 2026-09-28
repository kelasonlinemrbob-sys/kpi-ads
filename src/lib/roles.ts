import type { Role } from "@/db/schema";

export const ROLES: Role[] = ["supervisor", "advertiser", "webmaster", "seo"];

export const ROLE_LABEL: Record<Role, string> = {
  supervisor: "Supervisor",
  advertiser: "Advertiser",
  webmaster: "Web Master",
  seo: "SEO Specialist",
};

/** Roles whose members submit daily KPI reports. */
export const MEMBER_ROLES: Exclude<Role, "supervisor">[] = ["advertiser", "webmaster", "seo"];

export const ROLE_BADGE: Record<Role, string> = {
  supervisor: "bg-primary/10 text-foreground border-primary/15",
  advertiser: "bg-info/10 text-info border-info/20",
  webmaster: "bg-[oklch(0.6_0.17_300)]/10 text-[oklch(0.5_0.17_300)] border-[oklch(0.6_0.17_300)]/20 dark:text-[oklch(0.75_0.13_300)]",
  seo: "bg-success/10 text-success border-success/20",
};

export const can = {
  manageTeam: (r: Role) => r === "supervisor",
  manageTargets: (r: Role) => r === "supervisor",
  reviewReports: (r: Role) => r === "supervisor",
  submitReports: (r: Role) => r !== "supervisor",
  viewCampaigns: (r: Role) => r === "supervisor" || r === "advertiser" || r === "webmaster",
  editCampaigns: (r: Role) => r === "supervisor" || r === "advertiser",
  viewAllMembers: (r: Role) => r === "supervisor",
};
