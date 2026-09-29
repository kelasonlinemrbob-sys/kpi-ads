"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CircleDashedIcon,
  CirclePauseIcon,
  CirclePlayIcon,
  CircleStopIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  MegaphoneIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import type { Campaign, Role } from "@/db/schema";
import { deleteCampaign, setCampaignStatus } from "@/actions/campaigns";
import { CAMPAIGN_STATUS_LABEL, PLATFORM_DOT, PLATFORM_LABEL } from "@/lib/labels";
import { cn, formatDate, formatRupiah } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { UserAvatar } from "@/components/user-avatar";
import { CampaignDialog, type AdAccountOption, type CampaignRow } from "./campaign-dialog";

const STATUS_ICON: Record<Campaign["status"], { icon: typeof CirclePlayIcon; tone: string }> = {
  active: { icon: CirclePlayIcon, tone: "text-success" },
  paused: { icon: CirclePauseIcon, tone: "text-warning" },
  draft: { icon: CircleDashedIcon, tone: "text-muted-foreground" },
  ended: { icon: CircleStopIcon, tone: "text-muted-foreground" },
};

export function CampaignsTable({
  rows,
  currentUser,
  advertisers,
  adAccounts,
}: {
  rows: CampaignRow[];
  currentUser: { id: number; role: Role };
  advertisers: { id: number; name: string }[] | null;
  adAccounts: AdAccountOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<CampaignRow | null>(null);
  const canManage = (c: CampaignRow) =>
    currentUser.role === "supervisor" || (currentUser.role === "advertiser" && c.ownerId === currentUser.id);

  const run = async (p: Promise<{ ok?: boolean; error?: string }>, msg: string) => {
    const res = await p;
    if (res.error) toast.error(res.error);
    else {
      toast.success(msg);
      router.refresh();
    }
  };

  return (
    <Panel title="Product" icon={MegaphoneIcon} iconPosition="left">
      {rows.length === 0 ? (
        <EmptyState icon={MegaphoneIcon} title="Belum ada product" description="Product yang kamu buat akan tampil di sini." />
      ) : (
        <div className="p-1.5">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Campaign</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Daily Budget</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => {
                const s = STATUS_ICON[c.status];
                return (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-80">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{c.name}</span>
                        {c.matchKeyword && c.adAccountId && (
                          <span
                            className="shrink-0 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground"
                            title="Kode product untuk generate dari Ads"
                          >
                            {c.matchKeyword}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[c.objective, c.product].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <span className={cn("size-2 rounded-full", PLATFORM_DOT[c.platform])} />
                        {PLATFORM_LABEL[c.platform]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <UserAvatar name={c.ownerName} className="size-7" />
                        {c.ownerName}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatRupiah(c.dailyBudget)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.startDate ? formatDate(c.startDate, { day: "2-digit", month: "short" }) : "—"}
                      {" → "}
                      {c.endDate ? formatDate(c.endDate, { day: "2-digit", month: "short" }) : "ongoing"}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <s.icon className={cn("size-4", s.tone)} />
                        {CAMPAIGN_STATUS_LABEL[c.status]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.name}`}>
                            <EllipsisVerticalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {c.landingPageUrl && (
                            <DropdownMenuItem asChild>
                              <a href={c.landingPageUrl} target="_blank" rel="noreferrer">
                                <ExternalLinkIcon /> Open landing page
                              </a>
                            </DropdownMenuItem>
                          )}
                          {canManage(c) && (
                            <>
                              <DropdownMenuItem onSelect={() => setEditing(c)}>
                                <PencilIcon /> Edit
                              </DropdownMenuItem>
                              {c.status !== "active" && (
                                <DropdownMenuItem onSelect={() => run(setCampaignStatus(c.id, "active"), "Campaign activated")}>
                                  <CirclePlayIcon /> Activate
                                </DropdownMenuItem>
                              )}
                              {c.status === "active" && (
                                <DropdownMenuItem onSelect={() => run(setCampaignStatus(c.id, "paused"), "Campaign paused")}>
                                  <CirclePauseIcon /> Pause
                                </DropdownMenuItem>
                              )}
                              {c.status !== "ended" && (
                                <DropdownMenuItem onSelect={() => run(setCampaignStatus(c.id, "ended"), "Campaign ended")}>
                                  <CircleStopIcon /> End campaign
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => {
                                  if (confirm(`Delete “${c.name}”? This can't be undone.`)) run(deleteCampaign(c.id), "Campaign deleted");
                                }}
                              >
                                <Trash2Icon className="text-destructive" /> Delete
                              </DropdownMenuItem>
                            </>
                          )}
                          {!canManage(c) && !c.landingPageUrl && (
                            <DropdownMenuItem disabled>View only</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {editing && (
        <CampaignDialog
          key={editing.id}
          campaign={editing}
          advertisers={advertisers}
          adAccounts={adAccounts}
          open
          onOpenChange={(o) => {
            if (!o) {
              setEditing(null);
              router.refresh();
            }
          }}
        />
      )}
    </Panel>
  );
}
