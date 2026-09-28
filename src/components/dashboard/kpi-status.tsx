import { AlertTriangleIcon, CircleDashedIcon, CircleCheckIcon, TrendingUpIcon, XCircleIcon } from "lucide-react";
import { STATUS_META, type KpiStatus } from "@/lib/kpi";
import { cn } from "@/lib/utils";

const ICONS = {
  exceeding: TrendingUpIcon,
  on_track: CircleCheckIcon,
  at_risk: AlertTriangleIcon,
  off_track: XCircleIcon,
  no_data: CircleDashedIcon,
};

const TONE_TEXT = {
  success: "text-success",
  info: "text-info",
  warning: "text-warning",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
};

export const TONE_BAR = {
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  destructive: "bg-destructive",
  muted: "bg-muted-foreground/40",
};

/** Status always ships as icon + label, never color alone. */
export function KpiStatusLabel({ status, className }: { status: KpiStatus; className?: string }) {
  const meta = STATUS_META[status];
  const Icon = ICONS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <Icon className={cn("size-4", TONE_TEXT[meta.tone])} />
      {meta.label}
    </span>
  );
}
