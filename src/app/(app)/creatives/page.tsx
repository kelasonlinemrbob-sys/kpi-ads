import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ClapperboardIcon, DownloadIcon, LayoutGridIcon, PieChartIcon, SearchIcon, TableIcon, type LucideIcon } from "lucide-react";
import { db } from "@/db";
import { adAccounts, creativeSyncs } from "@/db/schema";
import { creativePeriod, CREATIVE_PERIODS } from "@/lib/creative-period";
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
  const period = creativePeriod(filters.period);

  const [rows, allRows, team, metaAccounts, syncs] = await Promise.all([
    getCreativeRows(filters),
    getCreativeRows({ period: period.key }),
    getCreativeTeam(),
    db.select({ id: adAccounts.id, name: adAccounts.name }).from(adAccounts).where(eq(adAccounts.platform, "meta")),
    db.select().from(creativeSyncs).where(and(eq(creativeSyncs.periodStart, period.start), eq(creativeSyncs.periodEnd, period.end))),
  ]);
  const lastSync = syncs.map((s) => s.syncedAt).sort((a, b) => b.getTime() - a.getTime())[0];
  const missingAccounts = metaAccounts.filter((a) => !syncs.some((s) => s.adAccountId === a.id));
  const posts = groupByPost(rows, filters.sort);

  // Filter options come from everything synced, so a filter never hides its own choices.
  const advertisers = [...new Map(allRows.filter((r) => r.advertiser).map((r) => [r.advertiser!.id, r.advertiser!.name])).entries()];
  const products = [...new Set(allRows.map((r) => r.product).filter((p): p is string => !!p))].sort();
  const isCreative = user.role === "creative" || user.secondaryRole === "creative";
  const query = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    params.set("period", period.key);
    params.delete("created");
    for (const [k, v] of Object.entries(patch)) (v === null ? params.delete(k) : params.set(k, v));
    return params.toString();
  };
  const exportHref = `/api/creatives/export?${query({ view: null, rank: null })}`;
  const activeFilters = ["advertiser", "product", "status", "format", "label", "creator", "q"].filter((k) => sp[k]).length;
  const totals = sumCreatives(rows);
  const rates = creativeRates(totals);

  return (
    <>
      <PageHeader
        title="Creative"
        description={`Laporan konten iklan Meta Ads untuk tim creative dan advertiser.${
          lastSync ? ` Data per ${lastSync.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}.` : ""
        }`}
        actions={
          <>
            <Button asChild variant="outline" className="h-8">
              <a href={exportHref}>
                <DownloadIcon /> Export CSV
              </a>
            </Button>
            <SyncCreativesButton period={period.key} disabled={metaAccounts.length === 0} />
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
            .filter(([k, v]) => k !== "q" && k !== "created" && v)
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={sp.q ?? ""} placeholder="Cari iklan, campaign, link…" className="h-8 w-56 pl-8" />
        </form>
        <UrlSelect param="period" label="Periode performa Creative" value={period.key} options={[...CREATIVE_PERIODS]} />
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

      <div className="mb-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
        <p><span className="font-medium">{period.label}: {period.start} – {period.end}</span> · Termasuk hari ini · Zona waktu akun iklan.</p>
        <p className="text-xs text-muted-foreground">Hanya iklan dengan data performa pada periode ini yang diambil, termasuk iklan lama yang masih tayang. Setelah mengganti periode, klik Sinkron dari Meta bila datanya belum tersedia.</p>
        {missingAccounts.length > 0 && <p className="mt-1 text-xs text-warning" role="status">{missingAccounts.length} akun belum disinkron untuk periode ini: {missingAccounts.map((a) => a.name).join(", ")}. Angka yang tampil hanya mencakup akun yang sudah disinkron.</p>}
      </div>

      {allRows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={ClapperboardIcon}
            title={syncs.length && !missingAccounts.length ? "Tidak ada aktivitas iklan pada periode ini" : "Data periode ini belum tersedia"}
            description={
              metaAccounts.length === 0
                ? "Tambahkan akun Meta di Campaigns → Akun iklan dan isi token di Pengaturan → Integrasi, lalu sinkron."
                : syncs.length && !missingAccounts.length ? "Meta tidak mengembalikan data iklan untuk periode ini. Pilih periode lain bila diperlukan."
                : `Klik Sinkron dari Meta untuk mengambil konten dan performa ${period.label.toLowerCase()}.`
            }
            action={metaAccounts.length > 0 ? <SyncCreativesButton period={period.key} /> : undefined}
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
        Angka dari Meta sesuai periode {period.start}–{period.end}, bukan lifetime. Keterangan, creator, editor dan format yang diubah manual disimpan tim dan tidak tertimpa saat sinkron.
        Iklan yang memakai post yang sama digabung menjadi satu konten di Ringkasan dan Galeri. Jumlah reach antar-iklan dapat menghitung orang yang sama lebih dari sekali.
      </p>
    </>
  );
}
