"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDownIcon, Grid2X2Icon, ImageIcon, InfoIcon, ListChecksIcon, LoaderIcon, RectangleHorizontalIcon, RotateCcwIcon, SparklesIcon, TrendingUpIcon, TriangleAlertIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { getCreativeAnalysisAction, startCreativeAnalysisAction } from "@/actions/ai-analysis";
import type { AdVerdict, AnalysedAd, CreativeAnalysisResult } from "@/lib/ai-ads-analysis";
import type { AnalysisView } from "@/lib/ai-analysis-data";
import { modelLabel } from "@/lib/ai-models";
import { fmt } from "@/lib/creatives";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/dashboard/panel";
import { buildMatrices, diagnoseAd, matrixContext } from "@/lib/ad-matrices";
import { AdMatrices, MatrixVerdict, useMatrixBenchmarks } from "./ad-matrices";
import { AudienceBreakdown, Change, ComparisonTiles, DailyTrend, DataGaps, PeriodComparison } from "./ai-analysis-insights";

const POLL_MS = 4000;

const STATUS: Record<CreativeAnalysisResult["status"], { label: string; variant: "success" | "warning" | "destructive" }> = {
  sehat: { label: "Sehat", variant: "success" },
  waspada: { label: "Waspada", variant: "warning" },
  kritis: { label: "Kritis", variant: "destructive" },
};

/** Ordered from what needs action first. */
const VERDICTS: { key: AdVerdict; label: string; className: string; badge: "destructive" | "warning" | "info" | "success" | "outline" }[] = [
  { key: "ganti", label: "Ganti sekarang", className: "border-l-destructive", badge: "destructive" },
  { key: "siapkan_pengganti", label: "Siapkan pengganti", className: "border-l-warning", badge: "warning" },
  { key: "pantau", label: "Pantau", className: "border-l-info", badge: "info" },
  { key: "naikkan_budget", label: "Naikkan budget bertahap", className: "border-l-success", badge: "success" },
  { key: "pertahankan", label: "Pertahankan", className: "border-l-success/50", badge: "success" },
  { key: "belum_cukup_data", label: "Belum cukup data", className: "border-l-border", badge: "outline" },
];

export function AiAnalysisPanel({
  initial,
  query,
  hasKey,
  canSetup,
  imagesSupported,
  modelLabel: currentModel,
}: {
  initial: AnalysisView | null;
  query: string;
  hasKey: boolean;
  /** Supervisor: may set the team's Kie key. */
  canSetup: boolean;
  imagesSupported: boolean;
  /** Model new analyses run on; a saved one shows its own. */
  modelLabel: string;
}) {
  const [analysis, setAnalysis] = React.useState(initial);
  const [starting, startTransition] = React.useTransition();
  const [target, setTarget] = React.useState(initial?.input.targetCostPerResult ? String(initial.input.targetCostPerResult) : "");
  const [context, setContext] = React.useState(initial?.input.businessContext ?? "");
  const [withMeta, setWithMeta] = React.useState(true);
  const [withImages, setWithImages] = React.useState(imagesSupported);
  const running = analysis?.status === "running";

  React.useEffect(() => {
    if (!running || !analysis) return;
    const timer = setTimeout(async () => {
      const res = await getCreativeAnalysisAction(analysis.id);
      if (!res.ok) return;
      setAnalysis(res.analysis);
      if (res.analysis.status === "done") toast.success("Analisa AI selesai");
      if (res.analysis.status === "failed") toast.error(res.analysis.error ?? "Analisa AI gagal");
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [running, analysis]);

  const start = () =>
    startTransition(async () => {
      const targetValue = target.replace(/[^\d]/g, "");
      const res = await startCreativeAnalysisAction({ query, targetCostPerResult: targetValue ? Number(targetValue) : null, businessContext: context.trim() || null, withMeta, withImages });
      if (res.ok) setAnalysis(res.analysis);
      else toast.error(res.error);
    });

  const form = (
    <div className="grid min-w-0 gap-3 @min-[700px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="grid content-start gap-1.5">
        <Label htmlFor="ai-target">Target biaya per hasil (opsional)</Label>
        <Input id="ai-target" inputMode="numeric" placeholder="misalnya 30000" value={target} onChange={(e) => setTarget(e.target.value)} disabled={running || starting} />
        <p className="text-xs text-muted-foreground">Kosongkan untuk membandingkan dengan rata-rata periode.</p>
      </div>
      <div className="grid content-start gap-1.5">
        <Label htmlFor="ai-context">Konteks bisnis (opsional)</Label>
        <Textarea
          id="ai-context"
          rows={2}
          maxLength={1000}
          placeholder="misalnya: produk umroh Rp30 juta, closing rate dari klik WA ±1%, sedang promo akhir tahun"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          disabled={running || starting}
        />
      </div>
      <div className="grid gap-2 @min-[700px]:col-span-2">
        <Option id="ai-meta" checked={withMeta} onChange={setWithMeta} disabled={running || starting}>
          Tarik data tambahan dari Meta: periode sebelumnya, tren harian, placement, umur dan gender
        </Option>
        {imagesSupported && (
          <Option id="ai-images" checked={withImages} onChange={setWithImages} disabled={running || starting}>
            Kirim gambar creative ke AI supaya visualnya ikut dinilai (maks. 6 iklan dengan spend terbesar)
          </Option>
        )}
      </div>
    </div>
  );

  return (
    <Panel
      title="Analisa AI"
      icon={SparklesIcon}
      iconPosition="left"
      action={<span className="text-xs text-muted-foreground">{currentModel} · Kie AI</span>}
      className="mb-4"
      bodyClassName="grid min-w-0 gap-4 p-4 sm:p-5"
    >
      {/* A saved analysis stays readable without a key; only running a new one needs it. */}
      {!hasKey ? (
        <p className="text-sm text-muted-foreground">
          {canSetup ? (
            <>
              Isi API key Kie.ai tim sekali untuk mengaktifkan Analisa AI bagi seluruh anggota.{" "}
              <Link href="/settings?tab=integrasi&service=kie-ai" className="font-medium text-foreground underline underline-offset-4">
                Buka Pengaturan → Integrasi → Kie AI
              </Link>
            </>
          ) : (
            "Analisa AI belum aktif. Minta supervisor mengisi API key Kie.ai tim di Pengaturan → Integrasi → Kie AI."
          )}
        </p>
      ) : (
        <>
          {analysis?.status === "done" && analysis.result ? (
            <details className="group/ai-form rounded-lg border">
              <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <RotateCcwIcon className="size-4 text-muted-foreground" /> Analisa ulang
                <ChevronDownIcon className="ml-auto size-4 transition-transform group-open/ai-form:rotate-180" />
              </summary>
              <div className="grid gap-3 border-t p-3">
                {form}
                <RunButton onClick={start} busy={starting} label="Analisa ulang dengan AI" />
              </div>
            </details>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                AI membaca angka iklan sesuai filter dan periode di atas (maks. 40 iklan dengan spend terbesar), lalu menulis diagnosa per iklan dan langkah yang perlu dilakukan. Setiap analisa memotong kredit Kie.ai; jumlahnya tercatat di hasil.
              </p>
              {form}
              {!running && <RunButton onClick={start} busy={starting} label="Analisa dengan AI" />}
            </>
          )}
        </>
      )}

      {running && analysis && (
        <div role="status" className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <LoaderIcon className="mt-0.5 size-4 shrink-0 animate-spin" />
          <div>
            <p className="font-medium">Menarik data dan menganalisa {fmt.num(analysis.input.ads.length)} iklan…</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Biasanya 1–2 menit. Halaman boleh ditinggal; hasil tersimpan dan muncul saat kembali.</p>
          </div>
        </div>
      )}

      {analysis?.status === "failed" && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>{analysis.error ?? "Analisa gagal."}</span>
        </div>
      )}

      {analysis?.status === "done" && analysis.result && <AnalysisResult analysis={analysis} result={analysis.result} />}
    </Panel>
  );
}

function Option({ id, checked, onChange, disabled, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} disabled={disabled} className="mt-0.5" />
      <Label htmlFor={id} className="text-sm leading-snug font-normal">{children}</Label>
    </div>
  );
}

function RunButton({ onClick, busy, label }: { onClick: () => void; busy: boolean; label: string }) {
  return (
    <div>
      <Button type="button" onClick={onClick} disabled={busy}>
        {busy ? <LoaderIcon className="animate-spin" /> : <SparklesIcon />} {label}
      </Button>
    </div>
  );
}

type TabKey = "summary" | "ads" | "matrix" | "trend" | "audience" | "notes";

/** The finished analysis: headline and key numbers on top, the details in tabs. */
function AnalysisResult({ analysis, result }: { analysis: AnalysisView; result: CreativeAnalysisResult }) {
  const ads = new Map(analysis.input.ads.map((a) => [a.ref, a]));
  const status = STATUS[result.status];
  const { input } = analysis;
  const enrichment = input.enrichment;
  // Matrices are computed here from the stored numbers, so editing a benchmark redraws them without a new AI run.
  const [benchmarks, setBenchmarks] = useMatrixBenchmarks();
  const matrices = React.useMemo(
    () => buildMatrices(input.ads, matrixContext(input.ads, benchmarks, { targetCostPerResult: input.targetCostPerResult, averageCostPerResult: input.totals.costPerResult })),
    [input, benchmarks],
  );
  const gaps = enrichment?.gaps ?? [];
  const urgent = result.ads.filter((a) => a.verdict === "ganti" || a.verdict === "siapkan_pengganti").length;
  const hasTrend = !!enrichment && (!!enrichment.comparison || enrichment.daily.length > 0);
  const hasAudience = !!enrichment && (["placement", "age", "gender"] as const).some((k) => enrichment.breakdowns[k].length > 0);
  const tabs: { key: TabKey; label: string; icon: LucideIcon; count?: number; alert?: boolean }[] = [
    { key: "summary", label: "Ringkasan", icon: ListChecksIcon, count: result.actions.length },
    { key: "ads", label: "Per iklan", icon: RectangleHorizontalIcon, count: result.ads.length, alert: urgent > 0 },
    ...(matrices.length ? [{ key: "matrix" as const, label: "Matriks", icon: Grid2X2Icon, count: matrices.length }] : []),
    ...(hasTrend ? [{ key: "trend" as const, label: "Tren", icon: TrendingUpIcon }] : []),
    ...(hasAudience ? [{ key: "audience" as const, label: "Audiens", icon: UsersIcon, count: result.audience.length || undefined }] : []),
    ...(gaps.length || result.dataNotes ? [{ key: "notes" as const, label: "Catatan data", icon: InfoIcon, count: gaps.length || undefined, alert: gaps.length > 0 }] : []),
  ];
  const [tab, setTab] = React.useState<TabKey>("summary");
  const active = tabs.some((t) => t.key === tab) ? tab : "summary";
  const go = (key: TabKey) => setTab(key);

  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid gap-2 rounded-xl border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={status.variant}>{status.label}</Badge>
          <span>
            {input.period.start} – {input.period.end} · {fmt.num(input.totals.ads)} iklan
            {input.others && ` (${fmt.num(input.ads.length)} terbesar dianalisa)`} · dianalisa {analysis.createdLabel} WIB
            {analysis.model && ` · ${modelLabel(analysis.model)}`}
            {analysis.credits !== null && ` · ≈ ${analysis.credits.toLocaleString("id-ID", { maximumFractionDigits: 2 })} kredit`}
          </span>
        </div>
        <p className="text-lg leading-snug font-semibold tracking-tight">{result.headline}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{result.summary}</p>
        {input.scope.length > 0 && <p className="text-xs text-muted-foreground">Filter: {input.scope.join(" · ")}</p>}
        {urgent > 0 && (
          <button type="button" onClick={() => go("ads")} className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/15">
            <TriangleAlertIcon className="size-3.5" /> {urgent} iklan perlu diganti / disiapkan penggantinya
          </button>
        )}
      </div>

      {enrichment?.comparison && <ComparisonTiles comparison={enrichment.comparison} />}

      <div className="min-w-0">
        <div role="tablist" aria-label="Bagian analisa" className="-mx-1 flex gap-1 overflow-x-auto overflow-y-hidden border-b px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(({ key, label, icon: Icon, count, alert }) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`ai-tab-${key}`}
              aria-selected={active === key}
              aria-controls={`ai-panel-${key}`}
              onClick={() => go(key)}
              className={cn(
                "relative -mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                active === key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
              {count !== undefined && (
                <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", alert ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>{count}</span>
              )}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`ai-panel-${active}`} aria-labelledby={`ai-tab-${active}`} className="min-w-0 pt-4">
          {active === "summary" && <SummaryTab result={result} ads={ads} />}
          {active === "ads" && <AdsTab result={result} ads={ads} matrices={matrices} />}
          {active === "matrix" && (
            <AdMatrices results={matrices} ads={input.ads} benchmarks={benchmarks} onBenchmarks={setBenchmarks} insufficient={input.ads.filter((a) => !a.sufficientData).length} />
          )}
          {active === "trend" && enrichment && (
            <div className="grid min-w-0 gap-5">
              {enrichment.comparison && <PeriodComparison comparison={enrichment.comparison} trend={result.trend} />}
              {enrichment.daily.length > 0 && <DailyTrend enrichment={enrichment} trend={result.trend} />}
            </div>
          )}
          {active === "audience" && enrichment && <AudienceBreakdown enrichment={enrichment} insights={result.audience} />}
          {active === "notes" && (
            <div className="grid min-w-0 gap-3">
              <DataGaps gaps={gaps} />
              {result.dataNotes && <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">Catatan data: {result.dataNotes}</p>}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Hasil AI bisa keliru. Cek angka di tabel sebelum mematikan iklan atau mengubah budget. Angka acuan: CTR {fmt.pct(input.benchmarks.ctrPct)}, hook rate {fmt.pct(input.benchmarks.hookRatePct)}, hold rate {fmt.pct(input.benchmarks.holdRatePct)} (patokan umum, bukan angka resmi Meta).
      </p>
    </div>
  );
}

function SummaryTab({ result, ads }: { result: CreativeAnalysisResult; ads: Map<number, AnalysedAd> }) {
  return (
    <div className="grid min-w-0 gap-5 @min-[800px]:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <section className="min-w-0">
        <h3 className="text-sm font-semibold">Yang perlu kamu tahu</h3>
        <ul className="mt-2 grid gap-2">
          {result.findings.map((f, i) => (
            <li key={i} className="rounded-lg border bg-card p-3 text-sm">
              <p className="font-medium">{f.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{f.detail}</p>
            </li>
          ))}
        </ul>
      </section>
      {/* Actions first on phones, on the right on wide screens. */}
      <section className="order-first min-w-0 @min-[800px]:order-none">
        <h3 className="text-sm font-semibold">Yang perlu dilakukan</h3>
        <ol className="mt-2 grid gap-2">
          {result.actions.map((a, i) => (
            <li key={i} className="flex min-w-0 gap-3 rounded-lg border bg-card p-3 text-sm">
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>{i + 1}</span>
              <div className="min-w-0">
                <p className="font-medium">{a.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{a.detail}</p>
                {a.refs.length > 0 && (
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    {a.refs.map((ref) => (
                      <AdChip key={ref} ad={ads.get(ref)} />
                    ))}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function AdsTab({ result, ads, matrices }: { result: CreativeAnalysisResult; ads: Map<number, AnalysedAd>; matrices: ReturnType<typeof buildMatrices> }) {
  const present = VERDICTS.filter((v) => result.ads.some((a) => a.verdict === v.key));
  const [filter, setFilter] = React.useState<AdVerdict | "all">("all");
  const shown = present.filter((v) => filter === "all" || v.key === filter);
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Saring keputusan">
        {[{ key: "all" as const, label: "Semua", n: result.ads.length }, ...present.map((v) => ({ key: v.key, label: v.label, n: result.ads.filter((a) => a.verdict === v.key).length }))].map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn("rounded-full border px-3 py-1 text-xs transition-colors", filter === f.key ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}
          >
            {f.label} <span className="tabular-nums opacity-80">{f.n}</span>
          </button>
        ))}
      </div>
      {/* One grid ordered from what needs action first, the verdict on each card. */}
      <div className="grid min-w-0 gap-2 @min-[900px]:grid-cols-2">
        {shown.flatMap((v) => result.ads.filter((a) => a.verdict === v.key).map((item) => {
          const ad = ads.get(item.ref);
          return (
            <article key={item.ref} className={cn("min-w-0 rounded-lg border border-l-4 bg-card p-3", v.className)}>
              <div className="flex min-w-0 items-start gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">{item.ref}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={ad?.name}>{ad?.name ?? `Iklan ${item.ref}`}</p>
                  {ad && <p className="truncate text-xs text-muted-foreground" title={adFacts(ad)}>{adFacts(ad)}</p>}
                  {ad && <PreviousLine ad={ad} />}
                </div>
                <Badge variant={v.badge} className="shrink-0">{v.label}</Badge>
              </div>
              <p className="mt-2 text-sm font-medium">{item.problem}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.reason}</p>
              <p className="mt-1.5 text-xs leading-relaxed"><span className="font-medium">Saran:</span> {item.suggestion}</p>
              {item.visual && (
                <p className="mt-1.5 flex gap-1.5 text-xs leading-relaxed">
                  <ImageIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span><span className="font-medium">Visual:</span> {item.visual}</span>
                </p>
              )}
              {ad && matrices.length > 0 && <MatrixVerdict diagnosis={diagnoseAd(ad, matrices)} />}
            </article>
          );
        }))}
      </div>
    </div>
  );
}

function adFacts(ad: AnalysedAd) {
  return [ad.campaign, `spend ${fmt.rp(ad.spend)}`, `${fmt.num(ad.results)} hasil`, ad.costPerResult !== null ? `${fmt.rp(ad.costPerResult)}/hasil` : null, ad.ctrPct !== null ? `CTR ${fmt.pct(ad.ctrPct)}` : null]
    .filter(Boolean)
    .join(" · ");
}

/** The ad against the previous period, when it was pulled. */
function PreviousLine({ ad }: { ad: AnalysedAd }) {
  if (ad.previous === undefined) return null;
  if (ad.previous === null) return <p className="text-xs text-muted-foreground">Baru di periode ini</p>;
  const { change } = ad.previous;
  if (change.costPerResult === null && change.ctr === null) return null;
  return (
    <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
      vs periode lalu:
      {change.costPerResult !== null && <span>biaya/hasil <Change value={change.costPerResult} upIsGood={false} /></span>}
      {change.ctr !== null && <span>CTR <Change value={change.ctr} upIsGood /></span>}
    </p>
  );
}

function AdChip({ ad }: { ad: AnalysedAd | undefined }) {
  if (!ad) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-[11px]">
      <span className="font-semibold">{ad.ref}</span>
      <span className="truncate">{ad.name}</span>
    </span>
  );
}
