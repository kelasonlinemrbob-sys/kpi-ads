"use client";

import * as React from "react";

export type TrendPoint = { date: string; value: number };

const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });

function niceScale(min: number, max: number, integer = false) {
  const span = max - min || Math.abs(max) || 1;
  const rough = span / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const found = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  // Counts (clicks, impressions) never get a half step, which would print "1, 1, 2, 2".
  const step = integer ? Math.max(1, Math.ceil(found)) : found;
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
}

/**
 * One metric over the period, with the previous period (same length, aligned by day number) as a dashed
 * line. One y-axis; position is drawn inverted (1 on top), as in Search Console. Hover shows both values.
 */
export function SeoTrendChart({ current, previous, format, invert = false, integer = false, label }: {
  current: TrendPoint[];
  previous: TrendPoint[] | null;
  format: (v: number) => string;
  invert?: boolean;
  /** Whole-number metric: ticks at whole numbers only. */
  integer?: boolean;
  label: string;
}) {
  const box = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(720);
  const [hover, setHover] = React.useState<number | null>(null);
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = 240;
  const pad = { top: 12, right: 12, bottom: 28, left: 52 };
  const n = Math.max(current.length, previous?.length ?? 0);
  const values = [...current.map((p) => p.value), ...(previous ?? []).map((p) => p.value)];
  const scale = niceScale(invert ? Math.max(1, Math.min(...values)) : 0, Math.max(...values, invert ? 2 : 1), integer);
  const lo = invert ? Math.max(scale.lo, 1) : scale.lo;
  const x = (i: number) => pad.left + (n <= 1 ? 0 : (i / (n - 1)) * (width - pad.left - pad.right));
  const y = (v: number) => {
    const t = (v - lo) / (scale.hi - lo || 1);
    return pad.top + (invert ? t : 1 - t) * (height - pad.top - pad.bottom);
  };
  const path = (pts: TrendPoint[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const ticks: number[] = [];
  for (let v = lo; v <= scale.hi + 1e-9; v += scale.step) ticks.push(+v.toFixed(6));
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((width - pad.left) / 70))));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    setHover(Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1)))));
  };
  const hc = hover !== null ? current[hover] : undefined;
  const hp = hover !== null ? previous?.[hover] : undefined;

  if (!current.length) return <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data harian pada rentang ini.</p>;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground" aria-hidden>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-info" /> Periode ini</span>
        {previous && <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-muted-foreground/60" /> Periode sebelumnya</span>}
        {invert && <span>Posisi: makin atas makin baik</span>}
      </div>
      <div ref={box} className="relative w-full">
        <svg width={width} height={height} role="img" aria-label={`Grafik ${label} harian`} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
              <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">{format(t)}</text>
            </g>
          ))}
          {current.map((p, i) => ((i % labelEvery === 0 && current.length - 1 - i >= labelEvery * 0.6) || i === current.length - 1) && (
            <text key={p.date} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === current.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-[11px]">{fmtDate(p.date)}</text>
          ))}
          {previous && previous.length > 1 && <path d={path(previous)} fill="none" className="stroke-muted-foreground/60" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />}
          {current.length > 1 ? <path d={path(current)} fill="none" stroke="var(--info)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            : <circle cx={x(0)} cy={y(current[0]!.value)} r={4} fill="var(--info)" />}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={height - pad.bottom} className="stroke-foreground/30" strokeWidth={1} />
              {hp && <circle cx={x(hover)} cy={y(hp.value)} r={4} className="fill-muted-foreground stroke-card" strokeWidth={2} />}
              {hc && <circle cx={x(hover)} cy={y(hc.value)} r={4.5} fill="var(--info)" className="stroke-card" strokeWidth={2} />}
            </g>
          )}
          <rect x={pad.left} y={0} width={Math.max(1, width - pad.left - pad.right)} height={height - pad.bottom} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {hover !== null && (hc || hp) && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
            style={{ left: Math.min(Math.max(x(hover) + 12, 0), width - 176) }}
          >
            {hc && <p className="flex justify-between gap-4"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="size-2 rounded-full bg-info" />{fmtDate(hc.date)}</span><span className="font-medium tabular-nums">{format(hc.value)}</span></p>}
            {hp && <p className="mt-1 flex justify-between gap-4"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="size-2 rounded-full bg-muted-foreground" />{fmtDate(hp.date)}</span><span className="font-medium tabular-nums">{format(hp.value)}</span></p>}
          </div>
        )}
      </div>
    </div>
  );
}
