"use client";

import * as React from "react";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  FileTextIcon,
  GaugeIcon,
  GlobeIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  SearchIcon,
  SparklesIcon,
  TargetIcon,
  TelescopeIcon,
  type LucideIcon,
} from "lucide-react";
import type { SearchConsoleReport, SearchConsoleRow } from "@/lib/search-console-client";
import { findOpportunities, OPPORTUNITY_LABEL, pctChange, POSITION_BUCKETS, positionDistribution, topMovers, withChanges, bucketOf, type Opportunity, type SeoChange } from "@/lib/seo-insights";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/dashboard/panel";
import { SeoTrendChart } from "./seo-trend-chart";
import { SeoAiAnalysis, type SeoAiOptions } from "./seo-ai-analysis";
import { KeywordResearch } from "./keyword-research";
import type { SeoTab } from "./seo-tabs";
import { keywordVolumesAction } from "@/actions/keyword-planner";
import { normalizeKeyword } from "@/lib/keyword-planner-data";

const num = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 0 });
const pct = (v: number) => v.toLocaleString("id-ID", { style: "percent", maximumFractionDigits: 2 });
const pos = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 1 });
const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

type Metric = "clicks" | "impressions" | "ctr" | "position";
const METRICS: { key: Metric; label: string; format: (v: number) => string; lowerIsBetter?: boolean }[] = [
  { key: "clicks", label: "Klik", format: num },
  { key: "impressions", label: "Impresi", format: num },
  { key: "ctr", label: "CTR", format: pct },
  { key: "position", label: "Posisi rata-rata", format: pos, lowerIsBetter: true },
];
type Tab = SeoTab;
/** Google Keyword Planner search volume of the Search Console keywords, loaded when Kata kunci opens. */
type Volumes = { state: "idle" | "loading" } | { state: "ok"; byKeyword: Map<string, number | null> } | { state: "error"; error: string };

/** "▲12%" green when good, red when bad. Position uses the change in rank (up = good). */
function Delta({ value, good, suffix = "%" }: { value: number | null; good: boolean | null; suffix?: string }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-muted-foreground">–</span>;
  if (value === 0) return <span className="text-muted-foreground">=</span>;
  return (
    <span className={cn("inline-flex items-center gap-0.5 whitespace-nowrap tabular-nums", good === null ? "text-muted-foreground" : good ? "text-success" : "text-destructive")}>
      {value > 0 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
      {Math.abs(value).toLocaleString("id-ID", { maximumFractionDigits: 1 })}{suffix}
    </span>
  );
}

export function SeoDashboard({ siteUrl, range, report, ai, initialTab = "overview" }: { siteUrl: string; range: { start: string; end: string }; report: SearchConsoleReport; ai: SeoAiOptions; initialTab?: Tab }) {
  const [tab, setTabState] = React.useState<Tab>(initialTab);
  // The tab lives in the address (?tab=…), so the SEO menu lights the right item and a link opens it.
  const setTab = React.useCallback((next: Tab) => {
    setTabState(next);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
    // The period form and quick ranges above keep the tab when the period changes.
    document.querySelectorAll<HTMLInputElement>("input[data-seo-tab]").forEach((input) => { input.value = next; });
    document.querySelectorAll<HTMLAnchorElement>("a[data-seo-tab-link]").forEach((a) => {
      const href = new URL(a.href);
      if (next === "overview") href.searchParams.delete("tab");
      else href.searchParams.set("tab", next);
      a.href = href.pathname + href.search;
    });
  }, []);
  React.useEffect(() => { setTabState(initialTab); }, [initialTab]);
  const [metric, setMetric] = React.useState<Metric>("clicks");
  const [aiState, setAiState] = React.useState<"none" | "running" | "done">("none");
  const prev = report.previous;
  const queries = React.useMemo(() => withChanges(report.queries, prev?.queries ?? null), [report.queries, prev]);
  const pages = React.useMemo(() => withChanges(report.pages, prev?.pages ?? null), [report.pages, prev]);
  const opportunities = React.useMemo(() => findOpportunities(queries), [queries]);
  const total = report.total!;
  const [volumes, setVolumes] = React.useState<Volumes>({ state: "idle" });
  React.useEffect(() => {
    if (tab !== "queries" || volumes.state !== "idle" || !report.queries.length) return;
    setVolumes({ state: "loading" });
    keywordVolumesAction({ site: siteUrl, keywords: report.queries.map((q) => q.keys?.[0] ?? "").filter(Boolean) })
      .then((res) => setVolumes(res.ok ? { state: "ok", byKeyword: new Map(res.data.keywords.map((k) => [normalizeKeyword(k.keyword), k.volume])) } : { state: "error", error: res.error }))
      .catch(() => setVolumes({ state: "error", error: "Volume pencarian belum dapat dimuat." }));
  }, [tab, volumes.state, report.queries, siteUrl]);

  const series = (rows: SearchConsoleRow[], m: Metric) => rows.map((r) => ({ date: r.keys?.[0] ?? "", value: r[m] }));
  const def = METRICS.find((m) => m.key === metric)!;
  const tabs: { key: Tab; label: string; icon: LucideIcon; count?: number; dot?: boolean }[] = [
    { key: "overview", label: "Ringkasan", icon: LayoutDashboardIcon },
    { key: "queries", label: "Kata kunci", icon: KeyRoundIcon, count: queries.length },
    { key: "pages", label: "Halaman", icon: FileTextIcon, count: pages.length },
    { key: "opportunities", label: "Peluang", icon: TargetIcon, count: opportunities.length },
    { key: "research", label: "Riset kata kunci", icon: TelescopeIcon },
    { key: "audience", label: "Perangkat & negara", icon: GlobeIcon },
    { key: "ai", label: "Analisa AI", icon: SparklesIcon, dot: aiState === "done" },
  ];

  return (
    <div className="@container grid min-w-0 gap-4">
      <div className="grid grid-cols-2 gap-3 @min-[900px]:grid-cols-4">
        {METRICS.map((m) => {
          const now = total[m.key];
          const before = prev?.total?.[m.key];
          const change = m.key === "position" ? (before !== undefined ? +(before - now).toFixed(1) : null) : pctChange(now, before);
          const active = metric === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => { setMetric(m.key); setTab("overview"); }}
              aria-pressed={active}
              className={cn("min-w-0 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40", active && "border-info ring-1 ring-info/40")}
            >
              <p className="flex items-center justify-between text-xs text-muted-foreground">
                {m.key === "position" ? "Posisi rata-rata" : m.key === "ctr" ? "CTR rata-rata" : `Total ${m.label.toLowerCase()}`}
                {active && <span className="size-2 rounded-full bg-info" aria-hidden />}
              </p>
              <p className="mt-1 truncate text-2xl font-semibold tabular-nums @min-[900px]:text-3xl">{m.format(now)}</p>
              <p className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                <Delta value={change} good={change === null ? null : change > 0} suffix={m.key === "position" ? " peringkat" : "%"} />
                {prev?.total && <span className="text-muted-foreground">dari {m.format(before!)}</span>}
              </p>
            </button>
          );
        })}
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        {shortDate(range.start)} – {shortDate(range.end)}
        {prev ? ` · dibanding ${shortDate(prev.range.start)} – ${shortDate(prev.range.end)}` : " · periode sebelumnya tidak tersedia"}
        {" · klik kartu untuk mengganti grafik"}
      </p>

      <div className="min-w-0 rounded-xl border bg-card">
        <div role="tablist" aria-label="Bagian SEO" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(({ key, label, icon: Icon, count, dot }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn("relative -mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors", tab === key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              <Icon className="size-4" />
              {label}
              {count !== undefined && <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground tabular-nums">{count}</span>}
              {dot && <span className="size-1.5 rounded-full bg-success" aria-label="ada hasil" />}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="min-w-0 p-4">
          {tab === "overview" && (
            <div className="grid min-w-0 gap-6">
              <section className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{def.label} per hari</h3>
                  <div className="flex rounded-lg bg-muted p-0.5" role="group" aria-label="Metrik grafik">
                    {METRICS.map((m) => (
                      <button key={m.key} type="button" aria-pressed={metric === m.key} onClick={() => setMetric(m.key)} className={cn("rounded-md px-2.5 py-1 text-xs", metric === m.key ? "bg-card font-medium shadow-xs" : "text-muted-foreground hover:text-foreground")}>
                        {m.key === "position" ? "Posisi" : m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <SeoTrendChart current={series(report.daily, metric)} previous={prev ? series(prev.daily, metric) : null} format={def.format} invert={metric === "position"} integer={metric === "clicks" || metric === "impressions"} label={def.label} />
                <details className="mt-2 rounded-lg border text-sm">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Tabel harian ({report.daily.length} hari)</summary>
                  <div className="max-h-80 overflow-auto border-t">
                    <SimpleTable label="Tanggal" rows={[...report.daily].reverse()} />
                  </div>
                </details>
              </section>
              <div className="grid min-w-0 gap-6 @min-[900px]:grid-cols-2">
                <PositionBands rows={report.queries} />
                {prev ? <Movers rows={queries} /> : <p className="text-sm text-muted-foreground">Perubahan kata kunci tampil bila data periode sebelumnya tersedia.</p>}
              </div>
            </div>
          )}
          {tab === "queries" && <ChangesTable rows={queries} label="Kata kunci" hasPrevious={!!prev} volumes={volumes} />}
          {tab === "research" && <KeywordResearch siteUrl={siteUrl} queries={report.queries} />}
          {tab === "pages" && <ChangesTable rows={pages} label="Halaman" hasPrevious={!!prev} pages siteUrl={siteUrl} />}
          {tab === "opportunities" && <Opportunities items={opportunities} />}
          {tab === "audience" && (
            <div className="grid min-w-0 gap-6 @min-[900px]:grid-cols-2">
              <ShareList title="Perangkat" rows={report.devices} name={(k) => ({ MOBILE: "Ponsel", DESKTOP: "Desktop", TABLET: "Tablet" })[k] ?? k} />
              <ShareList title="Negara" rows={report.countries} name={countryName} />
            </div>
          )}
          {/* Mounted once opened, so its run keeps polling while other tabs are shown. */}
          <div hidden={tab !== "ai"}>{(tab === "ai" || aiState !== "none") && <SeoAiAnalysis site={siteUrl} start={range.start} end={range.end} ai={ai} onState={setAiState} />}</div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Pencarian Web · data final dari Google, tanggal zona waktu Pacific. Kata kunci dan halaman: 250 teratas menurut klik; Google menyembunyikan sebagian kata kunci demi privasi, jadi
        jumlahnya bisa berbeda dari total.
      </p>
    </div>
  );
}

function SimpleTable({ label, rows }: { label: string; rows: SearchConsoleRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
        <tr>{[label, "Klik", "Impresi", "CTR", "Posisi"].map((h, i) => <th key={h} scope="col" className={cn("px-3 py-2 font-medium", i ? "text-right" : "text-left")}>{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((r, i) => (
          <tr key={`${r.keys?.[0]}-${i}`}>
            <td className="px-3 py-2">{r.keys?.[0]}</td>
            <td className="px-3 py-2 text-right tabular-nums">{num(r.clicks)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{num(r.impressions)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{pct(r.ctr)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{r.impressions ? pos(r.position) : "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const BAND_TONE: Record<string, string> = { top3: "bg-success", top10: "bg-info", page2: "bg-warning", beyond: "bg-muted-foreground/40" };

function PositionBands({ rows }: { rows: SearchConsoleRow[] }) {
  const bands = positionDistribution(rows);
  const max = Math.max(1, ...bands.map((b) => b.keywords));
  return (
    <section className="min-w-0">
      <h3 className="text-sm font-semibold">Sebaran posisi kata kunci</h3>
      <p className="text-xs text-muted-foreground">{num(rows.length)} kata kunci teratas menurut klik.</p>
      <ul className="mt-3 grid gap-2.5">
        {bands.map((b) => (
          <li key={b.key} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-sm">
            <span className="text-xs text-muted-foreground">{b.label}</span>
            <span className="h-2.5 rounded-full bg-muted"><span className={cn("block h-full rounded-full", BAND_TONE[b.key])} style={{ width: `${(b.keywords / max) * 100}%` }} /></span>
            <span className="w-28 text-right text-xs tabular-nums"><span className="font-medium">{num(b.keywords)}</span> <span className="text-muted-foreground">· {num(b.clicks)} klik</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Movers({ rows }: { rows: SeoChange[] }) {
  const m = topMovers(rows, 5);
  const list = (title: string, items: SeoChange[], tone: "up" | "down" | "new" | "rankUp" | "rankDown") => (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {items.length ? (
        <ul className="mt-1 grid gap-1">
          {items.map((r) => (
            <li key={r.key} className="flex min-w-0 items-center justify-between gap-3 text-sm">
              <span className="truncate" title={r.key}>{r.key}</span>
              {tone === "new" ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{num(r.impressions)} impresi · posisi {pos(r.position)}</span>
                : tone === "rankUp" || tone === "rankDown" ? <span className="flex shrink-0 items-center gap-2 text-xs"><span className="text-muted-foreground tabular-nums">posisi {pos(r.position)}</span><Delta value={r.positionGain} good={tone === "rankUp"} suffix="" /></span>
                : <Delta value={r.clicksDelta} good={tone === "up"} suffix=" klik" />}
            </li>
          ))}
        </ul>
      ) : <p className="mt-1 text-xs text-muted-foreground">Tidak ada.</p>}
    </div>
  );
  return (
    <section className="grid min-w-0 gap-3">
      <div>
        <h3 className="text-sm font-semibold">Perubahan kata kunci</h3>
        <p className="text-xs text-muted-foreground">Dibanding periode sebelumnya; peringkat dihitung untuk kata kunci dengan minimal 10 impresi.</p>
      </div>
      {(m.up.length > 0 || m.down.length > 0) && <div className="grid min-w-0 gap-3 @min-[560px]:grid-cols-2">{list("Klik naik", m.up, "up")}{list("Klik turun", m.down, "down")}</div>}
      <div className="grid min-w-0 gap-3 @min-[560px]:grid-cols-2">{list("Peringkat naik", m.rankUp, "rankUp")}{list("Peringkat turun", m.rankDown, "rankDown")}</div>
      {list("Baru muncul", m.fresh, "new")}
    </section>
  );
}

type SortKey = "clicks" | "impressions" | "ctr" | "position" | "clicksDelta" | "positionGain" | "volume";

function ChangesTable({ rows, label, hasPrevious, pages = false, siteUrl, volumes }: { rows: SeoChange[]; label: string; hasPrevious: boolean; pages?: boolean; siteUrl?: string; volumes?: Volumes }) {
  const volumeOf = (r: SeoChange) => (volumes?.state === "ok" ? volumes.byKeyword.get(normalizeKeyword(r.key)) ?? null : null);
  const [q, setQ] = React.useState("");
  const [band, setBand] = React.useState<string>("all");
  const [sort, setSort] = React.useState<{ key: SortKey; desc: boolean }>({ key: "clicks", desc: true });
  const [limit, setLimit] = React.useState(50);
  const shown = rows
    .filter((r) => (!q || r.key.toLowerCase().includes(q.toLowerCase())) && (band === "all" || bucketOf(r.position) === band))
    .sort((a, b) => {
      const av = (sort.key === "volume" ? volumeOf(a) : a[sort.key]) ?? -Infinity;
      const bv = (sort.key === "volume" ? volumeOf(b) : b[sort.key]) ?? -Infinity;
      // Ties (often 0 clicks: Google hides most per-keyword clicks on small sites) go by impressions.
      return (sort.desc ? (bv as number) - (av as number) : (av as number) - (bv as number)) || b.impressions - a.impressions;
    });
  const display = (key: string) => (pages && siteUrl && key.startsWith(siteUrl.replace(/^sc-domain:/, "")) ? key.slice(siteUrl.length - 1) || "/" : key);
  const head = (key: SortKey, text: string) => (
    <th scope="col" className="px-3 py-2 text-right font-medium" aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1" onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : key !== "position" })}>
        {text}{sort.key === key && <ArrowUpDownIcon className="size-3" />}
      </button>
    </th>
  );
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 basis-full sm:max-w-xs sm:flex-1 sm:basis-auto">
          <SearchIcon className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setLimit(50); }} placeholder={`Cari ${label.toLowerCase()}…`} aria-label={`Cari ${label.toLowerCase()}`} className="h-8 pl-8 text-xs" />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Saring posisi">
          {[{ key: "all", label: "Semua posisi" }, ...POSITION_BUCKETS.map((b) => ({ key: b.key, label: b.label.replace("Posisi ", "") }))].map((b) => (
            <button key={b.key} type="button" aria-pressed={band === b.key} onClick={() => setBand(b.key)} className={cn("rounded-full border px-2.5 py-1 text-xs", band === b.key ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>{b.label}</button>
          ))}
        </div>
      </div>
      {volumes?.state === "loading" && <p className="text-xs text-muted-foreground">Memuat volume pencarian dari Google Keyword Planner…</p>}
      {volumes?.state === "error" && <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Volume pencarian belum tersedia:</span> {volumes.error}</p>}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">{label}</th>
              {head("clicks", "Klik")}
              {hasPrevious && head("clicksDelta", "Δ klik")}
              {head("impressions", "Impresi")}
              {volumes?.state === "ok" && head("volume", "Volume/bln")}
              {head("ctr", "CTR")}
              {head("position", "Posisi")}
              {hasPrevious && head("positionGain", "Δ posisi")}
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.slice(0, limit).map((r) => (
              <tr key={r.key} className="hover:bg-muted/30">
                <td className="max-w-md px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("size-2 shrink-0 rounded-full", BAND_TONE[bucketOf(r.position)])} title={POSITION_BUCKETS.find((b) => b.key === bucketOf(r.position))?.label} />
                    {pages ? <a href={r.key} target="_blank" rel="noreferrer" className="truncate hover:underline" title={r.key}>{display(r.key)}</a> : <span className="break-words">{r.key}</span>}
                    {hasPrevious && !r.previous && <span className="shrink-0 rounded bg-info/10 px-1 text-[10px] text-info">baru</span>}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{num(r.clicks)}</td>
                {hasPrevious && <td className="px-3 py-2 text-right text-xs"><Delta value={r.clicksDelta} good={(r.clicksDelta ?? 0) > 0} suffix="" /></td>}
                <td className="px-3 py-2 text-right tabular-nums">{num(r.impressions)}</td>
                {volumes?.state === "ok" && <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{volumeOf(r) === null ? "–" : num(volumeOf(r)!)}</td>}
                <td className="px-3 py-2 text-right tabular-nums">{pct(r.ctr)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pos(r.position)}</td>
                {hasPrevious && <td className="px-3 py-2 text-right text-xs"><Delta value={r.positionGain} good={(r.positionGain ?? 0) > 0} suffix="" /></td>}
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Tidak ada yang cocok.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{Math.min(limit, shown.length)} dari {shown.length}{hasPrevious ? " · Δ dibanding periode sebelumnya; Δ posisi positif = naik peringkat" : ""}</span>
        {shown.length > limit && <button type="button" onClick={() => setLimit((l) => l + 50)} className="font-medium text-foreground underline underline-offset-4">Tampilkan 50 lagi</button>}
      </div>
    </div>
  );
}

const OPP_TONE: Record<Opportunity["kind"], string> = { striking: "border-l-info", low_ctr: "border-l-warning", declining: "border-l-destructive" };

function Opportunities({ items }: { items: Opportunity[] }) {
  const [kind, setKind] = React.useState<Opportunity["kind"] | "all">("all");
  const kinds = (Object.keys(OPPORTUNITY_LABEL) as Opportunity["kind"][]).filter((k) => items.some((i) => i.kind === k));
  const shown = items.filter((i) => kind === "all" || i.kind === kind);
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">Belum ada peluang yang menonjol pada periode ini (minimal 30 impresi per kata kunci).</p>;
  return (
    <div className="grid min-w-0 gap-3">
      <p className="text-xs text-muted-foreground">
        Dihitung dari kata kunci teratas: <b className="font-medium text-foreground">hampir halaman 1</b> = posisi 4–20 dengan permintaan nyata; <b className="font-medium text-foreground">CTR di bawah wajar</b> = sudah di
        halaman 1 tapi jarang diklik (perbaiki judul &amp; meta description); <b className="font-medium text-foreground">klik turun</b> = turun ≥30% dari periode sebelumnya. Potensi klik adalah perkiraan kasar.
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Saring peluang">
        {[{ key: "all" as const, label: "Semua", n: items.length }, ...kinds.map((k) => ({ key: k, label: OPPORTUNITY_LABEL[k], n: items.filter((i) => i.kind === k).length }))].map((f) => (
          <button key={f.key} type="button" aria-pressed={kind === f.key} onClick={() => setKind(f.key)} className={cn("rounded-full border px-3 py-1 text-xs", kind === f.key ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>
            {f.label} <span className="opacity-80 tabular-nums">{f.n}</span>
          </button>
        ))}
      </div>
      <div className="grid min-w-0 gap-2 @min-[900px]:grid-cols-2">
        {shown.map((o) => (
          <article key={`${o.kind}-${o.key}`} className={cn("min-w-0 rounded-lg border border-l-4 bg-card p-3", OPP_TONE[o.kind])}>
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 text-sm font-medium break-words">{o.key}</p>
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{OPPORTUNITY_LABEL[o.kind]}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              Posisi {pos(o.position)} · {num(o.impressions)} impresi · {num(o.clicks)} klik · CTR {pct(o.ctr)}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed">{o.note}</p>
            {o.potentialClicks > 0 && <p className="mt-1 flex items-center gap-1 text-xs font-medium text-success"><GaugeIcon className="size-3.5" /> {o.kind === "declining" ? `${num(o.potentialClicks)} klik hilang` : `± ${num(o.potentialClicks)} klik tambahan`}</p>}
          </article>
        ))}
      </div>
    </div>
  );
}

function ShareList({ title, rows, name }: { title: string; rows: SearchConsoleRow[]; name: (key: string) => string }) {
  const total = rows.reduce((s, r) => s + r.clicks, 0) || 1;
  return (
    <Panel title={title} bodyClassName="p-4">
      {rows.length ? (
        <ul className="grid gap-3">
          {rows.slice(0, 10).map((r) => (
            <li key={r.keys?.[0]} className="grid gap-1 text-sm">
              <span className="flex items-center justify-between gap-3">
                <span className="truncate">{name(r.keys?.[0] ?? "")}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{num(r.clicks)} klik · CTR {pct(r.ctr)} · posisi {pos(r.position)}</span>
              </span>
              <span className="h-1.5 rounded-full bg-muted"><span className="block h-full rounded-full bg-info" style={{ width: `${(r.clicks / total) * 100}%` }} /></span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">Belum ada data.</p>}
    </Panel>
  );
}

const COUNTRIES: Record<string, string> = { idn: "Indonesia", mys: "Malaysia", sgp: "Singapura", usa: "Amerika Serikat", sau: "Arab Saudi", jpn: "Jepang", aus: "Australia", gbr: "Inggris", ind: "India", phl: "Filipina", tha: "Thailand", vnm: "Vietnam", nld: "Belanda", deu: "Jerman", kor: "Korea Selatan", twn: "Taiwan", hkg: "Hong Kong", are: "Uni Emirat Arab", qat: "Qatar", egy: "Mesir", tur: "Turki", brn: "Brunei" };
const countryName = (code: string) => COUNTRIES[code.toLowerCase()] ?? code.toUpperCase();
