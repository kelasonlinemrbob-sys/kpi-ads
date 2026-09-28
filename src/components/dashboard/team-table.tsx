"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpDownIcon,
  ClipboardListIcon,
  EllipsisVerticalIcon,
  GaugeIcon,
  ListFilterIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";
import type { Role } from "@/db/schema";
import type { KpiStatus } from "@/lib/kpi";
import { STATUS_META } from "@/lib/kpi";
import { ROLE_BADGE, ROLE_LABEL } from "@/lib/roles";
import { cn, formatDate, formatDelta, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import { KpiStatusLabel, TONE_BAR } from "./kpi-status";
import { EmptyState, Panel } from "./panel";

export type TeamRow = {
  id: number;
  name: string;
  email: string;
  role: Role;
  title: string | null;
  score: number | null;
  delta: number | null;
  status: KpiStatus;
  reportsCount: number;
  expectedReports: number;
  lastReportDate: string | null;
  reportedToday: boolean;
};

type SortKey = "name" | "role" | "score" | "reports" | "last" | "status";
const STATUS_RANK: Record<KpiStatus, number> = { exceeding: 4, on_track: 3, at_risk: 2, off_track: 1, no_data: 0 };

export function TeamTable({ rows, period, title = "Team Performance" }: { rows: TeamRow[]; period: string; title?: string }) {
  const [query, setQuery] = React.useState("");
  const [role, setRole] = React.useState<"all" | Role>("all");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });

  const q = query.trim().toLowerCase();
  const filtered = rows
    .filter((r) => (role === "all" || r.role === role) && (!q || `${r.name} ${r.email} ${r.title ?? ""}`.toLowerCase().includes(q)))
    .sort((a, b) => {
      const v = (r: TeamRow): string | number => {
        switch (sort.key) {
          case "name":
            return r.name;
          case "role":
            return ROLE_LABEL[r.role];
          case "score":
            return r.score ?? -1;
          case "reports":
            return r.expectedReports ? r.reportsCount / r.expectedReports : 0;
          case "last":
            return r.lastReportDate ?? "";
          case "status":
            return STATUS_RANK[r.status];
        }
      };
      const av = v(a);
      const bv = v(b);
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });

  const reportedToday = rows.filter((r) => r.reportedToday).length;
  const head = (key: SortKey, label: string, className?: string) => (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-2 hover:text-foreground"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "name" || key === "role" ? 1 : -1 }))}
      >
        {label}
        <ArrowUpDownIcon className={cn("size-3.5 text-muted-foreground", sort.key === key && "text-foreground")} />
      </button>
    </TableHead>
  );

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {title}
          <span className="hidden text-sm font-normal text-muted-foreground sm:inline">
            · {reportedToday}/{rows.length} reported today
          </span>
        </span>
      }
      icon={UsersIcon}
      iconPosition="left"
      action={
        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Member"
              className="h-7 w-44 rounded-md border bg-card pr-3 pl-8 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30 xl:w-56"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ListFilterIcon /> <span className="hidden sm:inline">{role === "all" ? "Filter" : ROLE_LABEL[role]}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Role</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <DropdownMenuRadioItem value="all">All roles</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="advertiser">Advertiser</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="webmaster">Web Master</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="seo">SEO Specialist</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <div className="p-2 sm:hidden">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search member"
          className="h-8 w-full rounded-lg border bg-card px-3 text-sm outline-none"
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No members found" description="Try another name or role filter." />
      ) : (
        <div className="p-1.5">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent [&>th:first-child]:rounded-l-lg [&>th:last-child]:rounded-r-lg">
                {head("name", "Member")}
                {head("role", "Role")}
                {head("score", "KPI Score", "min-w-48")}
                {head("reports", "Reports")}
                {head("last", "Last Report")}
                {head("status", "Status")}
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const tone = STATUS_META[r.status].tone;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/scorecard?user=${r.id}&period=${period}`} className="flex items-center gap-3">
                        <UserAvatar name={r.name} className="size-7" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{r.title ?? r.email}</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ROLE_BADGE[r.role]}>
                        {ROLE_LABEL[r.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-3">
                        <span className="h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-muted">
                          <span className={cn("block h-full rounded-full", TONE_BAR[tone])} style={{ width: `${Math.min(100, r.score ?? 0)}%` }} />
                        </span>
                        <span className="w-10 text-right font-medium tabular-nums">{r.score === null ? "–" : formatNumber(r.score, 0)}</span>
                        <span
                          className={cn(
                            "w-14 text-xs tabular-nums",
                            r.delta === null ? "text-muted-foreground" : r.delta >= 0 ? "text-success" : "text-destructive",
                          )}
                        >
                          {formatDelta(r.delta)}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {r.reportsCount}
                      <span className="text-muted-foreground">/{r.expectedReports}</span>
                    </TableCell>
                    <TableCell>
                      {r.reportedToday ? (
                        <span className="text-success">Today</span>
                      ) : r.lastReportDate ? (
                        formatDate(r.lastReportDate, { day: "2-digit", month: "short" })
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <KpiStatusLabel status={r.status} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.name}`}>
                            <EllipsisVerticalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/scorecard?user=${r.id}&period=${period}`}>
                              <GaugeIcon /> View scorecard
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/reports?user=${r.id}`}>
                              <ClipboardListIcon /> View reports
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link href={`/tasks?new=1&assignee=${r.id}`}>Assign a task</Link>
                          </DropdownMenuItem>
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
    </Panel>
  );
}
