"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUpIcon, ChevronRightIcon, FolderIcon, ImageIcon, LayoutGridIcon, LoaderIcon, MegaphoneIcon, RectangleHorizontalIcon, RotateCcwIcon, SearchIcon, TriangleAlertIcon, XIcon, type LucideIcon } from "lucide-react";
import { getAdLevelsAction } from "@/actions/campaign-insights";
import type { Campaign } from "@/db/schema";
import { CAMPAIGN_STATUS_LABEL, PLATFORM_DOT, PLATFORM_LABEL } from "@/lib/labels";
import { cn, formatDate } from "@/lib/utils";
import { campaignMoney, derivedCampaignMetrics, totalCampaignMetrics, type CampaignMetrics } from "@/lib/campaign-metrics";
import { MAX_LEVEL_CAMPAIGNS, type BreakdownAd, type BreakdownAdSet, type CampaignBreakdown, type TreeStatus } from "@/lib/campaign-tree";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampaignAiAnalysis, type CampaignAiOptions } from "./campaign-ai-analysis";

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
type Level = "campaign" | "adset" | "ad";
type Status = TreeStatus;

/** One row of any level, in the shape the table draws. */
type LevelRow = {
  key: string;
  name: string;
  /** Second line: where it sits (account / campaign / ad set) and who owns it. */
  context: string;
  note?: string;
  warn?: boolean;
  status: Status;
  statusTitle?: string;
  budget: string;
  budgetNote?: string;
  thumbnailUrl?: string | null;
  metrics: CampaignMetrics | null;
  campaign?: AdCampaignRow;
};

const STATUS_LABEL: Record<Status, string> = { active: "Active", paused: "Paused", ended: "Ended", draft: "Draft" };
const STATUS_DOT: Record<Status, string> = { active: "bg-success", paused: "bg-muted-foreground/50", ended: "bg-muted-foreground/30", draft: "bg-warning" };
const OPTIMIZATION: Record<string, string> = {
  LEAD_GENERATION: "Lead", QUALITY_LEAD: "Lead berkualitas", OFFSITE_CONVERSIONS: "Konversi", CONVERSATIONS: "Percakapan",
  LANDING_PAGE_VIEWS: "Landing page view", LINK_CLICKS: "Link click", REACH: "Reach", IMPRESSIONS: "Impression",
  THRUPLAY: "ThruPlay", POST_ENGAGEMENT: "Engagement", VALUE: "Nilai konversi", APP_INSTALLS: "Install aplikasi",
};
const LEVELS: { id: Level; label: string; icon: LucideIcon }[] = [
  { id: "campaign", label: "Campaign", icon: FolderIcon },
  { id: "adset", label: "Ad set", icon: LayoutGridIcon },
  { id: "ad", label: "Iklan", icon: RectangleHorizontalIcon },
];
const delivered = (m: CampaignMetrics | null) => !!m && ((m.spent ?? 0) > 0 || (m.impressions ?? 0) > 0);
const NAME_W = 320, STATUS_W = 112, BUDGET_W = 150, CHECK_W = 40;

type LevelData = { key: string; state: "loading" } | { key: string; state: "error"; error: string } | { key: string; state: "ok"; byCampaign: Map<number, CampaignBreakdown>; errors: string[] };

/**
 * Campaign Ads as in Meta Ads Manager: tabs Campaign → Ad set → Iklan. Ticking campaigns (or clicking a
 * name) narrows the next level to them; without a selection the next level shows everything that ran in
 * the period. Ad sets and ads are read live from Meta / Google when their tab opens.
 */
export function AdCampaignsTable({ rows, emptyAction, period, ai }: { rows: AdCampaignRow[]; emptyAction: React.ReactNode; period: string; ai: CampaignAiOptions }) {
  const [level, setLevel] = useState<Level>("campaign");
  const [view, setView] = useState("summary");
  const [search, setSearch] = useState("");
  const [onlyDelivered, setOnlyDelivered] = useState(true);
  const [sort, setSort] = useState<{ key: MetricKey; desc: boolean }>({ key: "spent", desc: true });
  const [pickedCampaigns, setPickedCampaigns] = useState<Set<number>>(() => new Set());
  const [pickedAdsets, setPickedAdsets] = useState<Set<string>>(() => new Set());
  const [data, setData] = useState<LevelData | null>(null);
  const [reload, setReload] = useState(0);

  const campaignById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  // The campaigns the Ad set / Iklan tabs read: the ticked ones, else every campaign that ran in the period.
  const scopeIds = useMemo(() => {
    const ids = pickedCampaigns.size ? [...pickedCampaigns] : rows.filter((r) => delivered(r.performance)).map((r) => r.id);
    return ids.sort((a, b) => (campaignById.get(b)?.performance?.spent ?? 0) - (campaignById.get(a)?.performance?.spent ?? 0)).slice(0, MAX_LEVEL_CAMPAIGNS);
  }, [pickedCampaigns, rows, campaignById]);
  const scopeTrimmed = (pickedCampaigns.size || rows.filter((r) => delivered(r.performance)).length) > MAX_LEVEL_CAMPAIGNS;
  const dataKey = `${period}:${[...scopeIds].sort((a, b) => a - b).join(",")}:${reload}`;

  // The last scope asked for; an answer for an older scope is dropped.
  const requested = useRef<string | null>(null);
  useEffect(() => {
    if (level === "campaign" || !scopeIds.length || requested.current === dataKey) return;
    requested.current = dataKey;
    const settle = (next: LevelData) => setData((prev) => (requested.current === dataKey ? next : prev));
    setData({ key: dataKey, state: "loading" });
    getAdLevelsAction({ ids: scopeIds, period })
      .then((res) => settle(res.ok
        ? { key: dataKey, state: "ok", byCampaign: new Map(res.breakdowns.map((b) => [b.id, b.breakdown])), errors: res.errors }
        : { key: dataKey, state: "error", error: res.error }))
      .catch(() => settle({ key: dataKey, state: "error", error: "Ad set gagal dimuat. Coba lagi." }));
  }, [level, dataKey, scopeIds, period]);

  const loaded = data?.key === dataKey && data.state === "ok" ? data : null;
  const adsetEntries = useMemo(() => !loaded ? [] : scopeIds.flatMap((id) => {
    const breakdown = loaded.byCampaign.get(id);
    const campaign = campaignById.get(id);
    return breakdown && campaign ? breakdown.adsets.map((set) => ({ key: `${id}:${set.id}`, set, campaign, currency: breakdown.currency })) : [];
  }), [loaded, scopeIds, campaignById]);

  const levelRows: LevelRow[] = useMemo(() => {
    if (level === "campaign") {
      return rows.map((r) => ({
        key: String(r.id), name: r.name, campaign: r, metrics: r.performance,
        context: [`${PLATFORM_LABEL[r.platform]} · ${r.accountName}`, r.product ? `${r.product.name} · ${r.owner?.name ?? "—"}` : null].filter(Boolean).join("  ·  "),
        note: r.product ? undefined : "Belum terpetakan ke product", warn: !r.product,
        status: r.status, statusTitle: r.platformStatus,
        budget: perDay(r.dailyBudget, r.currency) ?? (r.currency ? "Budget di ad set" : "—"),
        budgetNote: `${r.startDate ? formatDate(r.startDate, { day: "2-digit", month: "short" }) : "—"} → ${r.endDate ? formatDate(r.endDate, { day: "2-digit", month: "short" }) : "ongoing"}`,
      }));
    }
    if (level === "adset") {
      return adsetEntries.map(({ key, set, campaign, currency }) => adsetRow(key, set, campaign, currency));
    }
    return adsetEntries.filter((e) => !pickedAdsets.size || pickedAdsets.has(e.key)).flatMap(({ key, set, campaign }) => set.ads.map((ad) => adRow(`${key}:${ad.id}`, ad, set, campaign)));
  }, [level, rows, adsetEntries, pickedAdsets]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return levelRows
      .filter((r) => (!q || `${r.name} ${r.context}`.toLowerCase().includes(q)) && (!onlyDelivered || delivered(r.metrics) || r.status === "active"))
      .sort((a, b) => {
        const av = a.metrics ? derivedCampaignMetrics(a.metrics)[sort.key] : null;
        const bv = b.metrics ? derivedCampaignMetrics(b.metrics)[sort.key] : null;
        if (av === null) return bv === null ? a.name.localeCompare(b.name) : 1;
        if (bv === null) return -1;
        return (sort.desc ? bv - av : av - bv) || a.name.localeCompare(b.name);
      });
  }, [levelRows, search, onlyDelivered, sort]);

  const keys = [...views.find((v) => v.id === view)!.keys];
  if (view === "summary" && rows.some((r) => r.platform === "google")) keys.push("conversions", "costPerConversion");
  const selected = keys.map((key) => columns.find((c) => c.key === key)!);
  const tableWidth = CHECK_W + NAME_W + STATUS_W + BUDGET_W + selected.reduce((width, column) => width + metricWidth(column), 0);
  // Rows whose numbers failed to load are left out of the total (and said so), instead of blanking it.
  const measured = visible.filter((r) => r.metrics);
  const totals = totalCampaignMetrics(measured.map((r) => r.metrics));

  // Ticking works on the Campaign and Ad set tabs (an ad is the last level).
  const canPick = level !== "ad";
  const isPicked = (key: string) => (level === "campaign" ? pickedCampaigns.has(Number(key)) : level === "adset" && pickedAdsets.has(key));
  const togglePick = (key: string) => {
    if (level === "campaign") setPickedCampaigns((prev) => toggled(prev, Number(key)));
    else if (level === "adset") setPickedAdsets((prev) => toggled(prev, key));
  };
  const allPicked = canPick && visible.length > 0 && visible.every((r) => isPicked(r.key));
  const pickAll = (on: boolean) => {
    if (level === "campaign") setPickedCampaigns(on ? new Set(visible.map((r) => Number(r.key))) : new Set());
    if (level === "adset") setPickedAdsets(on ? new Set(visible.map((r) => r.key)) : new Set());
  };
  // Clicking a name opens the next level for just that item, like Ads Manager.
  const drill = (row: LevelRow) => {
    if (level === "campaign") {
      setPickedCampaigns(new Set([Number(row.key)]));
      setPickedAdsets(new Set());
      setLevel("adset");
    } else if (level === "adset") {
      setPickedAdsets(new Set([row.key]));
      setLevel("ad");
    }
  };
  const clearCampaigns = () => {
    setPickedCampaigns(new Set());
    setPickedAdsets(new Set());
  };

  const levelCount = (id: Level) => (id === "campaign" ? pickedCampaigns.size : id === "adset" ? pickedAdsets.size : 0);
  const loading = level !== "campaign" && scopeIds.length > 0 && (!data || data.key !== dataKey || data.state === "loading");
  const levelError = level !== "campaign" && data?.key === dataKey && data.state === "error" ? data.error : null;
  const partialErrors = level !== "campaign" && loaded?.errors.length ? loaded.errors : [];
  const unit = level === "campaign" ? "campaign" : level === "adset" ? "ad set" : "iklan";

  return <Panel title="Campaign Ads" icon={MegaphoneIcon} iconPosition="left" bodyClassName="overflow-hidden">
    {rows.length === 0 ? <EmptyState icon={MegaphoneIcon} title="Tidak ada campaign" description="Coba ubah filter, atau tambahkan akun iklan dan sinkronkan campaign dari Ads." action={emptyAction} /> : <>
      <div role="tablist" aria-label="Level" className="flex overflow-x-auto border-b bg-muted/30">
        {LEVELS.map(({ id, label, icon: Icon }) => {
          const count = levelCount(id);
          const active = level === id;
          return <div key={id} className={cn("relative flex shrink-0 items-center border-r", active ? "bg-card" : "hover:bg-muted/60")}>
            <button type="button" role="tab" aria-selected={active} onClick={() => setLevel(id)} className={cn("flex items-center gap-2 py-2.5 pl-4 text-sm", count ? "pr-1" : "pr-4", active ? "font-semibold text-foreground" : "text-muted-foreground")}>
              <Icon className="size-4" />{label}
            </button>
            {count > 0 && <span className="mr-3 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
              {count} dipilih
              <button type="button" aria-label={`Hapus pilihan ${label}`} onClick={() => (id === "campaign" ? clearCampaigns() : setPickedAdsets(new Set()))} className="rounded-full hover:bg-primary-foreground/20"><XIcon className="size-3" /></button>
            </span>}
            {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
          </div>;
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative min-w-0 basis-full sm:max-w-xs sm:flex-1 sm:basis-auto"><SearchIcon className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" /><Input aria-label={`Cari ${unit}`} placeholder={level === "campaign" ? "Cari campaign, product, owner…" : `Cari ${unit} atau campaign…`} value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-full pl-8 text-xs" /></div>
        <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-xs">
          <Checkbox checked={onlyDelivered} onCheckedChange={(v) => setOnlyDelivered(v === true)} aria-label="Hanya yang tayang" />
          Hanya yang aktif / tayang
        </label>
        <Select value={view} onValueChange={setView}>
          <SelectTrigger className="h-8 w-auto gap-1.5 text-xs" aria-label="Kolom metrik"><span className="text-muted-foreground">Kolom:</span> <SelectValue /></SelectTrigger>
          <SelectContent>{views.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}</SelectContent>
        </Select>
        {level !== "campaign" && <span className="text-xs text-muted-foreground">
          {pickedCampaigns.size ? `Dari ${pickedCampaigns.size} campaign terpilih` : `Dari ${scopeIds.length} campaign yang tayang di periode ini`}
          {level === "ad" && pickedAdsets.size > 0 && ` · ${pickedAdsets.size} ad set terpilih`}
          {scopeTrimmed && ` (${MAX_LEVEL_CAMPAIGNS} dengan spend terbesar)`}
        </span>}
      </div>

      {partialErrors.length > 0 && <div className="flex items-start gap-2 border-b bg-destructive/5 px-3 py-2 text-xs text-destructive" role="status"><TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" /><span>{partialErrors.join(" · ")}</span></div>}

      {level !== "campaign" && !scopeIds.length ? (
        <p className="p-8 text-center text-sm text-muted-foreground">Tidak ada campaign yang tayang di periode ini. Centang campaign di tab Campaign untuk melihat ad set-nya.</p>
      ) : loading ? (
        <p className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><LoaderIcon className="size-4 animate-spin" /> Memuat {unit} dari {scopeIds.length} campaign…</p>
      ) : levelError ? (
        <p className="flex flex-wrap items-center justify-center gap-2 p-8 text-sm text-destructive"><TriangleAlertIcon className="size-4" /> {levelError}
          <button type="button" onClick={() => setReload((n) => n + 1)} className="inline-flex items-center gap-1 text-foreground underline underline-offset-4"><RotateCcwIcon className="size-3.5" /> Coba lagi</button></p>
      ) : (
      <Table aria-label={`Metrik ${unit}`} className="table-fixed border-separate border-spacing-0 text-[13px] [&_td]:border-b [&_td]:border-r [&_td]:border-border [&_td:last-child]:border-r-0 [&_th]:border-r [&_th]:border-b [&_th]:border-border [&_th:last-child]:border-r-0" style={{ minWidth: tableWidth }} containerProps={{ role: "region", "aria-label": `Tabel ${unit}, geser untuk melihat semua metrik`, tabIndex: 0, className: "max-h-[70vh] overscroll-x-contain focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset" }}>
        <colgroup>
          <col style={{ width: CHECK_W }} />
          <col style={{ width: NAME_W }} />
          <col style={{ width: STATUS_W }} />
          <col style={{ width: BUDGET_W }} />
          {selected.map((c) => <col key={c.key} style={{ width: metricWidth(c) }} />)}
        </colgroup>
        <TableHeader className="sticky top-0 z-20 bg-muted"><TableRow>
          <TableHead className="z-10 bg-muted px-3 sm:sticky sm:left-0">{canPick && <Checkbox checked={allPicked} onCheckedChange={(v) => pickAll(v === true)} aria-label={`Pilih semua ${unit}`} />}</TableHead>
          <TableHead scope="col" className="z-10 bg-muted sm:sticky" style={{ left: CHECK_W }}>{LEVELS.find((l) => l.id === level)!.label}</TableHead>
          <TableHead scope="col">Penayangan</TableHead>
          <TableHead scope="col">Budget</TableHead>
          {selected.map((c) => <TableHead scope="col" key={c.key} className="text-right" aria-sort={sort.key === c.key ? sort.desc ? "descending" : "ascending" : "none"} title={c.help}><button type="button" className="inline-flex items-center gap-1 py-2" onClick={() => setSort({ key: c.key, desc: sort.key === c.key ? !sort.desc : true })}>{c.label}{sort.key === c.key && <ArrowDownUpIcon className="size-3" />}</button></TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {visible.map((row) => {
            const on = isPicked(row.key);
            return <TableRow key={row.key} data-state={on ? "selected" : undefined} className="group">
              <TableCell className={cn("z-10 px-3 sm:sticky sm:left-0", on ? "bg-muted" : "bg-card group-hover:bg-muted")}>{canPick && <Checkbox checked={on} onCheckedChange={() => togglePick(row.key)} aria-label={`Pilih ${row.name}`} />}</TableCell>
              <TableCell className={cn("z-10 py-2.5 whitespace-normal sm:sticky", on ? "bg-muted" : "bg-card group-hover:bg-muted")} style={{ left: CHECK_W }}>
                <div className="flex min-w-0 items-start gap-2.5">
                  {level === "ad" && <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">{row.thumbnailUrl ? <img src={row.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <ImageIcon className="size-4 text-muted-foreground" />}</span>}
                  <div className="min-w-0 flex-1">
                    {level === "ad" ? <span className="line-clamp-2 font-medium leading-snug break-words" title={row.name}>{row.name}</span>
                      : <button type="button" onClick={() => drill(row)} className="group/name inline-flex max-w-full items-start gap-0.5 text-left font-medium leading-snug text-primary hover:underline" title={`Lihat ${level === "campaign" ? "ad set" : "iklan"} di ${row.name}`}>
                          <span className="line-clamp-2 break-words">{row.name}</span><ChevronRightIcon className="mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover/name:opacity-100" />
                        </button>}
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={row.context}>{row.context}</span>
                    {row.note && <span className={cn("block truncate text-[11px]", row.warn ? "text-warning" : "text-muted-foreground")} title={row.note}>{row.note}</span>}
                    {row.campaign && <span className="mt-1 -ml-1.5 flex items-center gap-1"><CampaignAiAnalysis campaignId={row.campaign.id} campaignName={row.campaign.name} period={period} ai={ai} /></span>}
                  </div>
                </div>
              </TableCell>
              <TableCell className="py-2.5 whitespace-normal">
                <span className="inline-flex items-center gap-1.5 text-xs" title={row.statusTitle}><span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[row.status])} />{STATUS_LABEL[row.status]}</span>
                {!row.metrics && <span className="mt-0.5 block text-[11px] text-destructive">Metrik gagal dimuat</span>}
              </TableCell>
              <TableCell className="py-2.5 whitespace-normal">
                <span className="block text-xs tabular-nums">{row.budget}</span>
                {row.budgetNote && <span className="block text-[11px] text-muted-foreground">{row.budgetNote}</span>}
              </TableCell>
              {selected.map((c) => <TableCell key={c.key} className="text-right tabular-nums" title={c.help}>{metricText(row.metrics, c)}</TableCell>)}
            </TableRow>;
          })}
          {visible.length === 0 && <TableRow><TableCell colSpan={selected.length + 4} className="h-24 text-center whitespace-normal text-muted-foreground">{levelRows.length ? `Tidak ada ${unit} yang cocok dengan pencarian atau filter.` : `Tidak ada ${unit} pada periode ini.`}</TableCell></TableRow>}
          {visible.length > 0 && <TableRow className="bg-muted font-medium hover:bg-muted"><TableCell className="z-10 bg-muted sm:sticky sm:left-0" /><TableCell className="z-10 bg-muted whitespace-normal sm:sticky" style={{ left: CHECK_W }}>Total {measured.length} {unit}</TableCell><TableCell colSpan={2} className="text-xs whitespace-normal text-muted-foreground">{measured.length < visible.length ? `Tanpa ${visible.length - measured.length} yang gagal dimuat` : "Sesuai filter & pencarian"}</TableCell>{selected.map((c) => <TableCell key={c.key} className="text-right tabular-nums">{metricText(totals, c)}</TableCell>)}</TableRow>}
        </TableBody>
      </Table>)}
      <p className="p-3 text-xs text-muted-foreground">{visible.length} dari {levelRows.length} {unit} · Klik nama untuk membuka ad set / iklannya, atau centang beberapa lalu pindah tab. Klik judul metrik untuk mengurutkan.</p>
      <details className="border-t p-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium text-foreground">Arti metrik & cara perhitungan</summary><dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{selected.map((c) => <div key={c.key}><dt className="font-medium text-foreground">{c.label}</dt><dd>{c.help}.</dd></div>)}</dl></details>
    </>}
  </Panel>;
}

/** "Rp100.000/hari", or null when there is no daily budget or its currency is unknown. */
function perDay(value: number | null, currency: string | null) {
  return value !== null && currency ? `${campaignMoney(value, currency)}/hari` : null;
}

function toggled<T>(set: Set<T>, value: T) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function adsetRow(key: string, set: BreakdownAdSet, campaign: AdCampaignRow, currency: string): LevelRow {
  const optimisation = set.optimizationGoal ? OPTIMIZATION[set.optimizationGoal] ?? set.optimizationGoal.replaceAll("_", " ").toLowerCase() : null;
  return {
    key, name: set.name, metrics: set.metrics,
    context: `${campaign.name}  ·  ${set.ads.length} iklan`,
    note: set.audience ?? undefined,
    status: set.status, statusTitle: set.platformStatus ?? undefined,
    budget: perDay(set.dailyBudget, currency) ?? (set.lifetimeBudget !== null ? `${campaignMoney(set.lifetimeBudget, currency)} total` : campaign.platform === "google" ? "Budget di campaign" : "Budget campaign (CBO)"),
    budgetNote: optimisation ? `Optimasi: ${optimisation}` : undefined,
  };
}

function adRow(key: string, ad: BreakdownAd, set: BreakdownAdSet, campaign: AdCampaignRow): LevelRow {
  return {
    key, name: ad.name, metrics: ad.metrics, thumbnailUrl: ad.thumbnailUrl,
    // Campaign first: ad set names are often reused across campaigns ("Umur 21-50 education").
    context: `${campaign.name}  ·  ${set.name}`,
    status: ad.status, statusTitle: ad.platformStatus ?? undefined,
    budget: "Ikut ad set",
  };
}
