"use client";

import * as React from "react";
import { ChevronDownIcon, CircleHelpIcon, RotateCcwIcon } from "lucide-react";
import {
  DEFAULT_MATRIX_BENCHMARKS,
  STAGE_LABEL,
  type AdDiagnosis,
  type MatrixAd,
  type MatrixBenchmarks,
  type MatrixDef,
  type MatrixResult,
  type QuadrantKey,
  type Tone,
} from "@/lib/ad-matrices";
import { fmt } from "@/lib/creatives";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Status colours: each quadrant also carries its label, so tone is never the only cue. */
export const TONE: Record<Tone, { cell: string; cellActive: string; card: string; badge: string }> = {
  healthy: { cell: "bg-success/5", cellActive: "bg-success/15 ring-2 ring-inset ring-success/60", card: "border-success/40 bg-success/10", badge: "bg-success/15 text-success" },
  watch: { cell: "bg-info/5", cellActive: "bg-info/15 ring-2 ring-inset ring-info/60", card: "border-info/40 bg-info/10", badge: "bg-info/15 text-info" },
  weak: { cell: "bg-muted/60", cellActive: "bg-muted ring-2 ring-inset ring-foreground/25", card: "border-foreground/15 bg-muted", badge: "bg-foreground/10 text-foreground" },
  problem: { cell: "bg-destructive/5", cellActive: "bg-destructive/15 ring-2 ring-inset ring-destructive/60", card: "border-destructive/40 bg-destructive/10", badge: "bg-destructive/15 text-destructive" },
};
const TONE_ORDER: Tone[] = ["problem", "watch", "weak", "healthy"];

const BENCHMARK_FIELDS: { key: keyof MatrixBenchmarks; label: string; suffix: string; step: number }[] = [
  { key: "ctrPct", label: "CTR", suffix: "%", step: 0.1 },
  { key: "cpm", label: "CPM", suffix: "Rp", step: 1000 },
  { key: "dailyFrequency", label: "Frekuensi harian", suffix: "×", step: 0.1 },
  { key: "retargetFrequency", label: "Frekuensi retargeting", suffix: "×", step: 0.1 },
  { key: "hookRatePct", label: "Hook rate", suffix: "%", step: 1 },
  { key: "holdRatePct", label: "Hold rate", suffix: "%", step: 1 },
  { key: "lpvRatePct", label: "LPV rate", suffix: "%", step: 5 },
  { key: "conversionRatePct", label: "Conversion rate", suffix: "%", step: 0.5 },
  { key: "costMultiplier", label: "Batas mahal (× target)", suffix: "×", step: 0.1 },
];

const STORAGE_KEY = "kpiads:matrix-benchmarks";

/** Benchmarks the viewer edited, remembered in this browser only. */
export function useMatrixBenchmarks() {
  const [benchmarks, setBenchmarks] = React.useState<MatrixBenchmarks>(DEFAULT_MATRIX_BENCHMARKS);
  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<MatrixBenchmarks> | null;
      if (saved) setBenchmarks({ ...DEFAULT_MATRIX_BENCHMARKS, ...Object.fromEntries(Object.entries(saved).filter(([, v]) => typeof v === "number" && v > 0)) });
    } catch {
      /* private mode or corrupt value: keep the defaults */
    }
  }, []);
  const update = React.useCallback((next: MatrixBenchmarks) => {
    setBenchmarks(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* not persisted */
    }
  }, []);
  return [benchmarks, update] as const;
}

function formatAxis(unit: MatrixDef["x"]["unit"], v: number) {
  if (unit === "pct") return fmt.pct(v);
  if (unit === "rp") return fmt.rp(v);
  if (unit === "x") return `${v.toLocaleString("id-ID", { maximumFractionDigits: 2 })}×`;
  return fmt.num(v);
}

/**
 * Position on an axis whose middle is the benchmark line: the lower half runs from 0 to the line, the upper
 * half from the line to the highest value (at least twice the line), so high values spread out instead of
 * piling up at the edge.
 */
const position = (value: number, line: number, max: number) => {
  if (line <= 0) return 0.5;
  const p = value <= line ? (value / line) * 0.5 : 0.5 + ((value - line) / Math.max(max - line, line)) * 0.45;
  return Math.min(0.95, Math.max(0.05, p));
};

/** Nudges dots that would cover each other (in any direction, nearest free spot first) so every number stays readable. */
const MIN_GAP = 0.1;
const NUDGES = [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1], [0, 2], [0, -2], [2, 0], [-2, 0]];
/** A dot never leaves its quadrant: nudging or a value exactly on the line can't make it look like the other side. */
const half = (high: boolean): readonly [number, number] => (high ? [0.56, 0.95] : [0.05, 0.44]);
const within = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));
function spread(points: { ref: number; px: number; py: number; quadrant: QuadrantKey }[]) {
  const placed: { ref: number; px: number; py: number }[] = [];
  for (const p of [...points].sort((a, b) => a.ref - b.ref)) {
    const xr = half(p.quadrant.endsWith("r"));
    const yr = half(p.quadrant.startsWith("t"));
    const free = (x: number, y: number) => placed.every((q) => Math.hypot(q.px - x, q.py - y) >= MIN_GAP);
    const candidates = NUDGES.map(([dx, dy]) => ({ px: within(p.px + dx! * MIN_GAP, xr), py: within(p.py + dy! * MIN_GAP, yr) }));
    placed.push({ ref: p.ref, ...(candidates.find((c) => free(c.px, c.py)) ?? candidates[0]!) });
  }
  return placed;
}

function MatrixPlot({ result, ads }: { result: MatrixResult; ads: Map<number, MatrixAd> }) {
  const { def, line, placements } = result;
  const filled = new Set(placements.map((p) => p.quadrant));
  const maxX = Math.max(2 * line.x, ...placements.map((p) => p.x));
  const maxY = Math.max(2 * line.y, ...placements.map((p) => p.y));
  const dots = spread(placements.map((p) => ({ ref: p.ref, px: position(p.x, line.x, maxX), py: position(p.y, line.y, maxY), quadrant: p.quadrant })));
  const cell = (q: QuadrantKey) => cn("rounded-md", filled.has(q) ? TONE[def.quadrants[q].tone].cellActive : TONE[def.quadrants[q].tone].cell);
  return (
    <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-1">
      <div className="flex items-center justify-center">
        <span className="-rotate-90 whitespace-nowrap text-[10px] text-muted-foreground">
          {def.y.label} → ({line.yNote})
        </span>
      </div>
      <div>
        <div className="relative aspect-[4/3] w-full">
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1">
            <div className={cell("tl")} />
            <div className={cell("tr")} />
            <div className={cell("bl")} />
            <div className={cell("br")} />
          </div>
          {dots.map((d) => {
            const ad = ads.get(d.ref);
            const p = placements.find((x) => x.ref === d.ref)!;
            return (
              <button
                key={d.ref}
                type="button"
                className="group absolute flex size-5 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background ring-2 ring-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                style={{ left: `${d.px * 100}%`, bottom: `${d.py * 100}%` }}
                aria-label={`${d.ref}. ${ad?.name ?? ""}: ${def.x.label} ${formatAxis(def.x.unit, p.x)}, ${def.y.label} ${formatAxis(def.y.unit, p.y)}`}
              >
                {d.ref}
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden w-max max-w-56 -translate-x-1/2 rounded-md border bg-popover px-2 py-1.5 text-left text-[11px] font-normal text-popover-foreground shadow-md group-hover:block group-focus-visible:block">
                  <span className="block truncate font-medium">{ad?.name}</span>
                  <span className="block text-muted-foreground">
                    {def.x.label}: {formatAxis(def.x.unit, p.x)}
                  </span>
                  <span className="block text-muted-foreground">
                    {def.y.label}: {formatAxis(def.y.unit, p.y)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-center text-[10px] text-muted-foreground">
          {def.x.label} → ({line.xNote})
        </p>
      </div>
    </div>
  );
}

export function AdChipSmall({ ad }: { ad: MatrixAd | undefined }) {
  if (!ad) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded border bg-card px-1.5 py-0.5 text-[11px]">
      <span className="font-semibold">{ad.ref}</span>
      <span className="truncate">{ad.name}</span>
    </span>
  );
}

function MatrixCard({ result, ads }: { result: MatrixResult; ads: Map<number, MatrixAd> }) {
  const { def, placements, skipped } = result;
  const byQuadrant = (Object.keys(def.quadrants) as QuadrantKey[])
    .map((q) => ({ q, quadrant: def.quadrants[q], refs: placements.filter((p) => p.quadrant === q).map((p) => p.ref) }))
    .sort((a, b) => TONE_ORDER.indexOf(a.quadrant.tone) - TONE_ORDER.indexOf(b.quadrant.tone));
  return (
    <article className="grid min-w-0 content-start gap-3 rounded-xl border bg-card p-3">
      <header>
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold">{def.title}</h4>
          <span className="text-[10px] tracking-wide text-muted-foreground uppercase">{STAGE_LABEL[def.stage]}</span>
        </div>
        <p className="text-xs text-muted-foreground">{def.question}</p>
      </header>
      {placements.length > 0 ? <MatrixPlot result={result} ads={ads} /> : <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">Belum ada iklan yang bisa dipetakan.</p>}
      <div className="grid gap-1.5">
        {byQuadrant.map(({ q, quadrant, refs }) =>
          refs.length ? (
            <div key={q} className={cn("rounded-lg border p-2.5", TONE[quadrant.tone].card)}>
              <span className={cn("inline-block rounded px-1.5 py-0.5 text-[10px] font-medium", TONE[quadrant.tone].badge)}>Hasil diagnosa · {refs.length} iklan</span>
              <p className="mt-1 text-sm font-semibold">{quadrant.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{quadrant.detail}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {refs.map((ref) => (
                  <AdChipSmall key={ref} ad={ads.get(ref)} />
                ))}
              </div>
            </div>
          ) : (
            <p key={q} className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
              {quadrant.title}
            </p>
          ),
        )}
      </div>
      {(def.note || skipped > 0) && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {def.note}
          {skipped > 0 && ` ${skipped} iklan tanpa data yang dibutuhkan tidak dimasukkan.`}
        </p>
      )}
    </article>
  );
}

function BenchmarkEditor({ value, onChange }: { value: MatrixBenchmarks; onChange: (v: MatrixBenchmarks) => void }) {
  const changed = (Object.keys(value) as (keyof MatrixBenchmarks)[]).some((k) => value[k] !== DEFAULT_MATRIX_BENCHMARKS[k]);
  return (
    <div className="rounded-lg border border-info/30 bg-info/5 p-3 text-xs">
      <p>
        <span className="font-medium">Angka acuan ini adalah patokan umum untuk iklan di Indonesia, bukan angka resmi Meta.</span> Kalau Anda punya data performa sendiri untuk
        industri ini, ubah angkanya di sini. Matriks langsung digambar ulang tanpa menjalankan AI lagi.
      </p>
      <details className="group/bench mt-2">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 font-medium [&::-webkit-details-marker]:hidden">
          <ChevronDownIcon className="size-3.5 transition-transform group-open/bench:rotate-180" /> Ubah angka acuan {changed && "(diubah)"}
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {BENCHMARK_FIELDS.map((f) => (
            <label key={f.key} className="grid gap-1">
              <span className="text-muted-foreground">
                {f.label} ({f.suffix})
              </span>
              <Input
                type="number"
                min={0}
                step={f.step}
                value={value[f.key]}
                className="h-8 text-xs"
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n > 0) onChange({ ...value, [f.key]: n });
                }}
              />
            </label>
          ))}
        </div>
        {changed && (
          <Button type="button" variant="ghost" size="sm" className="mt-2 h-7 gap-1 text-xs" onClick={() => onChange(DEFAULT_MATRIX_BENCHMARKS)}>
            <RotateCcwIcon className="size-3.5" /> Kembalikan ke standar
          </Button>
        )}
      </details>
    </div>
  );
}

export function AdMatrices({ results, ads, benchmarks, onBenchmarks, insufficient }: { results: MatrixResult[]; ads: MatrixAd[]; benchmarks: MatrixBenchmarks; onBenchmarks: (v: MatrixBenchmarks) => void; insufficient: number }) {
  const byRef = new Map(ads.map((a) => [a.ref, a]));
  return (
    <section className="grid min-w-0 gap-3">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          Matriks diagnosa <CircleHelpIcon className="size-3.5 text-muted-foreground" aria-hidden />
        </h3>
        <p className="text-xs text-muted-foreground">
          Setiap titik adalah satu iklan (nomor = ref). Garis tengah diletakkan di batas kategori, jadi hanya yang benar-benar di bawah acuan yang dianggap bermasalah.
          {insufficient > 0 && ` ${insufficient} iklan dengan data terlalu sedikit tidak dimasukkan.`}
        </p>
      </div>
      <BenchmarkEditor value={benchmarks} onChange={onBenchmarks} />
      <div className="grid min-w-0 gap-3 @min-[760px]:grid-cols-2 @min-[1120px]:grid-cols-3">
        {results.map((r) => (
          <MatrixCard key={r.def.id} result={r} ads={byRef} />
        ))}
      </div>
    </section>
  );
}

/** One-line matrix verdict for an ad's diagnosis card. */
export function MatrixVerdict({ diagnosis }: { diagnosis: AdDiagnosis }) {
  if (diagnosis.kind === "insufficient") return <p className="mt-1.5 text-xs text-muted-foreground">Matriks: data belum cukup (min. 1.000 impresi dan 20 klik).</p>;
  if (diagnosis.kind === "ok") return <p className="mt-1.5 text-xs text-success">Matriks: tidak ada kotak merah.</p>;
  return (
    <div className="mt-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs">
      <p>
        <span className="font-medium">Matriks · masalah utama:</span> {diagnosis.main.title} <span className="text-muted-foreground">({STAGE_LABEL[diagnosis.main.stage]}, {diagnosis.main.matrix})</span>
      </p>
      {diagnosis.also.length > 0 && <p className="mt-0.5 text-muted-foreground">Juga perlu dicek: {diagnosis.also.join(", ")}</p>}
    </div>
  );
}
