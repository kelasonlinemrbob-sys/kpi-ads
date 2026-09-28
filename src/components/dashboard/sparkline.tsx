import { useId } from "react";
import { cn } from "@/lib/utils";

/** Small area sparkline. Tone follows the delta's status (good = green, bad = red). */
export function Sparkline({
  values,
  tone = "success",
  className,
}: {
  values: number[];
  tone?: "success" | "destructive" | "muted";
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const w = 120;
  const h = 48;
  const pad = 3;
  const data = values.length > 1 ? values : [0, ...(values.length ? values : [0])];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    pad + (1 - (v - min) / span) * (h - pad * 2),
  ]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x!.toFixed(1)},${y!.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const color = tone === "success" ? "var(--success)" : tone === "destructive" ? "var(--destructive)" : "var(--muted-foreground)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-10 w-28 overflow-visible", className)} aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#g${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
