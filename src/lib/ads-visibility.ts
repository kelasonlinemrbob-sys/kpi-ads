/**
 * Who sees which ads data on Campaigns and Creative. An advertiser sees only their own work: campaigns and
 * ad contents mapped to a product they own (in any ad account), plus the unmapped ones in ad accounts they
 * picked, so they can map them. A Creative linked to advertisers ("Creative Ryant") sees exactly what those
 * advertisers see. Supervisors, web masters and unlinked creatives see the whole team (scope null).
 */
export type AdsScope = {
  /** The advertisers whose work is visible: the advertiser themself, or the ones a Creative works for. */
  ownerIds: ReadonlySet<number>;
  /** Ad accounts those advertisers picked. */
  ownAccountIds: ReadonlySet<number>;
  /** Their accounts plus accounts holding their products: where their data can come from. */
  accountIds: ReadonlySet<number>;
} | null;

/** `ownerId` is the owner of the product the item maps to, or null when it isn't mapped. */
export function visibleTo(scope: AdsScope, item: { adAccountId: number; ownerId: number | null }) {
  if (!scope) return true;
  return item.ownerId !== null ? scope.ownerIds.has(item.ownerId) : scope.ownAccountIds.has(item.adAccountId);
}
