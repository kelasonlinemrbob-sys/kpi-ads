import type { Role } from "@/db/schema";

/**
 * A member can hold a second role next to their main one (e.g. Advertiser + SEO Specialist).
 * Each role carries a share of the combined KPI score; the main role gets what the second doesn't.
 */

export type RoleHolder = { role: Role; secondaryRole?: Role | null; secondaryShare?: number | null };
export type RoleSlot = { role: Role; share: number };

export const DEFAULT_SECONDARY_SHARE = 40;

const clampShare = (share: number) => Math.min(90, Math.max(10, Math.round(share)));

/** Roles without a KPI tracker: CSO works in Leads, Creative in the Creative page; neither reports or is scored. */
export const UNTRACKED_ROLES: readonly Role[] = ["cso", "creative"];
export const isTracked = (m: Pick<RoleHolder, "role">) => !UNTRACKED_ROLES.includes(m.role);

export function hasSecondRole(m: RoleHolder): m is RoleHolder & { secondaryRole: Role } {
  return !!m.secondaryRole && m.secondaryRole !== m.role && m.role !== "supervisor" && m.secondaryRole !== "supervisor"
    && isTracked(m) && !UNTRACKED_ROLES.includes(m.secondaryRole);
}

/** Operational KPI/report roles, separate from the account role used for authorization.
 * Supervisors run their own ads with the full advertiser targets. */
export function roleSlots(m: RoleHolder): RoleSlot[] {
  if (!isTracked(m)) return [];
  if (m.role === "supervisor") return [{ role: "advertiser", share: 100 }];
  if (!hasSecondRole(m)) return [{ role: m.role, share: 100 }];
  const second = clampShare(m.secondaryShare ?? DEFAULT_SECONDARY_SHARE);
  return [
    { role: m.role, share: 100 - second },
    { role: m.secondaryRole, share: second },
  ];
}

export const memberRoles = (m: RoleHolder) => roleSlots(m).map((s) => s.role);
export const hasRole = (m: RoleHolder, role: Role) => memberRoles(m).includes(role);

/** Advertiser reports are recorded as-is; any other role's report goes through supervisor review. */
export const needsReview = (m: RoleHolder) => memberRoles(m).some((r) => r !== "advertiser" && r !== "supervisor");

/** Advertisers report Monday–Friday; everyone else (including a dual-role advertiser) Monday–Saturday. */
export const reportsMondayToFriday = (m: RoleHolder) => memberRoles(m).every((r) => r === "advertiser");

/** Weighted average of the per-role scores that exist, by their shares. */
export function combineScores(parts: { share: number; score: number | null }[]) {
  const scored = parts.filter((p): p is { share: number; score: number } => p.score !== null);
  const weight = scored.reduce((sum, p) => sum + p.share, 0);
  return weight ? scored.reduce((sum, p) => sum + p.score * p.share, 0) / weight : null;
}
