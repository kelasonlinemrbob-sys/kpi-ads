"use client";

import * as React from "react";
import { ArrowUpDownIcon, DownloadIcon, LoaderIcon, SearchIcon, TelescopeIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { keywordIdeasAction } from "@/actions/keyword-planner";
import { COMPETITION_LABEL, defaultSeeds, joinWithSearchConsole, plannerCsv, type Competition, type RankedKeyword } from "@/lib/keyword-planner-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkline } from "@/components/dashboard/sparkline";

type Query = { keys?: string[]; clicks: number; impressions: number; position: number };
type SortKey = "volume" | "trendPct" | "competitionIndex" | "bidHigh" | "position";
const num = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 0 });
const COMP_TONE: Record<Competition, string> = { low: "bg-success/10 text-success", medium: "bg-warning/10 text-[color-mix(in_oklch,var(--warning),black_25%)] dark:text-warning", high: "bg-destructive/10 text-destructive", unknown: "bg-muted text-muted-foreground" };

/** "Riset kata kunci": Google Keyword Planner ideas around seed keywords or the site, against the site's own rankings. */
export function KeywordResearch({ siteUrl, queries }: { siteUrl: string; queries: Query[] }) {
  const [seeds, setSeeds] = React.useState<string[]>(() => defaultSeeds(queries));
  const [draft, setDraft] = React.useState("");
  const [useSite, setUseSite] = React.useState(false);
  const [language, setLanguage] = React.useState<"id" | "en">("id");
  const [location, setLocation] = React.useState<"id" | "all">("id");
  const [busy, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ rows: RankedKeyword[]; currency: string } | null>(null);
  const [q, setQ] = React.useState("");
  const [onlyGaps, setOnlyGaps] = React.useState(false);
  const [competition, setCompetition] = React.useState<Competition | "all">("all");
  const [sort, setSort] = React.useState<{ key: SortKey; desc: boolean }>({ key: "volume", desc: true });
  const [limit, setLimit] = React.useState(50);
  const pageSeed = siteUrl.startsWith("sc-domain:") ? `https://${siteUrl.slice("sc-domain:".length)}/` : siteUrl;

  const add = (value: string) => {
    const parts = value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    setSeeds((prev) => [...prev, ...parts.filter((p) => !prev.some((x) => x.toLowerCase() === p.toLowerCase()))].slice(0, 20));
    setDraft("");
  };
  const run = () =>
    start(async () => {
      setError(null);
      const res = await keywordIdeasAction({ site: siteUrl, seeds, url: useSite ? pageSeed : null, language, location });
      if (!res.ok) { setError(res.error); return; }
      setResult({ rows: joinWithSearchConsole(res.data.keywords, queries), currency: res.data.currency });
      setLimit(50);
    });

  const rows = (result?.rows ?? [])
    .filter((r) => (!q || r.keyword.toLowerCase().includes(q.toLowerCase())) && (!onlyGaps || !r.site) && (competition === "all" || r.competition === competition))
    .sort((a, b) => {
      const val = (r: RankedKeyword) => (sort.key === "position" ? (r.site ? -r.site.position : null) : r[sort.key]);
      const av = val(a), bv = val(b);
      if (av === null) return bv === null ? 0 : 1;
      if (bv === null) return -1;
      return sort.desc ? bv - av : av - bv;
    });
  const gaps = result?.rows.filter((r) => !r.site).length ?? 0;
  const money = (v: number | null) => (v === null ? "–" : new Intl.NumberFormat("id-ID", { style: "currency", currency: result?.currency ?? "IDR", maximumFractionDigits: 0 }).format(v));
  const download = () => {
    if (!result) return;
    const blob = new Blob([plannerCsv(rows, result.currency)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `riset-kata-kunci-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const head = (key: SortKey, text: string) => (
    <th scope="col" className="px-3 py-2 text-right font-medium" aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1" onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : true })}>{text}{sort.key === key && <ArrowUpDownIcon className="size-3" />}</button>
    </th>
  );

  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid gap-3 rounded-xl border bg-muted/20 p-4">
        <p className="text-sm text-muted-foreground">
          Ide kata kunci dari <span className="text-foreground">Google Keyword Planner</span>: volume pencarian per bulan, tren 12 bulan, tingkat persaingan iklan dan kisaran bid,
          dibandingkan dengan posisi website ini di Google. Kata kunci bertanda <span className="text-foreground">Belum muncul</span> adalah celah konten.
        </p>
        <div className="grid gap-1.5">
          <label htmlFor="kp-seed" className="text-xs font-medium">Kata kunci awal (maks. 20)</label>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-lg border bg-card p-1.5">
            {seeds.map((s) => (
              <span key={s} className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                <span className="truncate">{s}</span>
                <button type="button" aria-label={`Hapus ${s}`} onClick={() => setSeeds((prev) => prev.filter((x) => x !== s))} className="text-muted-foreground hover:text-foreground"><XIcon className="size-3" /></button>
              </span>
            ))}
            <input
              id="kp-seed"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && draft.trim()) { e.preventDefault(); add(draft); } else if (e.key === "Backspace" && !draft && seeds.length) setSeeds((p) => p.slice(0, -1)); }}
              onBlur={() => draft.trim() && add(draft)}
              placeholder={seeds.length ? "Tambah, lalu Enter" : "misal: kursus bahasa inggris, kampung inggris pare"}
              className="h-7 min-w-40 flex-1 bg-transparent px-1 text-sm outline-none"
              disabled={seeds.length >= 20}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={useSite} onChange={(e) => setUseSite(e.target.checked)} className="accent-foreground" /> Juga ambil ide dari isi website <span className="text-muted-foreground">({pageSeed})</span></label>
          <select aria-label="Bahasa" value={language} onChange={(e) => setLanguage(e.target.value as "id" | "en")} className="h-8 rounded-md border bg-background px-2 text-xs"><option value="id">Bahasa Indonesia</option><option value="en">Bahasa Inggris</option></select>
          <select aria-label="Lokasi" value={location} onChange={(e) => setLocation(e.target.value as "id" | "all")} className="h-8 rounded-md border bg-background px-2 text-xs"><option value="id">Indonesia</option><option value="all">Semua lokasi</option></select>
          <Button type="button" size="sm" onClick={run} disabled={busy || (!seeds.length && !useSite)} className="ml-auto">
            {busy ? <LoaderIcon className="animate-spin" /> : <TelescopeIcon />} Cari ide kata kunci
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="grid min-w-0 gap-3">
          <div className="grid grid-cols-3 gap-2">
            {[["Ide kata kunci", num(result.rows.length)], ["Total volume/bulan", num(result.rows.reduce((s, r) => s + (r.volume ?? 0), 0))], ["Belum muncul di Google", num(gaps)]].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-card p-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p></div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 basis-full sm:max-w-xs sm:flex-1 sm:basis-auto">
              <SearchIcon className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
              <Input value={q} onChange={(e) => { setQ(e.target.value); setLimit(50); }} placeholder="Saring kata kunci…" aria-label="Saring kata kunci" className="h-8 pl-8 text-xs" />
            </div>
            <label className="inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs"><input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} className="accent-foreground" /> Hanya yang belum muncul</label>
            <select aria-label="Kompetisi" value={competition} onChange={(e) => setCompetition(e.target.value as Competition | "all")} className="h-8 rounded-md border bg-background px-2 text-xs">
              <option value="all">Semua kompetisi</option><option value="low">Kompetisi rendah</option><option value="medium">Kompetisi sedang</option><option value="high">Kompetisi tinggi</option>
            </select>
            <Button type="button" size="sm" variant="outline" onClick={download} className="ml-auto"><DownloadIcon /> CSV</Button>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Kata kunci</th>
                  {head("volume", "Volume/bln")}
                  {head("trendPct", "Tren 12 bln")}
                  {head("competitionIndex", "Kompetisi")}
                  {head("bidHigh", "Bid atas halaman")}
                  {head("position", "Posisi website")}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.slice(0, limit).map((r) => (
                  <tr key={r.keyword} className="hover:bg-muted/30">
                    <td className="max-w-sm px-3 py-2 break-words">{r.keyword}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{r.volume === null ? "–" : num(r.volume)}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center justify-end gap-2">
                        {r.trend.length > 1 && <Sparkline values={r.trend.map((t) => t.searches)} tone="muted" className="h-6 w-16" />}
                        <span className={cn("w-12 text-right text-xs tabular-nums", r.trendPct === null ? "text-muted-foreground" : r.trendPct > 0 ? "text-success" : r.trendPct < 0 ? "text-destructive" : "text-muted-foreground")}>{r.trendPct === null ? "–" : `${r.trendPct > 0 ? "+" : ""}${r.trendPct.toLocaleString("id-ID")}%`}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right"><span className={cn("rounded-md px-1.5 py-0.5 text-[11px]", COMP_TONE[r.competition])}>{COMPETITION_LABEL[r.competition]}{r.competitionIndex !== null && ` · ${r.competitionIndex}`}</span></td>
                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap tabular-nums">{r.bidLow === null && r.bidHigh === null ? "–" : `${money(r.bidLow)} – ${money(r.bidHigh)}`}</td>
                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                      {r.site ? <span className="tabular-nums">{r.site.position.toLocaleString("id-ID", { maximumFractionDigits: 1 })} <span className="text-muted-foreground">· {num(r.site.impressions)} impresi</span></span> : <span className="rounded bg-info/10 px-1.5 py-0.5 text-[11px] text-info">Belum muncul</span>}
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Tidak ada yang cocok.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{Math.min(limit, rows.length)} dari {rows.length} · Volume adalah rata-rata 12 bulan dan dibulatkan Google; tren = 3 bulan terakhir dibanding 3 bulan sebelumnya. Bid = kisaran bid iklan untuk tampil di atas halaman.</span>
            {rows.length > limit && <button type="button" onClick={() => setLimit((l) => l + 50)} className="font-medium text-foreground underline underline-offset-4">Tampilkan 50 lagi</button>}
          </div>
        </div>
      )}
    </div>
  );
}
