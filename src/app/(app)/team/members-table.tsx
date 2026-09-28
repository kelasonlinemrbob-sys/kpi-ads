"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EllipsisVerticalIcon, GaugeIcon, PencilIcon, PowerIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { setMemberActive } from "@/actions/team";
import type { KpiStatus } from "@/lib/kpi";
import { ROLE_BADGE, ROLE_LABEL } from "@/lib/roles";
import { formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiStatusLabel } from "@/components/dashboard/kpi-status";
import { Panel } from "@/components/dashboard/panel";
import { UserAvatar } from "@/components/user-avatar";
import { MemberDialog, type EditableMember } from "./member-dialog";

export type MemberRow = EditableMember & { lastLoginAt: string | null; score: number | null; status: KpiStatus | null };

export function MembersTable({ rows }: { rows: MemberRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<MemberRow | null>(null);

  return (
    <Panel title={`${rows.length} people`} icon={UsersIcon} iconPosition="left">
      <div className="p-1.5">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Access</TableHead>
              <TableHead className="text-right">KPI (this month)</TableHead>
              <TableHead>KPI Status</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id} className={m.isActive ? undefined : "opacity-60"}>
                <TableCell>
                  <span className="flex items-center gap-3">
                    <UserAvatar name={m.name} className="size-8" />
                    <span>
                      <span className="block font-medium">
                        {m.name} {m.isSelf && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground">{m.email}</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={ROLE_BADGE[m.role]}>
                    {ROLE_LABEL[m.role]}
                  </Badge>
                  {m.title && <span className="mt-1 block text-xs text-muted-foreground">{m.title}</span>}
                </TableCell>
                <TableCell>
                  {m.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{m.score === null ? "–" : formatNumber(m.score, 0)}</TableCell>
                <TableCell>{m.status ? <KpiStatusLabel status={m.status} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-muted-foreground">{m.lastLoginAt ?? "Never"}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.name}`}>
                        <EllipsisVerticalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(m)}>
                        <PencilIcon /> Edit
                      </DropdownMenuItem>
                      {m.role !== "supervisor" && (
                        <DropdownMenuItem asChild>
                          <Link href={`/scorecard?user=${m.id}`}>
                            <GaugeIcon /> Scorecard
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {!m.isSelf && (
                        <DropdownMenuItem
                          variant={m.isActive ? "destructive" : undefined}
                          onSelect={async () => {
                            const res = await setMemberActive(m.id, !m.isActive);
                            if (res.error) toast.error(res.error);
                            else toast.success(m.isActive ? `${m.name} deactivated` : `${m.name} activated`);
                            router.refresh();
                          }}
                        >
                          <PowerIcon className={m.isActive ? "text-destructive" : undefined} /> {m.isActive ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editing && <MemberDialog key={editing.id} member={editing} onClose={() => (setEditing(null), router.refresh())} />}
    </Panel>
  );
}
