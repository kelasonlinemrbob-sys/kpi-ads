"use client";

import * as React from "react";
import Link from "next/link";
import { LightbulbIcon, LoaderIcon, RotateCcwIcon, SparklesIcon, TagIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { getContentAnalysisAction, startContentAnalysisAction } from "@/actions/ai-analysis";
import type { AdCreative } from "@/db/schema";
import type { ContentAnalysisResult } from "@/lib/ai-content-analysis";
import type { ContentAnalysisView } from "@/lib/ai-analysis-data";
import { CREATIVE_LABEL, fmt } from "@/lib/creatives";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const POLL_MS = 4000;

const VERDICT: Record<ContentAnalysisResult["verdict"], { label: string; variant: "success" | "warning" | "destructive" | "outline" }> = {
  pertahankan: { label: "Pertahankan", variant: "success" },
  perbaiki: { label: "Perbaiki", variant: "warning" },
  ganti: { label: "Ganti", variant: "destructive" },
  belum_cukup_data: { label: "Belum cukup data", variant: "outline" },
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const scoreTone = (n: number) => (n >= 8 ? "text-success" : n >= 5 ? "text-foreground" : "text-destructive");

/** "Analisa creative" in the content dialog: Gemini watches the video / looks at the image and reads the copy. */
export function ContentAiAnalysis({
  postKey,
  period,
  modelLabel,
  canRun,
  needsKey,
  canSetup,
  currentLabel,
  onApplyLabel,
}: {
  postKey: string;
  period: string;
  modelLabel: string;
  /** Supervisor/advertiser with a Kie key. */
  canRun: boolean;
  /** Supervisor/advertiser without a Kie key yet. */
  needsKey: boolean;
  /** Supervisor: may set the team's Kie key. */
  canSetup: boolean;
  currentLabel: AdCreative["label"];
  onApplyLabel: (label: NonNullable<AdCreative["label"]>) => void;
}) {
  const [analysis, setAnalysis] = React.useState<ContentAnalysisView | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [starting, startTransition] = React.useTransition();
  const running = analysis?.status === "running";

  React.useEffect(() => {
    let live = true;
    getContentAnalysisAction({ postKey }).then((res) => {
      if (!live) return;
      if (res.ok) setAnalysis(res.analysis);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [postKey]);

  React.useEffect(() => {
    if (!running || !analysis) return;
    const timer = setTimeout(async () => {
      const res = await getContentAnalysisAction({ id: analysis.id });
      if (!res.ok || !res.analysis) return;
      setAnalysis(res.analysis);
      if (res.analysis.status === "done") toast.success("Analisa creative selesai");
      if (res.analysis.status === "failed") toast.error(res.analysis.error ?? "Analisa creative gagal");
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [running, analysis]);

  const start = () =>
    startTransition(async () => {
      const res = await startContentAnalysisAction({ postKey, period });
      if (res.ok) setAnalysis(res.analysis);
      else toast.error(res.error);
    });

  const done = analysis?.status === "done" && analysis.result ? analysis : null;

  return (
    <section className="grid min-w-0 gap-4 rounded-lg border p-4" aria-label="Analisa creative AI">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <SparklesIcon className="size-4 text-muted-foreground" /> Analisa creative AI
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {modelLabel} menonton video (atau melihat gambar/carousel), membaca copy iklan, lalu mengaitkannya dengan angka konten ini.
          </p>
        </div>
        {canRun && !running && loaded && (
          <Button type="button" size="sm" variant={done ? "outline" : "default"} onClick={start} disabled={starting}>
            {starting ? <LoaderIcon className="animate-spin" /> : done ? <RotateCcwIcon /> : <SparklesIcon />}
            {done ? "Analisa ulang" : "Analisa creative"}
          </Button>
        )}
      </div>

      {!loaded && <p className="text-sm text-muted-foreground">Memuat…</p>}

      {loaded && !analysis && !canRun && (
        <p className="text-sm text-muted-foreground">
          {needsKey ? (
            canSetup ? (
              <>
                Isi API key Kie.ai tim untuk mengaktifkan analisa creative.{" "}
                <Link href="/settings?tab=integrasi&service=kie-ai" className="font-medium text-foreground underline underline-offset-4">
                  Buka Pengaturan → Integrasi → Kie AI
                </Link>
              </>
            ) : (
              "Analisa creative belum aktif. Minta supervisor mengisi API key Kie.ai tim."
            )
          ) : (
            "Belum ada analisa untuk konten ini."
          )}
        </p>
      )}
      {needsKey && analysis && (
        <p className="text-xs text-muted-foreground">
          {canSetup ? "Isi API key Kie.ai tim di Pengaturan untuk menjalankan analisa ulang." : "Analisa ulang belum bisa dijalankan: API key Kie.ai tim belum diisi supervisor."}
        </p>
      )}

      {running && (
        <div role="status" className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <LoaderIcon className="mt-0.5 size-4 shrink-0 animate-spin" />
          <div>
            <p className="font-medium">Mengambil creative dari Meta dan menganalisanya…</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Biasanya 20–60 detik. Dialog boleh ditutup; hasil tersimpan dan bisa dilihat seluruh tim.</p>
          </div>
        </div>
      )}

      {analysis?.status === "failed" && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>{analysis.error ?? "Analisa gagal."}</span>
        </div>
      )}

      {done && <Result analysis={done} result={done.result!} currentLabel={currentLabel} onApplyLabel={onApplyLabel} />}
    </section>
  );
}

function Result({
  analysis,
  result,
  currentLabel,
  onApplyLabel,
}: {
  analysis: ContentAnalysisView;
  result: ContentAnalysisResult;
  currentLabel: AdCreative["label"];
  onApplyLabel: (label: NonNullable<AdCreative["label"]>) => void;
}) {
  const { input } = analysis;
  const verdict = VERDICT[result.verdict];
  const watched = input.media.videoSent
    ? `menonton video${input.media.videoSeconds ? ` ${input.media.videoSeconds} dtk` : ""}`
    : input.media.coverOnly
      ? "hanya melihat cover video"
      : input.media.imagesSent > 1
        ? `melihat ${input.media.imagesSent} kartu carousel`
        : input.media.imagesSent === 1
          ? "melihat gambar"
          : "tanpa media";
  const sections: [string, string][] = [
    ["Pesan & penawaran", result.message],
    ["Visual", result.visual],
    ["Copy iklan", result.copy],
    ["Kaitan dengan angka", result.metricsLink],
  ];

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-wrap items-start gap-4">
        <div className="text-center">
          <p className={cn("text-3xl leading-none font-semibold tabular-nums", scoreTone(result.score))}>
            {result.score}
            <span className="text-base text-muted-foreground">/10</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Skor creative</p>
        </div>
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={verdict.variant}>{verdict.label}</Badge>
            {result.suggestedLabel && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <TagIcon className="size-3.5" /> Usulan keterangan: <span className="font-medium text-foreground">{CREATIVE_LABEL[result.suggestedLabel]}</span>
                {currentLabel !== result.suggestedLabel && (
                  <button type="button" onClick={() => onApplyLabel(result.suggestedLabel!)} className="font-medium text-foreground underline underline-offset-4">
                    Pakai
                  </button>
                )}
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed">{result.summary}</p>
          <p className="text-[11px] text-muted-foreground">
            {analysis.byName ? `${analysis.byName} · ` : ""}
            {analysis.createdLabel} WIB · {watched} · angka {input.period.start} – {input.period.end}
            {analysis.credits !== null && ` · ${analysis.credits.toLocaleString("id-ID", { maximumFractionDigits: 2 })} kredit`}
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 rounded-lg bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Hook (3 detik pertama)</h4>
          {result.hook.score !== null && <span className={cn("text-sm font-semibold tabular-nums", scoreTone(result.hook.score))}>{result.hook.score}/10</span>}
        </div>
        {result.hook.firstSeconds && <p className="border-l-2 pl-3 text-sm text-muted-foreground italic">{result.hook.firstSeconds}</p>}
        <p className="text-sm leading-relaxed">{result.hook.assessment}</p>
        {input.numbers.hookRatePct !== null && (
          <p className="text-xs text-muted-foreground">
            Hook rate {fmt.pct(input.numbers.hookRatePct)} (rata-rata konten periode ini {fmt.pct(input.periodAverage.hookRatePct)}) · hold rate {fmt.pct(input.numbers.holdRatePct)}
          </p>
        )}
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {sections
          .filter(([, text]) => text.trim())
          .map(([title, text]) => (
            <div key={title} className="min-w-0">
              <h4 className="text-sm font-semibold">{title}</h4>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
      </div>

      {input.copy && (input.copy.primaryText || input.copy.headline) && (
        <details className="rounded-lg border text-sm">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Copy iklan yang dibaca AI</summary>
          <div className="grid gap-1.5 border-t px-3 py-2 text-xs">
            {input.copy.headline && (
              <p>
                <span className="text-muted-foreground">Headline:</span> {input.copy.headline}
              </p>
            )}
            {input.copy.primaryText && <p className="whitespace-pre-line">{input.copy.primaryText}</p>}
            {input.copy.cta && <p className="text-muted-foreground">CTA: {input.copy.cta}</p>}
          </div>
        </details>
      )}

      {result.moments.length > 0 && (
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">Momen di video</h4>
          <ol className="mt-1.5 grid gap-1 text-sm">
            {result.moments.map((m, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-10 shrink-0 font-mono text-xs leading-5 text-muted-foreground tabular-nums">{clock(m.second)}</span>
                <span className="min-w-0">{m.note}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {result.improvements.length > 0 && (
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">Saran perbaikan</h4>
          <ol className="mt-1.5 grid list-decimal gap-1.5 pl-5 text-sm">
            {result.improvements.map((s, i) => (
              <li key={i}>
                <span className="font-medium">{s.title}</span> <span className="text-muted-foreground">{s.detail}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {result.ideas.length > 0 && (
        <div className="min-w-0">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <LightbulbIcon className="size-4 text-muted-foreground" /> Ide creative baru
          </h4>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
            {result.ideas.map((idea, i) => (
              <div key={i} className="min-w-0 rounded-lg border p-3">
                <p className="text-sm font-medium">“{idea.hook}”</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{idea.concept}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {input.gaps.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs">
          <p className="font-medium">Data yang tidak lengkap</p>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {input.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Hasil AI bisa keliru. Tonton ulang kontennya sebelum mematikan iklan.</p>
    </div>
  );
}
