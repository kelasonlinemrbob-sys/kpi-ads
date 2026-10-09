"use client";

import * as React from "react";
import Link from "next/link";
import { LightbulbIcon, LoaderIcon, RotateCcwIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { getSeoAnalysisAction, startSeoAnalysisAction } from "@/actions/seo-analysis";
import type { SeoAnalysisView } from "@/lib/ai-analysis-data";
import type { SeoAnalysisResult } from "@/lib/ai-seo-analysis";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const POLL_MS = 4000;
const STATUS: Record<SeoAnalysisResult["status"], { label: string; variant: "success" | "info" | "warning" }> = {
  tumbuh: { label: "Tumbuh", variant: "success" },
  stabil: { label: "Stabil", variant: "info" },
  menurun: { label: "Menurun", variant: "warning" },
};
const PRIORITY: Record<SeoAnalysisResult["actions"][number]["priority"], "destructive" | "warning" | "outline"> = { tinggi: "destructive", sedang: "warning", rendah: "outline" };
const VERDICT: Record<SeoAnalysisResult["keywords"][number]["verdict"], { label: string; variant: "success" | "info" | "warning" | "destructive" }> = {
  pertahankan: { label: "Pertahankan", variant: "success" },
  optimasi: { label: "Optimasi", variant: "info" },
  perbaiki_ctr: { label: "Perbaiki CTR", variant: "warning" },
  pulihkan: { label: "Pulihkan", variant: "destructive" },
};
const scoreTone = (n: number) => (n >= 8 ? "text-success" : n >= 5 ? "text-foreground" : "text-destructive");

export type SeoAiOptions = { modelLabel: string; canRun: boolean; needsKey: boolean; canSetup: boolean };

/** Analisa AI tab of the SEO page: one property and period, shared with everyone who can see the property. */
export function SeoAiAnalysis({ site, start, end, ai, onState }: { site: string; start: string; end: string; ai: SeoAiOptions; onState?: (state: "none" | "running" | "done") => void }) {
  const [analysis, setAnalysis] = React.useState<SeoAnalysisView | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [starting, startTransition] = React.useTransition();
  const running = analysis?.status === "running";

  React.useEffect(() => {
    let live = true;
    getSeoAnalysisAction({ site, start, end }).then((res) => {
      if (!live) return;
      if (res.ok) setAnalysis(res.analysis);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [site, start, end]);

  React.useEffect(() => {
    onState?.(!analysis ? "none" : analysis.status === "running" ? "running" : analysis.status === "done" ? "done" : "none");
  }, [analysis, onState]);

  React.useEffect(() => {
    if (!running || !analysis) return;
    const timer = setTimeout(async () => {
      const res = await getSeoAnalysisAction({ analysisId: analysis.id });
      if (!res.ok || !res.analysis) return;
      setAnalysis(res.analysis);
      if (res.analysis.status === "done") toast.success("Analisa SEO selesai");
      if (res.analysis.status === "failed") toast.error(res.analysis.error ?? "Analisa SEO gagal");
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [running, analysis]);

  const start_ = () =>
    startTransition(async () => {
      const res = await startSeoAnalysisAction({ site, start, end });
      if (res.ok) setAnalysis(res.analysis);
      else toast.error(res.error);
    });
  const done = analysis?.status === "done" && analysis.result ? analysis : null;

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {ai.modelLabel} membaca klik, impresi, CTR dan posisi website ini (dibanding periode sebelumnya), kata kunci dan halaman teratas, serta daftar peluang, lalu menulis
          diagnosa dan langkah untuk tim SEO.
        </p>
        {ai.canRun && !running && loaded && (
          <Button type="button" size="sm" variant={done ? "outline" : "default"} onClick={start_} disabled={starting}>
            {starting ? <LoaderIcon className="animate-spin" /> : done ? <RotateCcwIcon /> : <SparklesIcon />}
            {done ? "Analisa ulang" : "Analisa dengan AI"}
          </Button>
        )}
      </div>

      {!loaded && <p className="text-sm text-muted-foreground">Memuat…</p>}
      {loaded && !analysis && !ai.canRun && (
        <p className="text-sm text-muted-foreground">
          {ai.needsKey ? (
            ai.canSetup ? (
              <>
                Isi API key Kie.ai tim untuk mengaktifkan Analisa AI.{" "}
                <Link href="/settings?tab=integrasi&service=kie-ai" className="font-medium text-foreground underline underline-offset-4">Buka Pengaturan → Integrasi → Kie AI</Link>
              </>
            ) : (
              "Analisa AI belum aktif. Minta supervisor mengisi API key Kie.ai tim."
            )
          ) : (
            "Belum ada analisa untuk website dan periode ini."
          )}
        </p>
      )}
      {loaded && !analysis && ai.canRun && <p className="text-sm text-muted-foreground">Belum ada analisa untuk website dan periode ini.</p>}
      {running && (
        <div role="status" className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <LoaderIcon className="mt-0.5 size-4 shrink-0 animate-spin" />
          <div>
            <p className="font-medium">Menganalisa performa SEO…</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Biasanya 30–90 detik. Halaman boleh ditinggal; hasil tersimpan untuk website dan periode ini.</p>
          </div>
        </div>
      )}
      {analysis?.status === "failed" && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>{analysis.error ?? "Analisa gagal."}</span>
        </div>
      )}
      {done && <Result analysis={done} result={done.result!} />}
    </div>
  );
}

function Result({ analysis, result }: { analysis: SeoAnalysisView; result: SeoAnalysisResult }) {
  const status = STATUS[result.status];
  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex min-w-0 flex-wrap items-start gap-4">
        <div className="text-center">
          <p className={cn("text-3xl leading-none font-semibold tabular-nums", scoreTone(result.score))}>
            {result.score}
            <span className="text-base text-muted-foreground">/10</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Skor SEO</p>
        </div>
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div><Badge variant={status.variant}>{status.label}</Badge></div>
          <p className="text-lg leading-snug font-semibold tracking-tight">{result.headline}</p>
          {result.summary && <p className="text-sm leading-relaxed text-muted-foreground">{result.summary}</p>}
          <p className="text-[11px] text-muted-foreground">
            {analysis.byName ? `${analysis.byName} · ` : ""}
            {analysis.createdLabel} WIB · data {analysis.input.period.start} – {analysis.input.period.end}
            {analysis.credits !== null && ` · ≈ ${analysis.credits.toLocaleString("id-ID", { maximumFractionDigits: 2 })} kredit`}
          </p>
        </div>
      </div>

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
        <section className="order-first min-w-0 @min-[800px]:order-none">
          <h3 className="text-sm font-semibold">Yang perlu dilakukan</h3>
          <ol className="mt-2 grid gap-2">
            {result.actions.map((a, i) => (
              <li key={i} className="flex min-w-0 gap-3 rounded-lg border bg-card p-3 text-sm">
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", i === 0 ? "bg-primary text-primary-foreground" : "bg-muted")}>{i + 1}</span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">{a.title}<Badge variant={PRIORITY[a.priority]} className="text-[10px]">{a.priority}</Badge></p>
                  {a.detail && <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{a.detail}</p>}
                  {a.targets.length > 0 && (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {a.targets.map((t) => <span key={t} className="max-w-full truncate rounded-md border bg-muted/40 px-1.5 py-0.5 text-[11px]" title={t}>{t}</span>)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {result.keywords.length > 0 && (
        <section className="min-w-0">
          <h3 className="text-sm font-semibold">Kata kunci yang perlu ditangani</h3>
          <div className="mt-2 grid min-w-0 gap-2 @min-[800px]:grid-cols-2">
            {result.keywords.map((k, i) => (
              <article key={i} className="min-w-0 rounded-lg border bg-card p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-medium break-words">{k.query}</p>
                  <Badge variant={VERDICT[k.verdict].variant} className="shrink-0">{VERDICT[k.verdict].label}</Badge>
                </div>
                {k.reason && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{k.reason}</p>}
                {k.suggestion && <p className="mt-1.5 text-xs leading-relaxed"><span className="font-medium">Saran:</span> {k.suggestion}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      {result.contentIdeas.length > 0 && (
        <section className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><LightbulbIcon className="size-4 text-muted-foreground" /> Ide konten</h3>
          <div className="mt-2 grid min-w-0 gap-2 @min-[700px]:grid-cols-2">
            {result.contentIdeas.map((c, i) => (
              <div key={i} className="min-w-0 rounded-lg border p-3">
                <p className="text-sm font-medium">“{c.title}”</p>
                {c.angle && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.angle}</p>}
                {c.targetQuery && <p className="mt-1 text-[11px] text-muted-foreground">Kata kunci: {c.targetQuery}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {result.technical && <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground"><span className="font-medium text-foreground">Catatan teknis:</span> {result.technical}</p>}
      {analysis.input.gaps.length > 0 && <p className="text-xs text-muted-foreground">Catatan data: {analysis.input.gaps.join(" ")}</p>}
      <p className="text-xs text-muted-foreground">Hasil AI bisa keliru. Cek angka di tab lain sebelum mengubah halaman. CTR wajar per posisi adalah rata-rata umum, bukan angka resmi Google.</p>
    </div>
  );
}
