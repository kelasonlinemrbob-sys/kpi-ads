"use client";

import * as React from "react";
import { ChartColumnIcon } from "lucide-react";
import { cn, formatDelta, formatValue, parseISODate, type Unit } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel } from "./panel";

export type TrendSeries = {
  key: string;
  label: string;
  unit: Unit;
  higherIsBetter: boolean;
  total: number | null;
  delta: number | null;
  points: { date: string; value: number }[];
};

function niceScale(max: number) {
  if (max <= 0) return { top: 4, step: 1 };
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  return { top: step * Math.ceil(max / step), step };
}

function axisLabel(v: number, unit: Unit) {
  if (unit === "currency") return formatValue(v, "currency", true).replace("Rp ", "");
  if (unit === "ratio") return `${+v.toFixed(1)}x`;
  if (unit === "percent") return `${+v.toFixed(1)}%`;
  return formatValue(v, "number", true);
}

export function TrendChart({ title, series, defaultKey }: { title: string; series: TrendSeries[]; defaultKey?: string }) {
  const [key, setKey] = React.useState(defaultKey ?? series[0]?.key);
  const current = series.find((s) => s.key === key) ?? series[0];

  return (
    <Panel
      title={title}
      icon={ChartColumnIcon}
      iconPosition="left"
      action={
        series.length > 1 && (
          <Select value={current?.key} onValueChange={setKey}>
            <SelectTrigger className="h-7 w-auto min-w-32 gap-2 bg-card text-[13px]" aria-label="Metric">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {series.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      }
    >
      {current ? <Bars series={current} /> : <p className="p-5 text-sm text-muted-foreground">No data.</p>}
    </Panel>
  );
}

function Bars({ series }: { series: TrendSeries }) {
  const pts = series.points;
  const n = pts.length;
  const lastWithData = React.useMemo(() => {
    for (let i = n - 1; i >= 0; i--) if (pts[i]!.value > 0) return i;
    return n - 1;
  }, [pts, n]);
  const [hover, setHover] = React.useState<number | null>(null);
  const active = hover ?? lastWithData;
  const max = Math.max(0, ...pts.map((p) => p.value));
  const { top, step } = niceScale(max);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => top - i * step);
  const good = series.delta === null ? null : series.higherIsBetter ? series.delta >= 0 : series.delta <= 0;
  const activePoint = pts[active];
  const activePct = activePoint ? (activePoint.value / top) * 100 : 0;
  const slot = 100 / Math.max(n, 1);
  const pillOnRight = active < Math.min(3, n / 3);
  const dense = n > 10;
  const pad = dense ? 1.5 : 5;
  // half the rendered bar width: bars are centered in their slot and capped at 44px
  const half = `min(22px, (${slot}% - ${pad * 2}px) / 2)`;
  const center = (active + 0.5) * slot;
  const barLeft = `calc(${center}% - ${half})`;

  return (
    <div className="px-3 pt-3 pb-3 sm:px-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-2xl leading-none font-semibold tracking-tight tabular-nums sm:text-3xl">
          {series.total === null ? "–" : formatValue(series.total, series.unit, series.unit === "currency")}
        </p>
        <p className="text-sm">
          <span className={cn("tabular-nums", good === true && "text-success", good === false && "text-destructive", good === null && "text-muted-foreground")}>
            {formatDelta(series.delta)}
          </span>
          <span className="ml-1.5 text-muted-foreground">vs last month</span>
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        <div className="relative h-48 min-w-0 flex-1 sm:h-56" onMouseLeave={() => setHover(null)}>
          {/* grid */}
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-px bg-border/70" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          {/* bars */}
          <div className="absolute inset-0 flex items-end">
            {pts.map((p, i) => {
              const h = top ? (p.value / top) * 100 : 0;
              const isActive = i === active;
              return (
                <button
                  key={p.date}
                  type="button"
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                  style={{ padding: `0 ${pad}px` }}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${formatDay(p.date)}: ${formatValue(p.value, series.unit)}`}
                >
                  <span
                    className={cn(
                      "block w-full max-w-11 transition-[height,background] duration-300 group-focus-visible:ring-2 group-focus-visible:ring-ring",
                      dense ? "rounded-t-[4px] rounded-b-[2px]" : "rounded-[10px]",
                    )}
                    style={{
                      height: `max(${h}%, ${p.value > 0 ? 4 : 2}px)`,
                      backgroundImage: isActive
                        ? "linear-gradient(180deg, var(--bar-active), var(--bar-active-2))"
                        : "linear-gradient(180deg, var(--bar), var(--bar-2))",
                      boxShadow: isActive ? "inset 0 1px 0 rgb(255 255 255 / 0.18)" : "inset 0 1px 0 rgb(255 255 255 / 0.6)",
                    }}
                  />
                </button>
              );
            })}
          </div>
          {/* reference line + pill for the active bar */}
          {activePoint && (
            <>
              <div
                className="pointer-events-none absolute right-0 border-t border-dashed border-foreground/60"
                style={{ bottom: `${activePct}%`, left: barLeft }}
              />
              <span
                className="pointer-events-none absolute size-1.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-foreground"
                style={{ bottom: `${activePct}%`, left: barLeft }}
              />
              <div
                className="pointer-events-none absolute z-10 translate-y-1/2"
                style={
                  pillOnRight
                    ? { bottom: `${activePct}%`, left: `calc(${center}% + ${half} + 10px)` }
                    : { bottom: `${activePct}%`, right: `calc(${100 - center}% + ${half} + 10px)` }
                }
              >
                <span className="btn-primary-gradient relative block rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap text-primary-foreground shadow-md">
                  {formatDay(activePoint.date, !dense)} : {formatValue(activePoint.value, series.unit, true)}
                  <span
                    className={cn(
                      "absolute top-1/2 size-2.5 -translate-y-1/2 rotate-45 bg-[var(--bar-active-2)]",
                      pillOnRight ? "-left-1" : "-right-1",
                    )}
                  />
                </span>
              </div>
            </>
          )}
        </div>
        {/* y axis (right) */}
        <div className="relative h-48 w-10 shrink-0 sm:h-56 sm:w-12">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 translate-y-1/2 text-[11px] text-muted-foreground tabular-nums sm:text-xs"
              style={{ bottom: `${(t / top) * 100}%` }}
            >
              {axisLabel(t, series.unit)}
            </span>
          ))}
        </div>
      </div>
      {/* x axis */}
      <div className="mt-2 flex pr-[48px] sm:pr-[56px]">
        {pts.map((p, i) => {
          const d = parseISODate(p.date);
          const day = d.getDate();
          // last day gets a label only when it won't collide with the previous 5-day tick
          const show = !dense || day === 1 || day % 5 === 0 || (i === n - 1 && day % 5 >= 3);
          return (
            <span
              key={p.date}
              className={cn(
                "flex-1 text-center text-[11px] whitespace-nowrap text-muted-foreground sm:text-xs",
                i === active && "text-foreground",
                !show && "invisible",
              )}
            >
              {dense ? d.getDate() : d.toLocaleDateString("en-US", { weekday: "short" })}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function formatDay(date: string, weekday = true) {
  const d = parseISODate(date);
  return weekday
    ? d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
