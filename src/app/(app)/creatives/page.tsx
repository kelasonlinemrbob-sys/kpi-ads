import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, max } from "drizzle-orm";
import { ClapperboardIcon, DownloadIcon, EyeIcon, PlayIcon, SearchIcon, TrophyIcon, type LucideIcon } from "lucide-react";
import { db } from "@/db";
import { adAccounts, adCreatives } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { CREATIVE_FORMAT_LABEL, CREATIVE_LABEL, CREATIVE_STATUS_LABEL, formatPlayTime } from "@/lib/creatives";
import { getCreativeRows, getCreativeTeam, parseCreativeFilters } from "@/lib/creatives-data";
import { can } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/panel";
import { UrlSelect } from "@/components/dashboard/url-select";
import { CreativesTable, SyncCreativesButton } from "./creatives-table";

export const metadata: Metadata = { title: "Creative" };

const num = new Intl.NumberFormat("id-ID");
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

export default async function CreativesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (!can.viewCreatives(user.role)) redirect("/dashboard");
  const sp = await searchParams;
  const filters = parseCreativeFilters(sp, user);

  const [rows, allRows, team, metaAccounts, [lastSync]] = await Promise.all([
    getCreativeRows(filters),
    getCreativeRows(),
    getCreativeTeam(),
    db.select({ id: adAccounts.id }).from(adAccounts).where(eq(adAccounts.platform, "meta")),
    db.select({ at: max(adCreatives.syncedAt) }).from(adCreatives),
  ]);

  // Filter options come from everything synced, so a filter never hides its own choices.
  const advertisers = [...new Map(allRows.filter((r) => r.advertiser).map((r) => [r.advertiser!.id, r.advertiser!.name])).entries()];
  const products = [...new Set(allRows.map((r) => r.product).filter((p): p is string => !!p))].sort();
  const videos = rows.filter((r) => r.format === "video" && r.avgPlayTime !== null && r.impressions > 0);
  const avgPlay = videos.length ? videos.reduce((sum, r) => sum + r.avgPlayTime! * r.impressions, 0) / videos.reduce((s, r) => s + r.impressions, 0) : null;
  const exportHref = `/api/creatives/export?${new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][])}`;
  const isCreative = user.role === "creative" || user.secondaryRole === "creative";

  return (
    <>
      <PageHeader
        title="Creative"
        description={`Konten iklan Meta Ads beserta performanya, untuk tim creative dan advertiser.${
          lastSync?.at ? ` Terakhir sinkron ${lastSync.at.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}.` : ""
        }`}
        actions={
          <>
            <Button asChild variant="outline" className="h-8">
              <a href={exportHref}>
                <DownloadIcon /> Export CSV
              </a>
            </Button>
            <SyncCreativesButton disabled={metaAccounts.length === 0} />
          </>
        }
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="Konten" icon={ClapperboardIcon} value={num.format(rows.length)} hint={`${rows.filter((r) => r.status === "active").length} aktif`} />
        <Stat title="Winning" icon={TrophyIcon} value={num.format(rows.filter((r) => r.label === "winning").length)} hint="ditandai tim" />
        <Stat title="Impression" icon={EyeIcon} value={compact.format(rows.reduce((s, r) => s + r.impressions, 0))} hint="lifetime" />
        <Stat
          title="Avg play time video"
          icon={PlayIcon}
          value={avgPlay === null ? "–" : `${formatPlayTime(avgPlay)} dtk`}
          hint={`${num.format(rows.reduce((s, r) => s + r.thruplays, 0))} ThruPlays`}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form className="relative" action="/creatives">
          {Object.entries(sp)
            .filter(([k, v]) => k !== "q" && v)
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={sp.q ?? ""} placeholder="Cari iklan, campaign, link…" className="h-8 w-60 pl-8" />
        </form>
        <UrlSelect
          param="advertiser"
          label="Advertiser"
          value={sp.advertiser ?? "all"}
          options={[
            { value: "all", label: "Semua advertiser" },
            ...(user.role === "advertiser" ? [{ value: "me", label: "Produk saya" }] : []),
            ...advertisers.map(([id, name]) => ({ value: String(id), label: name })),
          ]}
        />
        <UrlSelect
          param="product"
          label="Produk"
          value={sp.product ?? "all"}
          options={[{ value: "all", label: "Semua produk" }, ...products.map((p) => ({ value: p, label: p }))]}
        />
        <UrlSelect
          param="status"
          label="Status"
          value={sp.status ?? "all"}
          options={[{ value: "all", label: "Semua status" }, ...Object.entries(CREATIVE_STATUS_LABEL).map(([value, label]) => ({ value, label }))]}
        />
        <UrlSelect
          param="format"
          label="Format"
          value={sp.format ?? "all"}
          options={[{ value: "all", label: "Semua format" }, ...Object.entries(CREATIVE_FORMAT_LABEL).map(([value, label]) => ({ value, label }))]}
        />
        <UrlSelect
          param="label"
          label="Keterangan"
          value={sp.label ?? "all"}
          options={[
            { value: "all", label: "Semua keterangan" },
            ...Object.entries(CREATIVE_LABEL).map(([value, label]) => ({ value, label })),
            { value: "none", label: "Belum dinilai" },
          ]}
        />
        <UrlSelect
          param="creator"
          label="Creator / editor"
          value={sp.creator ?? "all"}
          options={[
            { value: "all", label: "Semua creator" },
            ...(isCreative ? [{ value: "me", label: "Konten saya" }] : []),
            ...team.filter((p) => p.creative).map((p) => ({ value: String(p.id), label: p.name })),
          ]}
        />
        <UrlSelect
          param="sort"
          label="Urutkan"
          value={sp.sort ?? "impressions"}
          options={[
            { value: "impressions", label: "Impression terbanyak" },
            { value: "thruplays", label: "ThruPlays terbanyak" },
            { value: "playtime", label: "Play time terlama" },
            { value: "newest", label: "Iklan terbaru" },
          ]}
        />
        {Object.values(sp).some(Boolean) && (
          <Link href="/creatives" className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Reset
          </Link>
        )}
      </div>

      <Panel title={`${num.format(rows.length)} iklan`} icon={ClapperboardIcon} iconPosition="left" bodyClassName="p-0">
        {allRows.length === 0 ? (
          <EmptyState
            icon={ClapperboardIcon}
            title="Belum ada konten iklan"
            description={
              metaAccounts.length === 0
                ? "Tambahkan akun Meta di Campaigns → Akun iklan dan isi token di Pengaturan → Integrasi, lalu sinkron."
                : "Klik Sinkron dari Meta untuk mengambil semua iklan beserta link konten, format dan performanya."
            }
            action={metaAccounts.length > 0 ? <SyncCreativesButton /> : undefined}
          />
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Tidak ada iklan yang cocok dengan filter.</p>
        ) : (
          <CreativesTable rows={rows} people={team} />
        )}
      </Panel>
      <p className="mt-2 text-xs text-muted-foreground">
        Link konten, tipe iklan, status, format, impression, avg play time dan ThruPlays diambil dari Meta (lifetime). Keterangan, creator,
        editor dan format yang diubah manual disimpan tim dan tidak tertimpa saat sinkron. Advertiser & produk dicocokkan dari kode product
        di nama campaign.
      </p>
    </>
  );
}

function Stat({ title, icon, value, hint }: { title: string; icon: LucideIcon; value: string; hint: string }) {
  return (
    <Panel title={title} icon={icon}>
      <div className="flex items-baseline gap-2 px-4 py-3">
        <span className="text-2xl font-medium">{value}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
    </Panel>
  );
}
