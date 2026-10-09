import type { Role } from "@/db/schema";

/**
 * Who may pick an ad account of the team connection: anyone when it isn't registered or has no owner;
 * an advertiser may also take over one a supervisor registered. Another advertiser's account stays theirs.
 */
export function canClaimAdAccount(owner: { id: number; role: Role | null } | null, user: { id: number; role: Role }) {
  if (!owner) return true;
  if (owner.id === user.id) return false;
  return owner.role === "supervisor" && user.role !== "supervisor";
}
