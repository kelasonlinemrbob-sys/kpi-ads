import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { adAccounts, campaigns, creativeAdvertisers, users, type Role } from "@/db/schema";
import type { AdsScope } from "./ads-visibility";

export { visibleTo, type AdsScope } from "./ads-visibility";

/** The advertisers a Creative member works for (empty = the whole team). */
export async function linkedAdvertiserIds(creativeId: number) {
  const rows = await db.select({ id: creativeAdvertisers.advertiserId }).from(creativeAdvertisers).where(eq(creativeAdvertisers.creativeId, creativeId));
  return rows.map((r) => r.id);
}

/** "Creative Ryant, Khabib", or "Creative semua advertiser" for an unlinked Creative. */
export async function creativeLabel(creativeId: number) {
  const rows = await db.select({ name: users.name }).from(creativeAdvertisers).innerJoin(users, eq(users.id, creativeAdvertisers.advertiserId))
    .where(eq(creativeAdvertisers.creativeId, creativeId)).orderBy(users.name);
  return rows.length ? `Creative ${rows.map((r) => r.name).join(", ")}` : "Creative semua advertiser";
}

/**
 * The ads data scope of a user: an advertiser's own work, the work of the advertisers a Creative is linked
 * to, or null (whole team) for everyone else.
 */
export async function adsScopeFor(user: { id: number; role: Role }): Promise<AdsScope> {
  const ownerIds = user.role === "advertiser" ? [user.id] : user.role === "creative" ? await linkedAdvertiserIds(user.id) : [];
  if (!ownerIds.length) return null;
  const [own, productAccounts] = await Promise.all([
    db.select({ id: adAccounts.id }).from(adAccounts).where(inArray(adAccounts.createdById, ownerIds)),
    db.select({ id: campaigns.adAccountId }).from(campaigns).where(and(inArray(campaigns.ownerId, ownerIds), isNotNull(campaigns.adAccountId))),
  ]);
  const ownAccountIds = new Set(own.map((a) => a.id));
  return { ownerIds: new Set(ownerIds), ownAccountIds, accountIds: new Set([...ownAccountIds, ...productAccounts.map((a) => a.id!)]) };
}
