import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "lucide-react";
import { cn, formatDelta } from "@/lib/utils";

/**
 * Black & white building blocks for the scorecard: direction is carried by an arrow and words,
 * never by red / green.
 */

export function MonoDelta({ delta, label = "vs last month", className }: { delta: number | null; label?: string; className?: string }) {
  const Icon = delta === null || delta === 0 ? MinusIcon : delta > 0 ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm", className)}>
      <Icon className="size-3.5 text-foreground" aria-hidden />
      <span className="font-medium tabular-nums">{formatDelta(delta)}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

/** Horizontal meter on a 0–max scale with a hairline tick at the target (100 = on target). */
export function MonoMeter({
  value,
  max = 120,
  target = 100,
  className,
  size = "md",
}: {
  value: number | null;
  max?: number;
  target?: number;
  className?: string;
  size?: "sm" | "md";
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className={cn("relative block w-full", className)}>
      <span className={cn("block overflow-hidden rounded-full bg-muted", size === "md" ? "h-2" : "h-1.5")}>
        <span className="block h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </span>
      <span
        className={cn("absolute top-1/2 w-px -translate-y-1/2 bg-foreground/60", size === "md" ? "h-4" : "h-3")}
        style={{ left: `${(target / max) * 100}%` }}
        aria-hidden
      />
    </span>
  );
}
