"use client";

import * as React from "react";
import Link from "next/link";
import { LoaderIcon, RotateCcwIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { getCampaignAnalysisAction, startCampaignAnalysisAction } from "@/actions/campaign-insights";
import type { CampaignAnalysisView } from "@/lib/ai-analysis-data";
import type { CampaignAnalysisResult } from "@/lib/ai-campaign-analysis";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const POLL_MS = 4000;

type Verdict = CampaignAnalysisResult["verdict"];
const VERDICT: Record<Verdict, { label: string; variant: "success" | "info" | "warning" | "destructive" | "outline" }> = {
  scale: { label: "Scale", variant: "success" },
  pertahankan: { label: "Pertahankan", variant: "info" },
  optimasi: { label: "Optimasi", variant: "warning" },
  hentikan: { label: "Hentikan", variant: "destructive" },
  belum_cukup_data: { label: "Belum cukup data", variant: "outline" },
};
const STATUS_TONE: Record<CampaignAnalysisResult["matrix"][number]["status"], string> = {
  baik: "bg-success",
  waspada: "bg-warning",
  buruk: "bg-destructive",
  netral: "bg-muted-foreground/40",
};
const PRIORITY: Record<CampaignAnalysisResult["actions"][number]["priority"], "destructive" | "warning" | "outline"> = { tinggi: "destructive", sedang: "warning", rendah: "outline" };
const scoreTone = (n: number) => (n >= 8 ? "text-success" : n >= 5 ? "text-foreground" : "text-destructive");

export type CampaignAiOptions = { modelLabel: string; canRun: boolean; needsKey: boolean; canSetup: boolean };

/** "Analisa AI" of one campaign with its ad sets and ads, in a dialog. Shared with everyone who can see the campaign. */
export function CampaignAiAnalysis({ campaignId, campaignName, period, ai }: { campaignId: number; campaignName: string; period: string; ai: CampaignAiOptions }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <SparklesIcon className="size-3.5" /> Analisa AI
      </button>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5 pr-6"><SparklesIcon className="size-4 text-muted-foreground" /> Analisa AI campaign</DialogTitle>
          <DialogDescription className="break-words">{campaignName}</DialogDescription>
        </DialogHeader>
        {open && <Body campaignId={campaignId} period={period} ai={ai} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ campaignId, period, ai }: { campaignId: number; period: string; ai: CampaignAiOptions }) {
  const [analysis, setAnalysis] = React.useState<CampaignAnalysisView | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [starting, startTransition] = React.useTransition();
  const running = analysis?.status === "running";

  React.useEffect(() => {
    let live = true;
    getCampaignAnalysisAction({ id: campaignId, period }).then((res) => {
      if (!live) return;
      if (res.ok) setAnalysis(res.analysis);
      else toast.error(res.error);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [campaignId, period]);

  React.useEffect(() => {
    if (!running || !analysis) return;
    const timer = setTimeout(async () => {
      const res = await getCampaignAnalysisAction({ analysisId: analysis.id });
      if (!res.ok || !res.analysis) return;
      setAnalysis(res.analysis);
      if (res.analysis.status === "done") toast.success("Analisa campaign selesai");
      if (res.analysis.status === "failed") toast.error(res.analysis.error ?? "Analisa campaign gagal");
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [running, analysis]);

  const start = () =>
    startTransition(async () => {
      const res = await startCampaignAnalysisAction({ id: campaignId, period });
      if (res.ok) setAnalysis(res.analysis);
      else toast.error(res.error);
    });

  const done = analysis?.status === "done" && analysis.result ? analysis : null;

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {ai.modelLabel} membaca angka campaign, setiap ad set dan iklannya pada periode terpilih (dibanding periode sebelumnya), lalu memberi evaluasi metrik dan langkah yang perlu
          dikerjakan.
        </p>
        {ai.canRun && !running && loaded && (
          <Button type="button" size="sm" variant={done ? "outline" : "default"} onClick={start} disabled={starting}>
            {starting ? <LoaderIcon className="animate-spin" /> : done ? <RotateCcwIcon /> : <SparklesIcon />}
            {done ? "Analisa ulang" : "Mulai analisa"}
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
            "Belum ada analisa untuk campaign ini pada periode ini."
          )}
        </p>
      )}
      {loaded && !analysis && ai.canRun && <p className="text-sm text-muted-foreground">Belum ada analisa untuk campaign ini pada periode ini.</p>}

      {running && (
        <div role="status" className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <LoaderIcon className="mt-0.5 size-4 shrink-0 animate-spin" />
          <div>
            <p className="font-medium">Menganalisa campaign, ad set dan iklan…</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Biasanya 30–90 detik. Dialog boleh ditutup; hasil tersimpan dan bisa dilihat tim yang punya akses ke campaign ini.</p>
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

function Result({ analysis, result }: { analysis: CampaignAnalysisView; result: CampaignAnalysisResult }) {
  const { input } = analysis;
  const adsets = new Map(input.adsets.map((s) => [s.ref, s]));
  const ads = new Map(input.ads.map((a) => [a.ref, a]));
  const verdict = VERDICT[result.verdict];
  const sections: [string, string][] = [
    ["Funnel", result.funnel],
    ["Budget", result.budget],
    ["Audiens", result.audience],
    ["Materi iklan", result.creative],
  ];
  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex min-w-0 flex-wrap items-start gap-4">
        <div className="text-center">
          <p className={cn("text-3xl leading-none font-semibold tabular-nums", scoreTone(result.score))}>
            {result.score}
            <span className="text-base text-muted-foreground">/10</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Skor campaign</p>
        </div>
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div><Badge variant={verdict.variant}>{verdict.label}</Badge></div>
          <p className="text-sm leading-relaxed">{result.summary}</p>
          <p className="text-[11px] text-muted-foreground">
            {analysis.byName ? `${analysis.byName} · ` : ""}
            {analysis.createdLabel} WIB · angka {input.period.start} – {input.period.end} · {input.adsets.length} ad set, {input.ads.length + (input.otherAds?.count ?? 0)} iklan
            {analysis.credits !== null && ` · ${analysis.credits.toLocaleString("id-ID", { maximumFractionDigits: 2 })} kredit`}
          </p>
        </div>
      </div>

      {result.matrix.length > 0 && (
        <section className="min-w-0">
          <h4 className="text-sm font-semibold">Evaluasi metrik</h4>
          <div className="mt-2 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">Metrik</th><th className="px-3 py-2 font-medium">Nilai</th><th className="px-3 py-2 font-medium">Patokan</th><th className="px-3 py-2 font-medium">Catatan</th></tr>
              </thead>
              <tbody className="divide-y">
                {result.matrix.map((m, i) => (
                  <tr key={i} className="align-top">
                    <td className="px-3 py-2 font-medium"><span className="inline-flex items-center gap-2"><span className={cn("size-2 shrink-0 rounded-full", STATUS_TONE[m.status])} title={m.status} />{m.metric}</span></td>
                    <td className="px-3 py-2 tabular-nums">{m.value}</td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{m.benchmark}</td>
                    <td className="px-3 py-2 text-muted-foreground">{m.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {result.actions.length > 0 && (
        <section className="min-w-0">
          <h4 className="text-sm font-semibold">Langkah yang disarankan</h4>
          <ol className="mt-2 grid gap-2">
            {result.actions.map((a, i) => (
              <li key={i} className="flex min-w-0 gap-3 rounded-lg border p-3 text-sm">
                <span className="w-5 shrink-0 font-semibold tabular-nums text-muted-foreground">{i + 1}.</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-medium">{a.title}<Badge variant={PRIORITY[a.priority]} className="text-[10px]">{a.priority}</Badge></span>
                  {a.detail && <span className="mt-0.5 block text-muted-foreground">{a.detail}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {result.adsets.length > 0 && (
        <Verdicts title="Ad set" items={result.adsets.map((v) => ({ ...v, name: adsets.get(v.ref)?.name ?? v.ref, sub: adsets.get(v.ref)?.audience }))} />
      )}
      {result.ads.length > 0 && (
        <Verdicts title="Iklan" items={result.ads.map((v) => { const ad = ads.get(v.ref); return { ...v, name: ad?.name ?? v.ref, sub: ad ? `${ad.adset} · ${adsets.get(ad.adset)?.name ?? ""}` : undefined }; })} />
      )}

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {sections.filter(([, text]) => text.trim()).map(([title, text]) => (
          <div key={title} className="min-w-0">
            <h4 className="text-sm font-semibold">{title}</h4>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>

      {input.registrations && (
        <p className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
          Closing produk dari aplikasi pendaftaran pada periode ini: <span className="font-medium text-foreground">{input.registrations.closing.toLocaleString("id-ID")}</span> · revenue{" "}
          <span className="font-medium text-foreground">Rp{input.registrations.revenue.toLocaleString("id-ID")}</span> (semua campaign produk {input.product?.name}).
        </p>
      )}
      {input.gaps.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs">
          <p className="font-medium">Data yang tidak lengkap</p>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">{input.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Hasil AI bisa keliru. Periksa angka di tabel sebelum mengubah budget atau mematikan iklan.</p>
    </div>
  );
}

function Verdicts({ title, items }: { title: string; items: { ref: string; name: string; sub?: string; verdict: Verdict; reason: string }[] }) {
  return (
    <section className="min-w-0">
      <h4 className="text-sm font-semibold">{title}</h4>
      <div className="mt-2 divide-y rounded-lg border">
        {items.map((v) => (
          <div key={v.ref} className="grid min-w-0 gap-1 px-3 py-2 text-sm">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">{v.ref}</span>
              <span className="min-w-0 flex-1 break-words font-medium">{v.name}</span>
              <Badge variant={VERDICT[v.verdict].variant}>{VERDICT[v.verdict].label}</Badge>
            </div>
            {v.sub && <span className="break-words text-xs text-muted-foreground">{v.sub}</span>}
            {v.reason && <span className="text-muted-foreground">{v.reason}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
