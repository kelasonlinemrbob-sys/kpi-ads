import type { LucideIcon } from "lucide-react";
import { cn, formatDelta } from "@/lib/utils";
import { Panel } from "./panel";
import { Sparkline } from "./sparkline";

export function StatCard({
  title,
  icon,
  value,
  delta,
  deltaLabel = "vs last month",
  higherIsBetter = true,
  series,
  hint,
}: {
  title: string;
  icon: LucideIcon;
  value: string;
  delta: number | null;
  deltaLabel?: string;
  higherIsBetter?: boolean;
  series: number[];
  hint?: string;
}) {
  const good = delta === null ? null : higherIsBetter ? delta >= 0 : delta <= 0;
  const tone = good === null ? "muted" : good ? "success" : "destructive";
  return (
    <Panel title={title} icon={icon}>
      <div className="@container">
      <div className="flex flex-col gap-2 px-3.5 pt-3.5 pb-3 @[17rem]:flex-row @[17rem]:items-end @[17rem]:justify-between">
        <div className="min-w-0">
          <p className="text-2xl leading-none font-semibold tracking-tight whitespace-nowrap tabular-nums">{value}</p>
          <p className="mt-2 text-xs leading-snug">
            <span className={cn("tabular-nums", tone === "success" && "text-success", tone === "destructive" && "text-destructive", tone === "muted" && "text-muted-foreground")}>
              {formatDelta(delta)}
            </span>
            <span className="ml-1.5 whitespace-nowrap text-muted-foreground">{hint ?? deltaLabel}</span>
          </p>
        </div>
        {/* days without reports (e.g. Sundays) would read as crashes, so they are left out */}
        <Sparkline values={series.filter((v) => v > 0)} tone={tone} className="h-7 w-full shrink-0 @[17rem]:h-9 @[17rem]:w-20 @[22rem]:w-24" />
      </div>
      </div>
    </Panel>
  );
}
