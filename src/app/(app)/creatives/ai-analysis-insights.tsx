"use client";

import * as React from "react";
import type { CreativeAnalysisResult } from "@/lib/ai-ads-analysis";
import type { AnalysisEnrichment, Segment } from "@/lib/ai-analysis-meta";
import { fmt } from "@/lib/creatives";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Extra Meta data on an analysis: the previous-period comparison, the daily trend and the audience breakdowns. */

const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });

/** "▲10%" in green or red; `upIsGood` says which direction is good for this metric. */
export function Change({ value, upIsGood, suffix }: { value: number | null; upIsGood?: boolean; suffix?: string }) {
  if (value === null) return null;
  const up = value > 0;
  const tone = value === 0 || upIsGood === undefined ? "text-muted-foreground" : up === upIsGood ? "text-success" : "text-destructive";
  return (
    <span className={cn("whitespace-nowrap tabular-nums", tone)}>
      {value === 0 ? "=" : up ? "▲" : "▼"}
      {fmt.pct(Math.abs(value)).replace(",0%", "%")}
      {suffix && ` ${suffix}`}
    </span>
  );
}

/** The five headline numbers against the previous period; shown above the analysis tabs. */
export function ComparisonTiles({ comparison }: { comparison: NonNullable<AnalysisEnrichment["comparison"]> }) {
  const { current, previous, change } = comparison;
  const tiles = [
    { label: "Spend", value: fmt.rp(current.spend), before: fmt.rp(previous.spend), change: change.spend, upIsGood: undefined },
    { label: "Hasil", value: fmt.num(current.results), before: fmt.num(previous.results), change: change.results, upIsGood: true },
    { label: "Biaya per hasil", value: fmt.rp(current.costPerResult), before: fmt.rp(previous.costPerResult), change: change.costPerResult, upIsGood: false },
    { label: "CTR", value: fmt.pct(current.ctrPct), before: fmt.pct(previous.ctrPct), change: change.ctr, upIsGood: true },
    { label: "CPM", value: fmt.rp(current.cpm), before: fmt.rp(previous.cpm), change: change.cpm, upIsGood: false },
  ];
  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="grid min-w-0 grid-cols-2 gap-2 @min-[700px]:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0 rounded-lg border bg-card p-2.5">
            <p className="text-xs text-muted-foreground">{t.label}</p>
            <p className="mt-1 truncate text-base font-semibold tabular-nums">{t.value}</p>
            <p className="mt-0.5 text-xs">
              <Change value={t.change} upIsGood={t.upIsGood} /> <span className="text-muted-foreground">dari {t.before}</span>
            </p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Dibanding iklan yang sama pada {shortDate(comparison.previousPeriod.start)} – {shortDate(comparison.previousPeriod.end)}.
      </p>
    </div>
  );
}

/** What the AI read in the change from the previous period (the tiles sit above the tabs). */
export function PeriodComparison({ comparison, trend }: { comparison: NonNullable<AnalysisEnrichment["comparison"]>; trend?: string }) {
  if (!trend) return null;
  return (
    <section className="grid min-w-0 gap-1.5">
      <h3 className="text-sm font-semibold">Dibanding periode sebelumnya</h3>
      <p className="text-xs text-muted-foreground">Iklan yang sama, {shortDate(comparison.previousPeriod.start)} – {shortDate(comparison.previousPeriod.end)}.</p>
      <p className="text-sm leading-relaxed">{trend}</p>
    </section>
  );
}

export function DailyTrend({ enrichment, trend }: { enrichment: AnalysisEnrichment; trend?: string }) {
  const days = enrichment.daily;
  return (
    <section className="grid min-w-0 gap-2">
      <h3 className="text-sm font-semibold">Tren harian</h3>
      {trend && !enrichment.comparison && <p className="text-sm leading-relaxed">{trend}</p>}
      <div className="min-w-0 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Hasil</TableHead>
              <TableHead className="text-right">Biaya/hasil</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">CPM</TableHead>
              <TableHead className="text-right">Frekuensi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((d, i) => {
              const partial = enrichment.partialLastDay && i === days.length - 1;
              return (
                <TableRow key={d.date} className={cn(partial && "text-muted-foreground")}>
                  <TableCell className="whitespace-nowrap">
                    {shortDate(d.date)}
                    {partial && <span className="ml-1 text-xs">(berjalan)</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.rp(d.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.num(d.results)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.rp(d.costPerResult)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.pct(d.ctrPct)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.rp(d.cpm)}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.frequency === null ? "–" : `${d.frequency.toLocaleString("id-ID", { maximumFractionDigits: 2 })}×`}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

const DIMENSIONS = [
  { key: "placement", label: "Placement", aiKey: "placement" },
  { key: "age", label: "Umur", aiKey: "umur" },
  { key: "gender", label: "Gender", aiKey: "gender" },
] as const;

const ASSESSMENT: Record<CreativeAnalysisResult["audience"][number]["assessment"], { label: string; variant: "success" | "warning" | "destructive" | "outline"; row: string }> = {
  efisien: { label: "Efisien", variant: "success", row: "border-l-success" },
  boros: { label: "Boros", variant: "warning", row: "border-l-warning" },
  tanpa_hasil: { label: "Tanpa hasil", variant: "destructive", row: "border-l-destructive" },
  netral: { label: "Netral", variant: "outline", row: "border-l-transparent" },
};

export function AudienceBreakdown({ enrichment, insights }: { enrichment: AnalysisEnrichment; insights: CreativeAnalysisResult["audience"] }) {
  const available = DIMENSIONS.filter((d) => enrichment.breakdowns[d.key].length > 0);
  const [active, setActive] = React.useState<(typeof DIMENSIONS)[number]["key"]>(available[0]?.key ?? "placement");
  const dimension = available.find((d) => d.key === active) ?? available[0];
  if (!dimension) return null;
  const rows: Segment[] = enrichment.breakdowns[dimension.key];
  const notes = insights.filter((i) => i.dimension === dimension.aiKey);
  const assessmentOf = (segment: string) => notes.find((n) => n.segment === segment)?.assessment;

  return (
    <section className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Breakdown audience</h3>
        <div role="tablist" aria-label="Jenis breakdown" className="flex rounded-lg border bg-muted/50 p-0.5">
          {available.map((d) => (
            <button
              key={d.key}
              type="button"
              role="tab"
              aria-selected={d.key === dimension.key}
              onClick={() => setActive(d.key)}
              className={cn("rounded-md px-3 py-1 text-xs transition-colors", d.key === dimension.key ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {notes.length > 0 && (
        <ul className="grid gap-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
          {notes.map((n, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <Badge variant={ASSESSMENT[n.assessment].variant}>{ASSESSMENT[n.assessment].label}</Badge>
              <span className="font-medium">{n.segment}</span>
              <span className="text-muted-foreground">{n.detail}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="min-w-0 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{dimension.label}</TableHead>
              <TableHead className="text-right">Porsi spend</TableHead>
              <TableHead className="text-right">Hasil</TableHead>
              <TableHead className="text-right">Biaya/hasil</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">CPM</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const assessment = assessmentOf(r.segment);
              return (
                <TableRow key={r.segment} className={cn("border-l-4 border-l-transparent", assessment && ASSESSMENT[assessment].row)}>
                  <TableCell className="font-medium">{r.segment}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt.pct(r.spendSharePct)}
                    <span className="block text-xs text-muted-foreground">{fmt.rp(r.spend)}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.num(r.results)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", !r.sufficientData && "text-muted-foreground")}>
                    {fmt.rp(r.costPerResult)}
                    {r.sufficientData && r.costVsAveragePct !== null && (
                      <span className="block text-xs">
                        <Change value={r.costVsAveragePct} upIsGood={false} suffix="vs rata-rata" />
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.pct(r.ctrPct)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.rp(r.cpm)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Segmen dengan kurang dari 3 hasil tidak dijadikan patokan. Mencakup {fmt.num(enrichment.coverage.ads)} iklan yang dianalisa
        {enrichment.coverage.spendSharePct !== null && ` (${fmt.pct(enrichment.coverage.spendSharePct)} spend)`}.
      </p>
    </section>
  );
}

export function DataGaps({ gaps }: { gaps: string[] }) {
  if (!gaps.length) return null;
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs">
      <p className="font-medium">Data yang tidak lengkap</p>
      <ul className="mt-1 list-disc pl-4 text-muted-foreground">
        {gaps.map((g, i) => (
          <li key={i}>{g}</li>
        ))}
      </ul>
    </div>
  );
}
