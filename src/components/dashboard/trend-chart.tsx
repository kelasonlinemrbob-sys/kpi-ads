"use client";

import * as React from "react";
import { ChartColumnIcon, TableIcon } from "lucide-react";
import { cn, formatDelta, formatValue, parseISODate, type Unit } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonoDelta } from "./mono";
import { Panel } from "./panel";

export type TrendSeries = {
  key: string;
  label: string;
  unit: Unit;
  higherIsBetter: boolean;
  total: number | null;
  delta: number | null;
  points: { date: string; value: number }[];
  /** Daily target in the same unit (monthly target spread over the month for totals). */
  target?: number | null;
  /** Totals get "average per day"; averages and ratios don't. */
  summable?: boolean;
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

/** A day "hits" the target when it is at or past it in the good direction. Days without data never do. */
const hits = (value: number, series: TrendSeries) =>
  series.target != null && value > 0 && (series.higherIsBetter ? value >= series.target : value <= series.target);

export function TrendChart({
  title,
  series,
  defaultKey,
  deltaLabel = "vs last month",
}: {
  title: string;
  series: TrendSeries[];
  defaultKey?: string;
  deltaLabel?: string;
}) {
  const [key, setKey] = React.useState(defaultKey ?? series[0]?.key);
  const [view, setView] = React.useState<"chart" | "table">("chart");
  const current = series.find((s) => s.key === key) ?? series[0];

  return (
    <Panel
      title={title}
      icon={ChartColumnIcon}
      iconPosition="left"
      action={
        <span className="flex items-center gap-1.5">
          {series.length > 1 && (
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
          )}
          <span className="inline-flex rounded-md border bg-card p-0.5" role="group" aria-label="View">
            {(
              [
                ["chart", ChartColumnIcon, "Grafik"],
                ["table", TableIcon, "Tabel"],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                aria-pressed={view === value}
                aria-label={label}
                title={label}
                className={cn(
                  "rounded-[5px] p-1 text-muted-foreground transition-colors hover:text-foreground",
                  view === value && "bg-foreground text-background hover:text-background",
                )}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </span>
        </span>
      }
    >
      {current ? (
        <div className="px-3 pt-3 pb-3 sm:px-4">
          <Summary series={current} deltaLabel={deltaLabel} />
          {view === "chart" ? <Bars series={current} /> : <DayTable series={current} />}
        </div>
      ) : (
        <p className="p-5 text-sm text-muted-foreground">No data.</p>
      )}
    </Panel>
  );
}

function Summary({ series, deltaLabel }: { series: TrendSeries; deltaLabel: string }) {
  const withData = series.points.filter((p) => p.value > 0);
  const best = withData.length
    ? withData.reduce((a, b) => (series.higherIsBetter ? (b.value > a.value ? b : a) : b.value < a.value ? b : a))
    : null;
  const hitDays = series.target != null ? series.points.filter((p) => hits(p.value, series)).length : null;
  const stats: [string, string][] = [];
  if (series.summable && series.total !== null && series.points.length) {
    stats.push(["Rata-rata / hari", formatValue(series.total / series.points.length, series.unit, true)]);
  }
  if (best) stats.push([series.higherIsBetter ? "Hari terbaik" : "Hari terendah", `${formatValue(best.value, series.unit, true)} · ${formatDay(best.date, false)}`]);
  if (series.target != null) stats.push(["Target / hari", formatValue(series.target, series.unit, true)]);
  if (hitDays !== null) stats.push(["Hari capai target", `${hitDays} / ${series.points.length}`]);

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-3xl leading-none font-semibold tracking-tight">
          {series.total === null ? "–" : formatValue(series.total, series.unit, series.unit === "currency")}
        </p>
        <MonoDelta delta={series.delta} label={deltaLabel} />
      </div>
      {stats.length > 0 && (
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
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
  const target = series.target ?? null;
  const max = Math.max(0, target ?? 0, ...pts.map((p) => p.value));
  const { top, step } = niceScale(max);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => top - i * step);
  const activePoint = pts[active];
  const activePct = activePoint ? (activePoint.value / top) * 100 : 0;
  const slot = 100 / Math.max(n, 1);
  const pillOnRight = active < Math.min(3, n / 3);
  // 2px surface gap between neighbouring bars; bars are capped at 24px wide.
  const pad = 1;
  const half = `min(12px, (${slot}% - ${pad * 2}px) / 2)`;
  const center = (active + 0.5) * slot;
  const barLeft = `calc(${center}% - ${half})`;
  const targetPct = target !== null && top ? (target / top) * 100 : null;
  const dense = n > 10;

  return (
    <>
      <div className="mt-5 flex gap-2">
        <div className="relative h-48 min-w-0 flex-1 sm:h-56" onMouseLeave={() => setHover(null)}>
          {/* grid: solid hairlines, recessive */}
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
                  aria-label={`${formatDay(p.date)}: ${formatValue(p.value, series.unit)}${hits(p.value, series) ? ", target tercapai" : ""}`}
                >
                  <span
                    className="block w-full max-w-6 rounded-t-[4px] transition-[height,background-color] duration-300 group-focus-visible:ring-2 group-focus-visible:ring-ring"
                    style={{
                      height: `max(${h}%, ${p.value > 0 ? 3 : 1}px)`,
                      backgroundColor: isActive ? "var(--foreground)" : hits(p.value, series) ? "var(--bar-hit)" : "var(--bar)",
                    }}
                  />
                </button>
              );
            })}
          </div>
          {/* daily target: the one dashed line on the chart, because it is a threshold */}
          {targetPct !== null && (
            <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/50" style={{ bottom: `${targetPct}%` }} />
          )}
          {/* active bar marker + value pill */}
          {activePoint && (
            <>
              <span
                className="pointer-events-none absolute size-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-foreground ring-2 ring-card"
                style={{ bottom: `${activePct}%`, left: `${center}%` }}
              />
              <div
                className="pointer-events-none absolute z-10 translate-y-1/2"
                style={
                  pillOnRight
                    ? { bottom: `${activePct}%`, left: `calc(${center}% + ${half} + 10px)` }
                    : { bottom: `${activePct}%`, right: `calc(${100 - center}% + ${half} + 10px)` }
                }
              >
                <span className="block rounded-md bg-foreground px-2.5 py-1 text-xs whitespace-nowrap text-background shadow-sm">
                  <span className="font-semibold">{formatValue(activePoint.value, series.unit, true)}</span>
                  <span className="ml-1.5 opacity-70">{formatDay(activePoint.date, !dense)}</span>
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
          // Up to ~6 weeks every 5th day; longer ranges only mark the 1st (and 15th) so labels never collide.
          const show = !dense || day === 1 || (n <= 45 ? day % 5 === 0 || (i === n - 1 && day % 5 >= 3) : n <= 120 && day === 15);
          return (
            <span
              key={p.date}
              className={cn(
                "flex-1 text-center text-[11px] whitespace-nowrap text-muted-foreground tabular-nums sm:text-xs",
                i === active && "font-medium text-foreground",
                !show && "invisible",
              )}
            >
              {!dense
                ? d.toLocaleDateString("en-US", { weekday: "short" })
                : day === 1 && n > 31
                  ? d.toLocaleDateString("en-GB", n > 120 ? { month: "short" } : { day: "numeric", month: "short" })
                  : day}
            </span>
          );
        })}
      </div>
      {target !== null && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Key style={{ backgroundColor: "var(--bar-hit)" }} label="Capai target" />
          <Key style={{ backgroundColor: "var(--bar)" }} label="Di bawah target" />
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t border-dashed border-foreground/60" /> Target / hari ({formatValue(target, series.unit, true)})
          </span>
        </div>
      )}
    </>
  );
}

function Key({ style, label }: { style: React.CSSProperties; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-[3px]" style={style} />
      {label}
    </span>
  );
}

/** The chart's table twin: every value readable without hovering. */
function DayTable({ series }: { series: TrendSeries }) {
  const rows = [...series.points].reverse();
  return (
    <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Tanggal</th>
            <th className="px-3 py-2 text-right font-medium">{series.label}</th>
            {series.target != null && <th className="px-3 py-2 text-right font-medium">vs target</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const diff = series.target ? ((p.value - series.target) / series.target) * 100 : null;
            return (
              <tr key={p.date} className="border-t">
                <td className="px-3 py-1.5 text-muted-foreground">{formatDay(p.date)}</td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums">{p.value > 0 ? formatValue(p.value, series.unit) : "–"}</td>
                {series.target != null && (
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {p.value > 0 && diff !== null ? (
                      <span className={hits(p.value, series) ? "font-medium" : "text-muted-foreground"}>
                        {hits(p.value, series) ? "✓ " : ""}
                        {formatDelta(diff)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatDay(date: string, weekday = true) {
  const d = parseISODate(date);
  return weekday
    ? d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
