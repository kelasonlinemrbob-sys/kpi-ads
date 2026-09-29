import Link from "next/link";
import { CircleDashedIcon, CirclePauseIcon, CirclePlayIcon, CircleStopIcon, MegaphoneIcon, TriangleAlertIcon } from "lucide-react";
import type { Campaign } from "@/db/schema";
import { CAMPAIGN_STATUS_LABEL, PLATFORM_DOT, PLATFORM_LABEL } from "@/lib/labels";
import { cn, formatDate, formatNumber, formatRupiah } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type AdCampaignRow = {
  id: number;
  name: string;
  platform: Campaign["platform"];
  accountName: string;
  status: Campaign["status"];
  platformStatus: string;
  dailyBudget: number | null;
  startDate: string | null;
  endDate: string | null;
  product: { name: string; keyword: string } | null;
  owner: { name: string } | null;
  /** Month-to-date numbers from submitted advertiser reports (full days only). */
  performance: { spent: number; leads: number; clicks: number; lastDate: string } | null;
};

const STATUS_ICON = {
  active: { icon: CirclePlayIcon, tone: "text-success" },
  paused: { icon: CirclePauseIcon, tone: "text-warning" },
  draft: { icon: CircleDashedIcon, tone: "text-muted-foreground" },
  ended: { icon: CircleStopIcon, tone: "text-muted-foreground" },
};

export function AdCampaignsTable({ rows, emptyAction }: { rows: AdCampaignRow[]; emptyAction: React.ReactNode }) {
  return (
    <Panel title="Campaign Ads" icon={MegaphoneIcon} iconPosition="left">
      {rows.length === 0 ? (
        <EmptyState
          icon={MegaphoneIcon}
          title="Belum ada campaign"
          description="Tambahkan akun iklan Meta / Google, lalu klik Sinkron dari Ads."
          action={emptyAction}
        />
      ) : (
        <div className="p-1.5">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Campaign</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Budget / hari</TableHead>
                <TableHead className="text-right">Spend bulan ini</TableHead>
                <TableHead className="text-right">Lead</TableHead>
                <TableHead className="text-right">CPR</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const s = STATUS_ICON[row.status];
                const cpr = row.performance && row.performance.leads > 0 ? row.performance.spent / row.performance.leads : null;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-80">
                      <span className="block truncate font-medium" title={row.name}>{row.name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={cn("size-1.5 shrink-0 rounded-full", PLATFORM_DOT[row.platform])} />
                        <span className="truncate">
                          {PLATFORM_LABEL[row.platform]} · {row.accountName}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.product ? (
                        <span className="inline-flex items-center gap-1.5">
                          {row.product.name}
                          <span className="rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                            {row.product.keyword}
                          </span>
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-warning"
                          title="Nama campaign tidak mengandung kode product mana pun"
                        >
                          <TriangleAlertIcon className="size-3.5" /> Belum terpetakan
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.owner ? (
                        <span className="inline-flex items-center gap-2">
                          <UserAvatar name={row.owner.name} className="size-6" />
                          <span className="truncate">{row.owner.name}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.dailyBudget !== null ? formatRupiah(row.dailyBudget) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.performance ? (
                        <>
                          <span className="block">{formatRupiah(row.performance.spent)}</span>
                          <span className="block text-xs text-muted-foreground">
                            s/d {formatDate(row.performance.lastDate, { day: "2-digit", month: "short" })}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.performance ? formatNumber(row.performance.leads) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {cpr !== null ? formatRupiah(cpr) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5" title={row.platformStatus}>
                        <s.icon className={cn("size-4", s.tone)} />
                        {CAMPAIGN_STATUS_LABEL[row.status]}
                      </span>
                      {(row.startDate || row.endDate) && (
                        <span className="block text-xs text-muted-foreground">
                          {row.startDate ? formatDate(row.startDate, { day: "2-digit", month: "short" }) : "—"} →{" "}
                          {row.endDate ? formatDate(row.endDate, { day: "2-digit", month: "short" }) : "ongoing"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

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
