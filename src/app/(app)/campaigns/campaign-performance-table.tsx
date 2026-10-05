"use client";

import { useMemo, useState } from "react";
import { ArrowDownUpIcon, MegaphoneIcon, SearchIcon } from "lucide-react";
import type { Campaign } from "@/db/schema";
import { CAMPAIGN_STATUS_LABEL, PLATFORM_DOT, PLATFORM_LABEL } from "@/lib/labels";
import { cn, formatDate } from "@/lib/utils";
import { campaignMoney, derivedCampaignMetrics, totalCampaignMetrics, type CampaignMetrics } from "@/lib/campaign-metrics";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";

export type AdCampaignRow = {
  id: number; name: string; platform: Campaign["platform"]; accountName: string;
  status: Campaign["status"]; platformStatus: string; objective: string | null;
  dailyBudget: number | null; currency: string | null; startDate: string | null; endDate: string | null;
  product: { name: string; keyword: string } | null; owner: { name: string } | null;
  performance: CampaignMetrics | null;
};
type MetricKey = Exclude<keyof ReturnType<typeof derivedCampaignMetrics>, "currency">;
type Column = { key: MetricKey; label: string; help: string; format?: "money" | "percent" | "decimal" | "roas" };
const columns: Column[] = [
  { key: "spent", label: "Spend", help: "Total biaya iklan dalam periode terpilih", format: "money" },
  { key: "reach", label: "Reach", help: "Estimasi orang unik yang dijangkau selama periode; tidak dijumlahkan antar-campaign" },
  { key: "impressions", label: "Impression", help: "Jumlah penayangan iklan" },
  { key: "frequency", label: "Frequency", help: "Impression ÷ reach", format: "decimal" },
  { key: "cpm", label: "CPM", help: "Spend ÷ impression × 1.000", format: "money" },
  { key: "clicks", label: "Klik (semua)", help: "Meta: semua klik iklan. Google: metrics.clicks" },
  { key: "ctr", label: "CTR (semua)", help: "Semua klik ÷ impression × 100%", format: "percent" },
  { key: "cpc", label: "CPC (semua)", help: "Spend ÷ semua klik", format: "money" },
  { key: "linkClicks", label: "Link click", help: "Klik tautan Meta, berbeda dari semua klik" },
  { key: "linkCtr", label: "CTR link", help: "Link click ÷ impression × 100%", format: "percent" },
  { key: "linkCpc", label: "CPC link", help: "Spend ÷ link click", format: "money" },
  { key: "outboundClicks", label: "Outbound click", help: "Klik Meta menuju tujuan di luar teknologi Meta" },
  { key: "landingPageViews", label: "LPV", help: "Meta: landing_page_view. Google: konversi LPV yang dipilih di Akun iklan" },
  { key: "cplv", label: "CPLV", help: "Spend ÷ landing page views", format: "money" },
  { key: "lpvRate", label: "LPV / link", help: "LPV ÷ link click × 100%", format: "percent" },
  { key: "leads", label: "Lead", help: "Event lead Meta, menggunakan jenis lead yang dikonfigurasi; tidak digabung dengan chat" },
  { key: "cpr", label: "CPR (lead)", help: "Spend ÷ lead Meta", format: "money" },
  { key: "chats", label: "Chat", help: "Meta: messaging_conversation_started_7d (percakapan dimulai)" },
  { key: "costPerChat", label: "Biaya / chat", help: "Spend ÷ percakapan dimulai", format: "money" },
  { key: "conversions", label: "Konversi Google", help: "Google: metrics.conversions sesuai tujuan akun, dapat berupa atribusi pecahan; bukan selalu lead" },
  { key: "costPerConversion", label: "Biaya / konversi", help: "Spend ÷ konversi Google", format: "money" },
  { key: "purchases", label: "Purchase", help: "Event pembelian Meta; event agregat dan pixel tidak dijumlahkan ganda" },
  { key: "costPerPurchase", label: "Biaya / purchase", help: "Spend ÷ pembelian", format: "money" },
  { key: "revenue", label: "Nilai purchase", help: "Nilai pembelian yang dilaporkan ke Meta", format: "money" },
  { key: "roas", label: "ROAS", help: "Nilai purchase ÷ spend", format: "roas" },
  { key: "engagements", label: "Post engagement", help: "Interaksi postingan yang dilaporkan Meta" },
  { key: "videoPlays", label: "Video play", help: "Jumlah video mulai diputar" },
  { key: "video3s", label: "Video 3 detik", help: "Event video_view Meta (tayangan video 3 detik)" },
  { key: "thruplays", label: "ThruPlay", help: "Video selesai atau ditonton minimal 15 detik" },
  { key: "costPerThruplay", label: "Biaya / ThruPlay", help: "Spend ÷ ThruPlay", format: "money" },
];
const views: { id: string; label: string; keys: MetricKey[] }[] = [
  { id: "summary", label: "Ringkasan", keys: ["spent", "impressions", "linkClicks", "leads", "cpr", "chats", "costPerChat", "landingPageViews", "cplv"] },
  { id: "traffic", label: "Traffic", keys: ["spent", "reach", "impressions", "frequency", "cpm", "clicks", "ctr", "cpc", "linkClicks", "linkCtr", "linkCpc", "outboundClicks", "landingPageViews", "cplv", "lpvRate"] },
  { id: "conversion", label: "Konversi", keys: ["spent", "leads", "cpr", "chats", "costPerChat", "conversions", "costPerConversion", "purchases", "costPerPurchase", "revenue", "roas"] },
  { id: "video", label: "Video & interaksi", keys: ["spent", "impressions", "engagements", "videoPlays", "video3s", "thruplays", "costPerThruplay"] },
  { id: "all", label: "Semua metrik", keys: columns.map((c) => c.key) },
];
function metricText(metrics: CampaignMetrics | null, column: Column) {
  const value = metrics ? derivedCampaignMetrics(metrics)[column.key] : null;
  if (value === null) return "—";
  if (column.format === "money") return campaignMoney(value, metrics!.currency);
  const text = value.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  return `${text}${column.format === "percent" ? "%" : column.format === "roas" ? "×" : ""}`;
}
function metricWidth(column: Column) {
  // Reserve space for both the heading (including its sort icon) and the value.
  return Math.max(column.format === "money" ? 136 : 88, column.label.length * 7 + 40);
}
export function AdCampaignsTable({ rows, emptyAction }: { rows: AdCampaignRow[]; emptyAction: React.ReactNode }) {
  const [view, setView] = useState("summary");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: MetricKey; desc: boolean }>({ key: "spent", desc: true });
  const visible = useMemo(() => rows.filter((r) => [r.name, r.accountName, r.product?.name, r.owner?.name].join(" ").toLowerCase().includes(search.toLowerCase())).sort((a, b) => {
    const av = a.performance ? derivedCampaignMetrics(a.performance)[sort.key] : null;
    const bv = b.performance ? derivedCampaignMetrics(b.performance)[sort.key] : null;
    if (av === null) return bv === null ? a.name.localeCompare(b.name) : 1;
    if (bv === null) return -1;
    return (sort.desc ? bv - av : av - bv) || a.name.localeCompare(b.name);
  }), [rows, search, sort]);
  const keys = [...views.find((v) => v.id === view)!.keys];
  if (view === "summary" && rows.some((r) => r.platform === "google")) keys.push("conversions", "costPerConversion");
  const selected = keys.map((key) => columns.find((c) => c.key === key)!);
  const tableWidth = 300 + 152 + selected.reduce((width, column) => width + metricWidth(column), 0);
  const totals = totalCampaignMetrics(visible.map((r) => r.performance));
  return <Panel title="Campaign Ads" icon={MegaphoneIcon} iconPosition="left" bodyClassName="overflow-hidden">
    {rows.length === 0 ? <EmptyState icon={MegaphoneIcon} title="Tidak ada campaign" description="Coba ubah filter, atau tambahkan akun iklan dan sinkronkan campaign dari Ads." action={emptyAction} /> : <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Kelompok metrik">
          {views.map((v) => <button type="button" key={v.id} aria-pressed={view === v.id} onClick={() => setView(v.id)} className={cn("rounded-md px-3 py-1.5 text-xs transition-colors", view === v.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>{v.label}</button>)}
        </div>
        <div className="relative"><SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input aria-label="Cari campaign, product, atau pemilik" placeholder="Cari campaign, product, owner…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-64 pl-8 text-xs" /></div>
      </div>
      <Table aria-label="Metrik campaign" className="table-fixed border-separate border-spacing-0 text-[13px] [&_th]:border-b [&_th]:border-r [&_th]:border-border [&_th:last-child]:border-r-0 [&_td]:border-b [&_td]:border-r [&_td]:border-border [&_td:last-child]:border-r-0" style={{ minWidth: tableWidth }} containerProps={{ role: "region", "aria-label": "Tabel campaign, geser untuk melihat semua metrik", tabIndex: 0, className: "max-h-[70vh] overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" }}>
        <colgroup>
          <col style={{ width: 300 }} />
          <col style={{ width: 152 }} />
          {selected.map((c) => <col key={c.key} style={{ width: metricWidth(c) }} />)}
        </colgroup>
        <TableHeader className="sticky top-0 z-20 bg-muted"><TableRow>
          <TableHead scope="col" className="sm:sticky sm:left-0 z-10 bg-muted">Campaign / Product</TableHead>
          <TableHead scope="col">Status / Budget harian</TableHead>
          {selected.map((c) => <TableHead scope="col" key={c.key} className="text-right" aria-sort={sort.key === c.key ? sort.desc ? "descending" : "ascending" : "none"} title={c.help}><button type="button" className="inline-flex items-center gap-1 py-2" onClick={() => setSort({ key: c.key, desc: sort.key === c.key ? !sort.desc : true })}>{c.label}{sort.key === c.key && <ArrowDownUpIcon className="size-3" />}</button></TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {visible.map((row) => <TableRow key={row.id} className="group even:bg-muted/20">
            <TableCell className="sm:sticky sm:left-0 z-10 bg-card py-3 group-even:bg-muted group-hover:bg-muted">
              <span className="mb-0.5 block whitespace-normal break-words font-medium leading-snug" title={row.name}>{row.name}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn("size-1.5 shrink-0 rounded-full", PLATFORM_DOT[row.platform])} /><span className="truncate" title={`${PLATFORM_LABEL[row.platform]} · ${row.accountName}`}>{PLATFORM_LABEL[row.platform]} · {row.accountName}</span></span>
              <span className={cn("block truncate text-xs", row.product ? "text-muted-foreground" : "text-warning")} title={row.product?.keyword}>{row.product ? `${row.product.name} · ${row.owner?.name ?? "—"}` : "Belum terpetakan ke product"}</span>
              {row.objective && <span className="block truncate text-[10px] text-muted-foreground" title={row.objective}>{row.objective.replace(/^OUTCOME_/, "").replaceAll("_", " ")}</span>}
              {!row.performance && <span className="block text-xs text-destructive">Metrik belum tersedia</span>}
            </TableCell>
            <TableCell><span className={cn("block text-xs", row.status === "active" ? "text-success" : "text-muted-foreground")} title={row.platformStatus}>{CAMPAIGN_STATUS_LABEL[row.status]}</span><span className="block text-xs tabular-nums">{campaignMoney(row.dailyBudget, row.currency)}</span><span className="block text-[10px] text-muted-foreground">{row.startDate ? formatDate(row.startDate, { day: "2-digit", month: "short" }) : "—"} → {row.endDate ? formatDate(row.endDate, { day: "2-digit", month: "short" }) : "ongoing"}</span></TableCell>
            {selected.map((c) => <TableCell key={c.key} className="text-right tabular-nums" title={c.help}>{metricText(row.performance, c)}</TableCell>)}
          </TableRow>)}
          {visible.length === 0 && <TableRow><TableCell colSpan={selected.length + 2} className="h-24 text-center text-muted-foreground">Tidak ada campaign yang cocok dengan pencarian.</TableCell></TableRow>}
          {visible.length > 0 && <TableRow className="bg-muted font-medium"><TableCell className="sm:sticky sm:left-0 z-10 bg-muted">Total {visible.length} campaign</TableCell><TableCell className="whitespace-normal text-xs text-muted-foreground">Sesuai filter & pencarian</TableCell>{selected.map((c) => <TableCell key={c.key} className="text-right tabular-nums">{metricText(totals, c)}</TableCell>)}</TableRow>}
        </TableBody>
      </Table>
      <p className="p-3 text-xs text-muted-foreground">{visible.length} dari {rows.length} campaign · Klik judul metrik untuk mengurutkan. Geser tabel untuk melihat kolom lainnya.</p>
      <details className="border-t p-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium text-foreground">Arti metrik & cara perhitungan</summary><dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{selected.map((c) => <div key={c.key}><dt className="font-medium text-foreground">{c.label}</dt><dd>{c.help}.</dd></div>)}</dl></details>
    </>}
  </Panel>;
}
