import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, max } from "drizzle-orm";
import { ClapperboardIcon, DownloadIcon, LayoutGridIcon, PieChartIcon, SearchIcon, TableIcon, type LucideIcon } from "lucide-react";
import { db } from "@/db";
import { adAccounts, adCreatives } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { CREATIVE_FORMAT_LABEL, CREATIVE_LABEL, CREATIVE_STATUS_LABEL, creativeRates, fmt, sumCreatives } from "@/lib/creatives";
import { getCreativeRows, getCreativeTeam, groupByPost, parseCreativeFilters } from "@/lib/creatives-data";
import { can } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/panel";
import { UrlSelect } from "@/components/dashboard/url-select";
import { CreativeGallery } from "./creative-gallery";
import { CreativeReport } from "./creative-report";
import { CreativesTable, SyncCreativesButton } from "./creatives-table";

export const metadata: Metadata = { title: "Creative" };

const VIEWS: { key: "ringkasan" | "galeri" | "tabel"; label: string; icon: LucideIcon }[] = [
  { key: "ringkasan", label: "Ringkasan", icon: PieChartIcon },
  { key: "galeri", label: "Galeri konten", icon: LayoutGridIcon },
  { key: "tabel", label: "Tabel iklan", icon: TableIcon },
];
const RANKS = ["impressions", "ctr", "hook", "cpl"] as const;

export default async function CreativesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (!can.viewCreatives(user.role)) redirect("/dashboard");
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === sp.view)?.key ?? "ringkasan";
  const rank = RANKS.find((r) => r === sp.rank) ?? "impressions";
  const filters = parseCreativeFilters(sp, user);

  const [rows, allRows, team, metaAccounts, [lastSync]] = await Promise.all([
    getCreativeRows(filters),
    getCreativeRows(),
    getCreativeTeam(),
    db.select({ id: adAccounts.id }).from(adAccounts).where(eq(adAccounts.platform, "meta")),
    db.select({ at: max(adCreatives.syncedAt) }).from(adCreatives),
  ]);
  const posts = groupByPost(rows, filters.sort);

  // Filter options come from everything synced, so a filter never hides its own choices.
  const advertisers = [...new Map(allRows.filter((r) => r.advertiser).map((r) => [r.advertiser!.id, r.advertiser!.name])).entries()];
  const products = [...new Set(allRows.map((r) => r.product).filter((p): p is string => !!p))].sort();
  const isCreative = user.role === "creative" || user.secondaryRole === "creative";
  const query = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    for (const [k, v] of Object.entries(patch)) (v === null ? params.delete(k) : params.set(k, v));
    return params.toString();
  };
  const exportHref = `/api/creatives/export?${query({ view: null, rank: null })}`;
  const activeFilters = ["advertiser", "product", "status", "format", "label", "creator", "q", "created"].filter((k) => sp[k]).length;
  const totals = sumCreatives(rows);
  const rates = creativeRates(totals);

  return (
    <>
      <PageHeader
        title="Creative"
        description={`Laporan konten iklan Meta Ads untuk tim creative dan advertiser.${
          lastSync?.at ? ` Data per ${lastSync.at.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}.` : ""
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

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <nav className="inline-flex rounded-lg bg-muted p-1" aria-label="Tampilan">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={`/creatives?${query({ view: v.key === "ringkasan" ? null : v.key })}`}
              aria-current={view === v.key ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors",
                view === v.key ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <v.icon className="size-3.5" /> {v.label}
            </Link>
          ))}
        </nav>
        {view !== "ringkasan" && rows.length > 0 && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{fmt.num(posts.length)}</span> konten ·{" "}
            <span className="font-medium text-foreground">{fmt.num(rows.length)}</span> iklan · impr{" "}
            <span className="font-medium text-foreground">{fmt.compact(totals.impressions)}</span> · CTR{" "}
            <span className="font-medium text-foreground">{fmt.pct(rates.ctr)}</span> · CPL{" "}
            <span className="font-medium text-foreground">{fmt.rp(rates.cpl)}</span>
          </p>
        )}
      </div>

      {/* One filter row for every view: the report, the gallery and the table show the same slice. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form className="relative" action="/creatives">
          {Object.entries(sp)
            .filter(([k, v]) => k !== "q" && v)
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={sp.q ?? ""} placeholder="Cari iklan, campaign, link…" className="h-8 w-56 pl-8" />
        </form>
        <UrlSelect
          param="created"
          label="Iklan dibuat"
          value={sp.created ?? "all"}
          options={[
            { value: "all", label: "Semua waktu" },
            { value: "7d", label: "Dibuat 7 hari terakhir" },
            { value: "30d", label: "Dibuat 30 hari terakhir" },
            { value: "90d", label: "Dibuat 90 hari terakhir" },
            { value: "month", label: "Dibuat bulan ini" },
          ]}
        />
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
          param="format"
          label="Format"
          value={sp.format ?? "all"}
          options={[{ value: "all", label: "Semua format" }, ...Object.entries(CREATIVE_FORMAT_LABEL).map(([value, label]) => ({ value, label }))]}
        />
        <UrlSelect
          param="status"
          label="Status"
          value={sp.status ?? "all"}
          options={[{ value: "all", label: "Semua status" }, ...Object.entries(CREATIVE_STATUS_LABEL).map(([value, label]) => ({ value, label }))]}
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
        {view === "ringkasan" ? (
          <UrlSelect
            param="rank"
            label="Konten terbaik berdasarkan"
            value={rank}
            options={[
              { value: "impressions", label: "Terbaik: impression" },
              { value: "ctr", label: "Terbaik: CTR" },
              { value: "hook", label: "Terbaik: hook rate" },
              { value: "cpl", label: "Terbaik: CPL termurah" },
            ]}
          />
        ) : (
          <UrlSelect
            param="sort"
            label="Urutkan"
            value={sp.sort ?? "impressions"}
            options={[
              { value: "impressions", label: "Impression terbanyak" },
              { value: "spend", label: "Spend terbesar" },
              { value: "ctr", label: "CTR tertinggi" },
              { value: "hook", label: "Hook rate tertinggi" },
              { value: "cpl", label: "CPL termurah" },
              { value: "thruplays", label: "ThruPlays terbanyak" },
              { value: "playtime", label: "Play time terlama" },
              { value: "newest", label: "Iklan terbaru" },
            ]}
          />
        )}
        {activeFilters > 0 && (
          <Link href={`/creatives?${query({ advertiser: null, product: null, status: null, format: null, label: null, creator: null, q: null, created: null })}`} className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Reset filter ({activeFilters})
          </Link>
        )}
      </div>

      {allRows.length === 0 ? (
        <Panel>
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
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Tidak ada iklan yang cocok dengan filter.</p>
        </Panel>
      ) : view === "ringkasan" ? (
        <CreativeReport rows={rows} posts={posts} people={team} rank={rank} />
      ) : view === "galeri" ? (
        <CreativeGallery posts={posts} people={team} />
      ) : (
        <Panel title={`${fmt.num(rows.length)} iklan`} icon={TableIcon} iconPosition="left" bodyClassName="p-0">
          <CreativesTable rows={rows} people={team} />
        </Panel>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Angka lifetime dari Meta. Keterangan, creator, editor dan format yang diubah manual disimpan tim dan tidak tertimpa saat sinkron.
        Iklan yang memakai post yang sama digabung menjadi satu konten di Ringkasan dan Galeri.
      </p>
    </>
  );
}
