import { InfoIcon } from "lucide-react";
import type { MetricResult } from "@/lib/kpi";
import { STATUS_META, statusOf } from "@/lib/kpi";
import { cn, formatNumber, formatValue } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { KpiStatusLabel, TONE_BAR } from "./kpi-status";

export function KpiBreakdownTable({ results }: { results: MetricResult[] }) {
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
                  <span className="text-sm text-muted-foreground">No target</span>
                ) : (
                  <span className="flex items-center gap-2.5">
                    <span className="h-1.5 w-full min-w-20 overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn("block h-full rounded-full", TONE_BAR[STATUS_META[statusOf(pct)].tone])}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </span>
                    <span className="w-12 text-right text-sm tabular-nums">{formatNumber(pct, 0)}%</span>
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.metric.weight ? `${r.metric.weight}%` : <span className="text-muted-foreground">tracked</span>}</TableCell>
              <TableCell>{status ? <KpiStatusLabel status={status} /> : <span className="text-sm text-muted-foreground">–</span>}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
