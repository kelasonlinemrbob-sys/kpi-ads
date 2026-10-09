"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailIcon, XCircleIcon, EllipsisVerticalIcon, GaugeIcon, PencilIcon, PowerIcon, TargetIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { resendInvitationAction, revokeInvitationAction } from "@/actions/invitations";
import { setMemberActive } from "@/actions/team";
import type { KpiMetric } from "@/db/schema";
import type { KpiStatus } from "@/lib/kpi";
import { ROLE_BADGE, ROLE_LABEL, roleLabel } from "@/lib/roles";
import { cn, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiStatusLabel } from "@/components/dashboard/kpi-status";
import { Panel } from "@/components/dashboard/panel";
import { UserAvatar } from "@/components/user-avatar";
import { MemberDialog, type AdvertiserOption, type EditableMember } from "./member-dialog";
import { isTracked } from "@/lib/member-roles";

export type MemberRow = EditableMember & { invitationStatus: string | null; inviteExpiresAt: string | null; inviteRevokedAt: string | null; lastLoginAt: string | null; score: number | null; status: KpiStatus | null };

export function MembersTable({ rows, metrics, period, advertisers }: { rows: MemberRow[]; metrics: KpiMetric[]; period: string; advertisers: AdvertiserOption[] }) {
  const advertiserName = new Map(advertisers.map((a) => [a.id, a.name]));
  const router = useRouter();
  const [editing, setEditing] = React.useState<MemberRow | null>(null);

  const [busy, setBusy] = React.useState<number | null>(null);
  const invitationAction = async (id: number, revoke: boolean) => {
    setBusy(id);
    try {
      const res = await (revoke ? revokeInvitationAction(id) : resendInvitationAction(id));
      if (res?.error) toast.error(res.error);
      else toast.success(res?.message);
      router.refresh();
    } catch { toast.error("Undangan belum dapat diproses. Coba lagi nanti."); }
    finally { setBusy(null); }
  };

  return (
    <Panel title={`${rows.length} people`} icon={UsersIcon} iconPosition="left">
      <div className="p-1.5">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Target bulanan</TableHead>
              <TableHead className="text-right">KPI ({period})</TableHead>
              <TableHead>KPI Status</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id} className={m.isActive || m.invitationPending ? undefined : "opacity-60"}>
                <TableCell>
                  <span className="flex items-center gap-3">
                    <UserAvatar name={m.name} avatarId={m.avatarId} className="size-8" />
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
                    {roleLabel(m.role, m.advertiserLevel)}
                  </Badge>
                  {m.secondaryRole && (
                    <Badge variant="outline" className={cn("ml-1", ROLE_BADGE[m.secondaryRole])}>
                      + {ROLE_LABEL[m.secondaryRole]} {m.secondaryShare}%
                    </Badge>
                  )}
                  {m.role === "creative" && <span className="mt-1 block text-xs text-muted-foreground">{m.linkedAdvertiserIds?.length ? `Creative untuk ${m.linkedAdvertiserIds.map((id) => advertiserName.get(id) ?? "?").join(", ")}` : "Creative semua advertiser"}</span>}
                  {m.title && <span className="mt-1 block text-xs text-muted-foreground">{m.title}</span>}
                </TableCell>
                <TableCell>
                  {m.invitationPending ? <div className="min-w-40 space-y-1"><Badge variant="outline">{m.invitationStatus}</Badge>{m.inviteExpiresAt && !m.inviteRevokedAt && <span className="block text-xs text-muted-foreground">Berlaku sampai {new Date(m.inviteExpiresAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} WIB</span>}</div> : m.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                </TableCell>
                <TableCell>{!isTracked(m) ? <span className="text-xs text-muted-foreground">Tanpa KPI</span> : <><Link href={`/targets?user=${m.id}&period=${period}`} className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"><TargetIcon className="size-3.5" />Atur target</Link><span className="block text-xs text-muted-foreground">{Object.keys(m.targets ?? {}).length} target pribadi tersimpan</span></>}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{m.score === null ? "–" : formatNumber(m.score, 0)}</TableCell>
                <TableCell>{m.status ? <KpiStatusLabel status={m.status} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-muted-foreground">{m.lastLoginAt ?? "Never"}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" disabled={busy !== null} aria-label={`Actions for ${m.name}`}>
                        <EllipsisVerticalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(m)}>
                        <PencilIcon /> Edit
                      </DropdownMenuItem>
                      {m.role !== "supervisor" && isTracked(m) && (
                        <DropdownMenuItem asChild>
                          <Link href={`/scorecard?user=${m.id}&period=${period}`}>
                            <GaugeIcon /> Scorecard
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {m.invitationPending && <>
                        <DropdownMenuItem onSelect={() => void invitationAction(m.id, false)}><MailIcon /> Kirim ulang undangan</DropdownMenuItem>
                        {!m.inviteRevokedAt && <DropdownMenuItem variant="destructive" onSelect={() => void invitationAction(m.id, true)}><XCircleIcon /> Batalkan undangan</DropdownMenuItem>}
                      </>}
                      {!m.isSelf && !m.invitationPending && (
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
      {editing && <MemberDialog key={editing.id} metrics={metrics} period={period} advertisers={advertisers} member={editing} onClose={() => (setEditing(null), router.refresh())} />}
    </Panel>
  );
}
