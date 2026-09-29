import type { MetaConnectionStatus } from "@/lib/meta-connection";
import { Badge } from "@/components/ui/badge";

const STATE_BADGE: Record<MetaConnectionStatus["state"], { label: string; variant: "success" | "warning" | "destructive" | "outline" }> = {
  none: { label: "Belum terhubung", variant: "outline" },
  ok: { label: "Terhubung", variant: "success" },
  expiring: { label: "Segera kedaluwarsa", variant: "warning" },
  expired: { label: "Kedaluwarsa", variant: "destructive" },
  invalid: { label: "Token bermasalah", variant: "destructive" },
};

export function MetaStatusBadge({ status }: { status: MetaConnectionStatus }) {
  const badge = STATE_BADGE[status.state];
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}
