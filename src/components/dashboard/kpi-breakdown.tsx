import { InfoIcon } from "lucide-react";
import type { MetricResult } from "@/lib/kpi";
import { STATUS_META, statusOf } from "@/lib/kpi";
import { cn, formatNumber, formatValue } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { KpiStatusLabel, TONE_BAR } from "./kpi-status";
import { MonoMeter } from "./mono";

/**
 * Per-KPI actual vs target. `mono` is the black & white scorecard variant, which also shows each
 * KPI's contribution in score points (the contributions add up to the KPI score).
 */
export function KpiBreakdownTable({
  results,
  mono,
  pointScale = 1,
}: {
  results: MetricResult[];
  mono?: boolean;
  /** For one role of a dual-role member: the role's share, so points add up to the combined score. */
  pointScale?: number;
}) {
  const scoredWeight = results.reduce((sum, r) => sum + (r.metric.weight > 0 && r.achievement !== null ? r.metric.weight : 0), 0);
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>KPI</TableHead>
          <TableHead className="text-right">Actual</TableHead>
          <TableHead className="text-right">Target (month)</TableHead>
          <TableHead className="text-right">Expected to date</TableHead>
          <TableHead className="min-w-44">Achievement</TableHead>
          <TableHead className="text-right">Weight</TableHead>
          {mono && <TableHead className="text-right">Poin</TableHead>}
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((r) => {
          const pct = r.achievement === null ? null : r.achievement * 100;
          const status = r.metric.weight === 0 ? null : statusOf(pct);
          const unit = r.metric.unit;
          return (
            <TableRow key={r.metric.id}>
              <TableCell>
                <span className="flex items-center gap-1.5 font-medium">
                  {r.metric.name}
                  {r.metric.description && (
                    <Tooltip>
                      <TooltipTrigger aria-label={`About ${r.metric.name}`}>
                        <InfoIcon className="size-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64 whitespace-normal">{r.metric.description}</TooltipContent>
                    </Tooltip>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{r.metric.higherIsBetter ? "Higher is better" : "Lower is better"}</span>
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">{r.actual === null ? "–" : formatValue(r.actual, unit)}</TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">{r.target === null ? "–" : formatValue(r.target, unit)}</TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">{r.expected === null ? "–" : formatValue(unit === "number" && r.metric.aggregation === "sum" ? Math.round(r.expected) : r.expected, unit)}</TableCell>
              <TableCell>
                {pct === null ? (
                  <span className="text-sm text-muted-foreground">{r.metric.targetMode === "growth" && r.target === null ? "Belum ada baseline" : r.actual === null && r.target !== null ? "Belum ada data" : "No target"}</span>
                ) : (
                  <span className="flex items-center gap-2.5">
                    {mono ? (
                      <MonoMeter value={pct} size="sm" className="min-w-20" />
                    ) : (
                    <span className="h-1.5 w-full min-w-20 overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn("block h-full rounded-full", TONE_BAR[STATUS_META[statusOf(pct)].tone])}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </span>
                    )}
                    <span className="w-12 text-right text-sm tabular-nums">{formatNumber(pct, 0)}%</span>
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.metric.weight ? `${r.metric.weight}%` : <span className="text-muted-foreground">tracked</span>}</TableCell>
              {mono && (
                <TableCell className="text-right tabular-nums">
                  {r.metric.weight > 0 && r.achievement !== null && scoredWeight ? (
                    <>
                      <span className="font-medium">{formatNumber(((r.achievement * r.metric.weight * 100) / scoredWeight) * pointScale, 1)}</span>
                      <span className="text-muted-foreground"> / {formatNumber(((r.metric.weight * 100) / scoredWeight) * pointScale, 0)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </TableCell>
              )}
              <TableCell>{status ? <KpiStatusLabel status={status} mono={mono} /> : <span className="text-sm text-muted-foreground">–</span>}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
