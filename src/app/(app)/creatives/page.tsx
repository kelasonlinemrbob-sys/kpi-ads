import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import {
  CalendarDaysIcon,
  ChevronDownIcon,
  ClapperboardIcon,
  DownloadIcon,
  SlidersHorizontalIcon,
  XIcon,
  LayoutGridIcon,
  PieChartIcon,
  SearchIcon,
  TableIcon,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/db";
import { adAccounts, creativeSyncs } from "@/db/schema";
import { creativePeriod, CREATIVE_PERIODS } from "@/lib/creative-period";
import { requireUser } from "@/lib/auth";
import {
  CREATIVE_FORMAT_LABEL,
  CREATIVE_LABEL,
  CREATIVE_STATUS_LABEL,
  creativeRates,
  fmt,
  sumCreatives,
} from "@/lib/creatives";
import {
  getCreativeRows,
  getCreativeTeam,
  groupByPost,
  parseCreativeFilters,
} from "@/lib/creatives-data";
import { analysedContentKeys, creativeFilterKey, getLatestCreativeAnalysis } from "@/lib/ai-analysis-data";
import { modelLabel } from "@/lib/ai-models";
import { ANALYSIS_IMAGES_ENABLED, CONTENT_MODEL, SUMMARY_MODEL } from "@/lib/ai-provider";
import { getKieApiKey } from "@/lib/kie-connection";
import { creativeLabel, adsScopeFor } from "@/lib/ads-scope";
import { can } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/panel";
import { UrlSelect } from "@/components/dashboard/url-select";
import { AiAnalysisPanel } from "./ai-analysis-panel";
import { CreativeGallery } from "./creative-gallery";
import { CreativeReport } from "./creative-report";
import { CreativesTable, SyncCreativesButton } from "./creatives-table";

export const metadata: Metadata = { title: "Creative" };

const VIEWS: {
  key: "ringkasan" | "galeri" | "tabel";
  label: string;
  icon: LucideIcon;
}[] = [
  { key: "ringkasan", label: "Ringkasan", icon: PieChartIcon },
  { key: "galeri", label: "Galeri konten", icon: LayoutGridIcon },
  { key: "tabel", label: "Tabel iklan", icon: TableIcon },
];
const RANKS = ["impressions", "ctr", "hook", "cpl"] as const;

export default async function CreativesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser(true);
  if (!can.viewCreatives(user.role)) redirect("/dashboard");
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === sp.view)?.key ?? "ringkasan";
  const rank = RANKS.find((r) => r === sp.rank) ?? "impressions";
  // Advertisers see only their own contents; supervisors and creatives see the whole team.
  const scope = await adsScopeFor(user);
  const filters = { ...parseCreativeFilters(sp, user), scope };
  const period = creativePeriod(filters.period);
  const canRunAi = can.runAiAnalysis(user.role);
  const aiEnabled = canRunAi && view === "ringkasan";
  const aiFilterKey = creativeFilterKey(filters);

  const [rows, allRows, team, metaAccounts, syncs, kieKey, latestAnalysis] = await Promise.all([
    getCreativeRows(filters),
    getCreativeRows({ period: period.key, scope }),
    getCreativeTeam(),
    db
      .select({ id: adAccounts.id, name: adAccounts.name })
      .from(adAccounts)
      .where(and(eq(adAccounts.platform, "meta"), scope ? inArray(adAccounts.id, [...scope.accountIds, 0]) : undefined)),
    db
      .select()
      .from(creativeSyncs)
      .where(
        and(
          eq(creativeSyncs.periodStart, period.start),
          eq(creativeSyncs.periodEnd, period.end),
        ),
      ),
    canRunAi ? getKieApiKey() : null,
    aiEnabled ? getLatestCreativeAnalysis(user.id, aiFilterKey) : null,
  ]);
  const lastSync = syncs
    .map((s) => s.syncedAt)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const missingAccounts = metaAccounts.filter(
    (a) => !syncs.some((s) => s.adAccountId === a.id),
  );
  const posts = groupByPost(rows, filters.sort);
  const analysedKeys = view === "galeri" ? [...(await analysedContentKeys(posts.map((p) => p.key)))] : [];

  // Filter options come from everything synced, so a filter never hides its own choices.
  const advertisers = [
    ...new Map(
      allRows
        .filter((r) => r.advertiser)
        .map((r) => [r.advertiser!.id, r.advertiser!.name]),
    ).entries(),
  ];
  const products = [
    ...new Set(allRows.map((r) => r.product).filter((p): p is string => !!p)),
  ].sort();
  const isCreative =
    user.role === "creative" || user.secondaryRole === "creative";
  const query = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(
      Object.entries(sp).filter(([, v]) => v) as [string, string][],
    );
    params.set("period", period.key);
    params.delete("created");
    for (const [k, v] of Object.entries(patch))
      v === null ? params.delete(k) : params.set(k, v);
    return params.toString();
  };
  const exportHref = `/api/creatives/export?${query({ view: null, rank: null })}`;
  const filterLabels: Record<string, string> = {
    advertiser: "Advertiser",
    product: "Produk",
    status: "Status",
    format: "Format",
    label: "Keterangan",
    creator: "Creator",
    q: "Pencarian",
  };
  const activeKeys = Object.keys(filterLabels).filter(
    (key) => sp[key] && sp[key] !== "all",
  );
  const advancedCount = activeKeys.filter((key) => key !== "q").length;
  const filterValue = (key: string) => {
    const value = sp[key]!;
    if (key === "advertiser")
      return value === "me"
        ? "Produk saya"
        : (advertisers.find(([id]) => String(id) === value)?.[1] ?? value);
    if (key === "creator")
      return value === "me"
        ? "Konten saya"
        : (team.find((person) => String(person.id) === value)?.name ?? value);
    if (key === "format")
      return (
        CREATIVE_FORMAT_LABEL[value as keyof typeof CREATIVE_FORMAT_LABEL] ??
        value
      );
    if (key === "status")
      return (
        CREATIVE_STATUS_LABEL[value as keyof typeof CREATIVE_STATUS_LABEL] ??
        value
      );
    if (key === "label")
      return value === "none"
        ? "Belum dinilai"
        : (CREATIVE_LABEL[value as keyof typeof CREATIVE_LABEL] ?? value);
    return value;
  };
  const resetHref = `/creatives?${query(Object.fromEntries(Object.keys(filterLabels).map((key) => [key, null])))}`;
  const selectClass = "h-9 w-full min-w-0 [&>span]:truncate";
  const totals = sumCreatives(rows);
  const rates = creativeRates(totals);

  return (
    <div className="@container min-w-0 w-full max-w-full">
      <PageHeader
        title="Creative"
        description={user.role === "creative" && scope ? `${await creativeLabel(user.id)} · konten iklan advertiser tersebut beserta performanya.` : "Pantau performa konten, temukan iklan terbaik, dan kelola hasil kerja tim."}
        actions={
          <>
            <Button asChild variant="outline" className="h-8">
              <a href={exportHref}>
                <DownloadIcon /> Export CSV
              </a>
            </Button>
            <SyncCreativesButton
              period={period.key}
              disabled={metaAccounts.length === 0}
            />
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <nav
          className="flex w-full min-w-0 overflow-x-auto rounded-lg border bg-muted/50 p-1 @min-[480px]:w-auto"
          aria-label="Tampilan"
        >
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={`/creatives?${query({ view: v.key === "ringkasan" ? null : v.key })}`}
              aria-current={view === v.key ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors",
                view === v.key
                  ? "bg-card font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <v.icon className="size-3.5" /> {v.label}
            </Link>
          ))}
        </nav>
        {view !== "ringkasan" && rows.length > 0 && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {fmt.num(posts.length)}
            </span>{" "}
            konten ·{" "}
            <span className="font-medium text-foreground">
              {fmt.num(rows.length)}
            </span>{" "}
            iklan · impr{" "}
            <span className="font-medium text-foreground">
              {fmt.compact(totals.impressions)}
            </span>{" "}
            · CTR{" "}
            <span className="font-medium text-foreground">
              {fmt.pct(rates.ctr)}
            </span>{" "}
            · CPL{" "}
            <span className="font-medium text-foreground">
              {fmt.rp(rates.cpl)}
            </span>
          </p>
        )}
      </div>

      <section
        aria-label="Filter Creative"
        className="mb-4 min-w-0 rounded-xl border bg-card p-3 sm:p-4"
      >
        <div className="grid min-w-0 gap-3 @min-[600px]:grid-cols-2 @min-[960px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 content-start gap-1.5 @min-[600px]:col-span-2 @min-[960px]:col-span-1">
            <span className="text-xs font-medium text-muted-foreground">
              Cari konten
            </span>
            <form className="flex min-w-0 gap-2" action="/creatives">
              {Object.entries(sp)
                .filter(([k, v]) => k !== "q" && k !== "created" && v)
                .map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  key={sp.q ?? ""}
                  aria-label="Cari konten iklan"
                  name="q"
                  defaultValue={sp.q ?? ""}
                  placeholder="Cari iklan, campaign, link…"
                  className="h-9 w-full min-w-0 pl-8"
                />
              </div>
              <Button type="submit" variant="outline" className="h-9">
                Cari
              </Button>
            </form>
          </div>
          <FilterField label="Periode performa">
            <UrlSelect
              param="period"
              label="Periode performa Creative"
              value={period.key}
              options={[...CREATIVE_PERIODS]}
              className={selectClass}
            />
          </FilterField>
          <FilterField
            label={view === "ringkasan" ? "Peringkat konten" : "Urutkan hasil"}
          >
            {view === "ringkasan" ? (
              <UrlSelect
                className={selectClass}
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
                className={selectClass}
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
          </FilterField>
        </div>
        <details
          open={advancedCount > 0}
          className="group/filters mt-3 border-t pt-3"
        >
          <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-md py-1 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <SlidersHorizontalIcon className="size-4" />
            Filter lanjutan
            {advancedCount > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">
                {advancedCount}
              </span>
            )}
            <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open/filters:rotate-180" />
          </summary>
          <div className="mt-3 grid min-w-0 gap-3 @min-[480px]:grid-cols-2 @min-[800px]:grid-cols-3">
            <FilterField label="Advertiser">
              <UrlSelect
                param="advertiser"
                className={selectClass}
                label="Advertiser"
                value={sp.advertiser ?? "all"}
                options={[
                  { value: "all", label: "Semua advertiser" },
                  ...(user.role === "advertiser"
                    ? [{ value: "me", label: "Produk saya" }]
                    : []),
                  ...advertisers.map(([id, name]) => ({
                    value: String(id),
                    label: name,
                  })),
                ]}
              />
            </FilterField>
            <FilterField label="Produk">
              <UrlSelect
                param="product"
                className={selectClass}
                label="Produk"
                value={sp.product ?? "all"}
                options={[
                  { value: "all", label: "Semua produk" },
                  ...products.map((p) => ({ value: p, label: p })),
                ]}
              />
            </FilterField>
            <FilterField label="Format konten">
              <UrlSelect
                param="format"
                className={selectClass}
                label="Format"
                value={sp.format ?? "all"}
                options={[
                  { value: "all", label: "Semua format" },
                  ...Object.entries(CREATIVE_FORMAT_LABEL).map(
                    ([value, label]) => ({ value, label }),
                  ),
                ]}
              />
            </FilterField>
            <FilterField label="Status iklan">
              <UrlSelect
                param="status"
                className={selectClass}
                label="Status"
                value={sp.status ?? "all"}
                options={[
                  { value: "all", label: "Semua status" },
                  ...Object.entries(CREATIVE_STATUS_LABEL).map(
                    ([value, label]) => ({ value, label }),
                  ),
                ]}
              />
            </FilterField>
            <FilterField label="Keterangan">
              <UrlSelect
                param="label"
                className={selectClass}
                label="Keterangan"
                value={sp.label ?? "all"}
                options={[
                  { value: "all", label: "Semua keterangan" },
                  ...Object.entries(CREATIVE_LABEL).map(([value, label]) => ({
                    value,
                    label,
                  })),
                  { value: "none", label: "Belum dinilai" },
                ]}
              />
            </FilterField>
            <FilterField label="Creator / editor">
              <UrlSelect
                param="creator"
                className={selectClass}
                label="Creator / editor"
                value={sp.creator ?? "all"}
                options={[
                  { value: "all", label: "Semua creator" },
                  ...(isCreative
                    ? [{ value: "me", label: "Konten saya" }]
                    : []),
                  ...team
                    .filter((p) => p.creative)
                    .map((p) => ({ value: String(p.id), label: p.name })),
                ]}
              />
            </FilterField>
          </div>
        </details>
        {activeKeys.length > 0 && (
          <div
            className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"
            aria-label="Filter aktif"
          >
            {activeKeys.map((key) => (
              <Link
                key={key}
                href={`/creatives?${query({ [key]: null })}`}
                title={`Hapus filter ${filterLabels[key]}`}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs hover:bg-muted"
              >
                <span className="truncate">
                  {filterLabels[key]}: {filterValue(key)}
                </span>
                <XIcon className="size-3 shrink-0" />
              </Link>
            ))}
            <Link
              href={resetHref}
              className="px-1 text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Reset semua
            </Link>
          </div>
        )}
      </section>
      <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-2 rounded-lg border bg-muted/20 p-3">
        <div className="flex min-w-0 items-start gap-2">
          <CalendarDaysIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {period.label}{" "}
              <span className="font-normal text-muted-foreground">
                · {period.start} – {period.end}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Termasuk hari ini · Zona waktu akun iklan ·{" "}
              {fmt.num(posts.length)} konten / {fmt.num(rows.length)} iklan
              sesuai filter
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {lastSync
            ? `Sinkron terakhir ${lastSync.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })} WIB`
            : "Belum disinkron"}
        </p>
        {missingAccounts.length > 0 && (
          <p
            className="w-full rounded-md border border-warning/30 bg-warning/5 p-2 text-xs text-warning"
            role="status"
          >
            {missingAccounts.length} akun belum disinkron untuk periode ini:{" "}
            {missingAccounts.map((account) => account.name).join(", ")}. Klik
            Sinkron dari Meta untuk melengkapi data.
          </p>
        )}
      </div>

      {allRows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={ClapperboardIcon}
            title={
              syncs.length && !missingAccounts.length
                ? "Tidak ada aktivitas iklan pada periode ini"
                : "Data periode ini belum tersedia"
            }
            description={
              metaAccounts.length === 0
                ? "Pilih akun iklan Meta Anda di Pengaturan → Integrasi → Meta Ads (koneksi tim dikelola supervisor), lalu sinkron."
                : syncs.length && !missingAccounts.length
                  ? "Meta tidak mengembalikan data iklan untuk periode ini. Pilih periode lain bila diperlukan."
                  : `Klik Sinkron dari Meta untuk mengambil konten dan performa ${period.label.toLowerCase()}.`
            }
            action={
              metaAccounts.length > 0 ? (
                <SyncCreativesButton period={period.key} />
              ) : undefined
            }
          />
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={SearchIcon}
            title="Tidak ada konten yang cocok"
            description="Coba kata kunci lain atau hapus filter untuk melihat konten pada periode ini."
            action={
              <Button asChild variant="outline">
                <Link href={resetHref}>Reset filter</Link>
              </Button>
            }
          />
        </Panel>
      ) : view === "ringkasan" ? (
        <>
          {aiEnabled && (
            <AiAnalysisPanel
              key={aiFilterKey}
              initial={latestAnalysis}
              query={query({ view: null, rank: null, sort: null })}
              hasKey={kieKey !== null}
              canSetup={can.manageAdsConnection(user.role)}
              imagesSupported={ANALYSIS_IMAGES_ENABLED}
              modelLabel={modelLabel(SUMMARY_MODEL)}
            />
          )}
          <CreativeReport rows={rows} posts={posts} people={team} rank={rank} />
        </>
      ) : view === "galeri" ? (
        <CreativeGallery
          posts={posts}
          people={team}
          ai={{ period: period.key, modelLabel: modelLabel(CONTENT_MODEL), canRun: canRunAi && kieKey !== null, needsKey: canRunAi && kieKey === null, canSetup: can.manageAdsConnection(user.role), analysedKeys }}
        />
      ) : (
        <Panel
          title={`${fmt.num(rows.length)} iklan`}
          icon={TableIcon}
          iconPosition="left"
          bodyClassName="p-0"
        >
          <CreativesTable rows={rows} people={team} />
        </Panel>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Angka dari Meta sesuai periode {period.start}–{period.end}, bukan
        lifetime. Keterangan, creator, editor dan format yang diubah manual
        disimpan tim dan tidak tertimpa saat sinkron. Iklan yang memakai post
        yang sama digabung menjadi satu konten di Ringkasan dan Galeri. Jumlah
        reach antar-iklan dapat menghitung orang yang sama lebih dari sekali.
      </p>
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
