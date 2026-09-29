import { CircleCheckIcon, ClockIcon, RotateCcwIcon } from "lucide-react";
import type { DailyReport } from "@/db/schema";
import { cn } from "@/lib/utils";

const META = {
  submitted: { label: "Pending Review", icon: ClockIcon, tone: "text-warning" },
  approved: { label: "Approved", icon: CircleCheckIcon, tone: "text-success" },
  revision: { label: "Needs Revision", icon: RotateCcwIcon, tone: "text-destructive" },
} as const;

export function ReportStatus({
  status,
  className,
  noReview = false,
}: {
  status: DailyReport["status"];
  className?: string;
  noReview?: boolean;
}) {
  const m = noReview
    ? { label: "Tercatat", icon: CircleCheckIcon, tone: "text-success" }
    : META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <m.icon className={cn("size-4", m.tone)} />
      {m.label}
    </span>
  );
}
