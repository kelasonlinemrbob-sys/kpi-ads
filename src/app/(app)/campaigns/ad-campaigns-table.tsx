import Link from "next/link";
import { cn } from "@/lib/utils";
export { AdCampaignsTable, type AdCampaignRow } from "./campaign-performance-table";

export function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1 text-sm transition-colors",
        active ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
