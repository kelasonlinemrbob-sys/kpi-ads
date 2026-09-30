import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { adAccounts, adCreatives, campaigns, users, type AdCreative, type Role } from "@/db/schema";
import { matchProduct } from "@/lib/ads-matching";
import { CREATIVE_FORMAT_LABEL, CREATIVE_LABEL, CREATIVE_STATUS_LABEL, formatPlayTime, objectiveLabel } from "@/lib/creatives";

/** One row of the Creative page / export, with the advertiser and product resolved like the reports do. */
export type CreativeRow = {
  id: number;
  accountName: string;
  adName: string;
  campaignName: string | null;
  adType: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  label: AdCreative["label"];
  status: AdCreative["status"];
  platformStatus: string | null;
  /** Format as the team set it, else as Meta reports it. */
  format: AdCreative["format"];
  detectedFormat: AdCreative["format"];
  formatOverridden: boolean;
  creatorId: number | null;
  editorId: number | null;
  impressions: number;
  avgPlayTime: number | null;
  thruplays: number;
  spend: number;
  clicks: number;
  leads: number;
  advertiser: { id: number; name: string } | null;
  product: string | null;
  adCreatedAt: string | null;
  syncedAt: string;
};

export type CreativeFilters = {
  advertiser?: number | null;
  product?: string | null;
  status?: AdCreative["status"] | null;
  format?: AdCreative["format"] | null;
  label?: NonNullable<AdCreative["label"]> | "none" | null;
  creator?: number | null;
  q?: string | null;
  sort?: "impressions" | "thruplays" | "newest" | "playtime";
};

export async function getCreativeRows(filters: CreativeFilters = {}): Promise<CreativeRow[]> {
  const [rows, products] = await Promise.all([
    db
      .select({ c: adCreatives, accountName: adAccounts.name })
      .from(adCreatives)
      .innerJoin(adAccounts, eq(adAccounts.id, adCreatives.adAccountId))
      .orderBy(desc(adCreatives.impressions)),
    db
      .select({
        adAccountId: campaigns.adAccountId,
        keyword: campaigns.matchKeyword,
        product: campaigns.product,
        name: campaigns.name,
        ownerId: campaigns.ownerId,
        ownerName: users.name,
      })
      .from(campaigns)
      .innerJoin(users, eq(users.id, campaigns.ownerId))
      .where(and(isNotNull(campaigns.adAccountId), isNotNull(campaigns.matchKeyword))),
  ]);
  const linked = products.filter((p) => p.keyword?.trim()).map((p) => ({ ...p, keyword: p.keyword! }));
  const q = filters.q?.trim().toLowerCase();

  const all: CreativeRow[] = rows.map(({ c, accountName }) => {
    // Same product-code matching as "Generate dari Ads": the code in the campaign name picks the product.
    const product = c.campaignName ? matchProduct(c.campaignName, linked.filter((p) => p.adAccountId === c.adAccountId)) : null;
    return {
      id: c.id,
      accountName,
      adName: c.adName,
      campaignName: c.campaignName,
      adType: objectiveLabel(c.objective),
      permalink: c.permalink,
      thumbnailUrl: c.thumbnailUrl,
      label: c.label,
      status: c.status,
      platformStatus: c.platformStatus,
      format: c.formatOverride ?? c.format,
      detectedFormat: c.format,
      formatOverridden: c.formatOverride !== null,
      creatorId: c.creatorId,
      editorId: c.editorId,
      impressions: c.impressions,
      avgPlayTime: c.avgPlayTime,
      thruplays: c.thruplays,
      spend: c.spend,
      clicks: c.clicks,
      leads: c.leads,
      advertiser: product ? { id: product.ownerId, name: product.ownerName } : null,
      product: product ? product.product?.trim() || product.name : null,
      adCreatedAt: c.adCreatedAt?.toISOString() ?? null,
      syncedAt: c.syncedAt.toISOString(),
    };
  });

  const filtered = all.filter(
    (r) =>
      (!filters.advertiser || r.advertiser?.id === filters.advertiser) &&
      (!filters.product || r.product === filters.product) &&
      (!filters.status || r.status === filters.status) &&
      (!filters.format || r.format === filters.format) &&
      (!filters.label || (filters.label === "none" ? r.label === null : r.label === filters.label)) &&
      (!filters.creator || r.creatorId === filters.creator || r.editorId === filters.creator) &&
      (!q || `${r.adName} ${r.campaignName ?? ""} ${r.permalink ?? ""} ${r.product ?? ""}`.toLowerCase().includes(q)),
  );
  const sort = filters.sort ?? "impressions";
  return filtered.sort((a, b) =>
    sort === "thruplays"
      ? b.thruplays - a.thruplays
      : sort === "playtime"
        ? (b.avgPlayTime ?? -1) - (a.avgPlayTime ?? -1)
        : sort === "newest"
          ? (b.adCreatedAt ?? "").localeCompare(a.adCreatedAt ?? "")
          : b.impressions - a.impressions,
  );
}

/** Members who can be picked as creator / editor: the creative team, plus anyone already assigned. */
export async function getCreativeTeam() {
  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role, secondaryRole: users.secondaryRole, isActive: users.isActive })
    .from(users);
  return rows
    .filter((u) => u.isActive && u.role !== "supervisor")
    .map((u) => ({ id: u.id, name: u.name, creative: u.role === ("creative" as Role) || u.secondaryRole === "creative" }))
    .sort((a, b) => Number(b.creative) - Number(a.creative) || a.name.localeCompare(b.name));
}

/** The spreadsheet the creative team keeps, one line per ad (CSV, same column order). */
export function creativesCsv(rows: CreativeRow[], people: Map<number, string>) {
  const header = [
    "ADVERTISER",
    "PRODUK",
    "LINK KONTEN",
    "TIPE IKLAN",
    "KETERANGAN",
    "STATUS",
    "FORMAT KONTEN",
    "CREATOR",
    "EDITOR",
    "IMPRESSION",
    "AVERAGE PLAY TIME",
    "THRUPLAYS",
    "SPEND",
    "LINK CLICKS",
    "LEADS",
    "NAMA IKLAN",
    "CAMPAIGN",
  ];
  const csv = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => [
    r.advertiser?.name ?? "",
    r.product ?? "",
    r.permalink ?? "",
    r.adType,
    r.label ? CREATIVE_LABEL[r.label] : "",
    CREATIVE_STATUS_LABEL[r.status],
    CREATIVE_FORMAT_LABEL[r.format],
    r.creatorId ? (people.get(r.creatorId) ?? "") : "",
    r.editorId ? (people.get(r.editorId) ?? "") : "",
    r.impressions,
    r.format === "video" ? formatPlayTime(r.avgPlayTime) : "",
    r.format === "video" ? r.thruplays : "",
    Math.round(r.spend),
    r.clicks,
    r.leads,
    r.adName,
    r.campaignName ?? "",
  ]);
  return "﻿" + [header, ...lines].map((line) => line.map(csv).join(",")).join("\n");
}

const STATUSES = ["active", "paused", "review", "takedown"] as const;
const FORMATS = ["video", "grafis", "carousel", "lainnya"] as const;
const LABELS = ["winning", "good", "average", "poor", "none"] as const;
const SORTS = ["impressions", "thruplays", "newest", "playtime"] as const;
const pick = <T extends string>(list: readonly T[], value: string | undefined) => (list.find((v) => v === value) ?? null) as T | null;

/** Filters from the page's search params (also used by the CSV export, so both show the same rows). */
export function parseCreativeFilters(sp: Record<string, string | undefined>, me: { id: number }): CreativeFilters {
  const id = (v: string | undefined) => (v === "me" ? me.id : v && /^\d+$/.test(v) ? Number(v) : null);
  return {
    advertiser: id(sp.advertiser),
    product: sp.product || null,
    status: pick(STATUSES, sp.status),
    format: pick(FORMATS, sp.format),
    label: pick(LABELS, sp.label),
    creator: id(sp.creator),
    q: sp.q || null,
    sort: pick(SORTS, sp.sort) ?? "impressions",
  };
}
