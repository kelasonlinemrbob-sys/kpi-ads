import { webmasterSummary } from "@/lib/webmaster-report";
import type { WebmasterTaskSnapshot } from "@/db/schema";
import { formatNumber } from "@/lib/utils";

export function WebmasterTaskSummary({ items }: { items: Pick<WebmasterTaskSnapshot, "status" | "minutesSpent">[] }) {
  const summary = webmasterSummary(items);
  return <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-4">
    <div><p className="text-xs text-muted-foreground">Task dilaporkan</p><p className="mt-1 font-medium">{summary.total}</p></div>
    <div><p className="text-xs text-muted-foreground">Selesai / review</p><p className="mt-1 font-medium">{summary.done} / {summary.review}</p></div>
    <div><p className="text-xs text-muted-foreground">Selesai dari task dilaporkan</p><p className="mt-1 font-medium">{summary.completion === null ? "—" : `${formatNumber(summary.completion, 1)}%`} / target 100%</p></div>
    <div><p className="text-xs text-muted-foreground">Durasi tercatat</p><p className="mt-1 font-medium">{summary.minutes} menit</p></div>
  </div>;
}
