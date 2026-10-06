import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberInvitations, users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { getScorecards, getMetrics, getTargetMap } from "@/lib/data";
import { resolveMemberTargetPeriod } from "@/lib/member-targets";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { ROLES, ROLE_LABEL } from "@/lib/roles";
import { PageHeader, Panel } from "@/components/dashboard/panel";
import { MemberDialog } from "./member-dialog";
import { MembersTable, type MemberRow } from "./members-table";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const me = await requireRole("supervisor");
  const all = await db
    .select({
      id: users.id,
      name: users.name, avatarId: users.avatarId,
      email: users.email,
      role: users.role,
      advertiserLevel: users.advertiserLevel,
      secondaryRole: users.secondaryRole,
      secondaryShare: users.secondaryShare,
      title: users.title, csoPhone: users.csoPhone,
      isActive: users.isActive,
      invitationPending: users.invitationPending,
      inviteExpiresAt: memberInvitations.expiresAt,
      inviteRevokedAt: memberInvitations.revokedAt,
      inviteDelivery: memberInvitations.deliveryStatus,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .leftJoin(memberInvitations, eq(memberInvitations.userId, users.id))
    .orderBy(asc(users.role), asc(users.name));
  const { period, options } = resolveMemberTargetPeriod((await searchParams).period);
  const [metrics, targets] = await Promise.all([getMetrics(), getTargetMap(period, all.map((user) => user.id))]);
  const cards = await getScorecards(period, all.filter((u) => u.role !== "supervisor" && u.isActive));
  const scoreOf = new Map(cards.map((c) => [c.member.id, c]));

  const rows: MemberRow[] = all.map((u) => ({
    ...u,
    inviteExpiresAt: u.inviteExpiresAt?.toISOString() ?? null,
    inviteRevokedAt: u.inviteRevokedAt?.toISOString() ?? null,
    invitationStatus: !u.invitationPending ? null : u.inviteRevokedAt ? "Dibatalkan" : u.inviteExpiresAt && u.inviteExpiresAt <= new Date() ? "Kedaluwarsa" : u.inviteDelivery === "failed" ? "Email gagal dikirim" : u.inviteDelivery === "sent" ? "Menunggu bergabung" : u.inviteExpiresAt ? "Menunggu pengiriman" : "Belum diundang",
    targets: Object.fromEntries(targets.get(u.id) ?? []),
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : null,
    score: scoreOf.get(u.id)?.score ?? null,
    status: scoreOf.get(u.id)?.status ?? null,
    isSelf: u.id === me.id,
  }));

  return (
    <>
      <PageHeader title="Team Members" description="Undang anggota melalui email, kelola akses, dan atur target KPI pribadi setiap bulan." actions={<><PeriodSelect value={period} options={options} /><MemberDialog key={period} metrics={metrics} period={period} /></>} />
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ROLES.map((r) => (
          <Panel key={r} title={ROLE_LABEL[r]}>
            <p className="px-4 py-3 text-2xl font-medium tabular-nums">
              {all.filter((u) => u.role === r && u.isActive).length}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">active</span>
              {all.some((u) => u.secondaryRole === r && u.isActive) && (
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                  + {all.filter((u) => u.secondaryRole === r && u.isActive).length} rangkap
                </span>
              )}
              {r === "advertiser" && (
                <span className="block text-xs font-normal text-muted-foreground">
                  {all.filter((u) => u.role === r && u.isActive && u.advertiserLevel === "senior").length} senior ·{" "}
                  {all.filter((u) => u.role === r && u.isActive && u.advertiserLevel !== "senior").length} junior
                </span>
              )}
            </p>
          </Panel>
        ))}
      </div>
      <MembersTable key={period} rows={rows} metrics={metrics} period={period} />
    </>
  );
}
