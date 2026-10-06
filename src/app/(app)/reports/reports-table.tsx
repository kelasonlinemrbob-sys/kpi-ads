"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheckIcon, ChevronRightIcon, ClipboardListIcon, LoaderIcon } from "lucide-react";
import { toast } from "sonner";
import type { DailyReport, Role } from "@/db/schema";
import { approveReports } from "@/actions/reports";
import { ROLE_LABEL } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { ReportStatus } from "@/components/report-status";
import { UserAvatar } from "@/components/user-avatar";

export type ReportRow = {
  id: number;
  date: string;
  status: DailyReport["status"];
  summary: string;
  userId: number;
  name: string;
  avatarId?: number | null;
  role: Role;
  secondaryRole: Role | null;
  /** Advertiser-only reports are recorded without review. */
  noReview: boolean;
  createdAt: string;
  highlights: { label: string; value: string }[];
};

export function ReportsTable({ rows, canApprove, showMember }: { rows: ReportRow[]; canApprove: boolean; showMember: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [pending, startTransition] = React.useTransition();
  const selectable = rows.filter((r) => r.status === "submitted" && !r.noReview);
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));

  React.useEffect(() => setSelected(new Set()), [rows]);

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const approve = () =>
    startTransition(async () => {
      await approveReports([...selected]);
      toast.success(`${selected.size} report${selected.size > 1 ? "s" : ""} approved`);
      setSelected(new Set());
      router.refresh();
    });

  return (
    <Panel
      title={`${rows.length} report${rows.length === 1 ? "" : "s"}`}
      icon={ClipboardListIcon}
      iconPosition="left"
      action={
        canApprove && (
          <Button size="sm" className="h-8" disabled={selected.size === 0 || pending} onClick={approve}>
            {pending ? <LoaderIcon className="animate-spin" /> : <CheckCheckIcon />}
            Approve selected{selected.size ? ` (${selected.size})` : ""}
          </Button>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardListIcon} title="No reports" description="Nothing matches these filters for the selected month." />
      ) : (
        <div className="p-1.5">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {canApprove && (
                  <TableHead>
                    <Checkbox
                      aria-label="Select all pending"
                      checked={allSelected}
                      disabled={selectable.length === 0}
                      onCheckedChange={(v) => setSelected(v ? new Set(selectable.map((r) => r.id)) : new Set())}
                    />
                  </TableHead>
                )}
                <TableHead>Date</TableHead>
                {showMember && <TableHead>Member</TableHead>}
                <TableHead>Key Numbers</TableHead>
                <TableHead className="hidden min-w-64 2xl:table-cell">Summary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                  {canApprove && (
                    <TableCell>
                      <Checkbox
                        aria-label={`Select report ${r.id}`}
                        checked={selected.has(r.id)}
                        disabled={r.status !== "submitted" || r.noReview}
                        onCheckedChange={() => toggle(r.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium tabular-nums">
                    {formatDate(r.date, { weekday: "short", day: "2-digit", month: "short" })}
                  </TableCell>
                  {showMember && (
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <UserAvatar name={r.name} avatarId={r.avatarId} className="size-7" />
                        <span>
                          <span className="block font-medium">{r.name}</span>
                          <span className="block text-xs text-muted-foreground">{ROLE_LABEL[r.role]}{r.secondaryRole && r.secondaryRole !== r.role ? ` + ${ROLE_LABEL[r.secondaryRole]}` : ""}</span>
                        </span>
                      </span>
                    </TableCell>
                  )}
                  <TableCell>
                    <span className="flex gap-3">
                      {r.highlights.map((h) => (
                        <span key={h.label}>
                          <span className="block text-xs text-muted-foreground">{h.label}</span>
                          <span className="block font-medium tabular-nums">{h.value}</span>
                        </span>
                      ))}
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-80 truncate text-muted-foreground 2xl:table-cell">{r.summary}</TableCell>
                  <TableCell>
                    <ReportStatus status={r.status} noReview={r.noReview} />
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="icon-sm" aria-label="Open report">
                      <Link href={`/reports/${r.id}`}>
                        <ChevronRightIcon />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
