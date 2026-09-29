import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { getScorecards } from "@/lib/data";
import { currentPeriod } from "@/lib/kpi";
import { ROLES, ROLE_LABEL } from "@/lib/roles";
import { PageHeader, Panel } from "@/components/dashboard/panel";
import { MemberDialog } from "./member-dialog";
import { MembersTable, type MemberRow } from "./members-table";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const me = await requireRole("supervisor");
  const all = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      advertiserLevel: users.advertiserLevel,
      title: users.title,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(asc(users.role), asc(users.name));
  const period = currentPeriod();
  const cards = await getScorecards(period, all.filter((u) => u.role !== "supervisor" && u.isActive));
  const scoreOf = new Map(cards.map((c) => [c.member.id, c]));

  const rows: MemberRow[] = all.map((u) => ({
    ...u,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : null,
    score: scoreOf.get(u.id)?.score ?? null,
    status: scoreOf.get(u.id)?.status ?? null,
    isSelf: u.id === me.id,
  }));

  return (
    <>
      <PageHeader title="Team Members" description="Add people, set their role and control who can access the dashboard." actions={<MemberDialog />} />
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ROLES.map((r) => (
          <Panel key={r} title={ROLE_LABEL[r]}>
            <p className="px-4 py-3 text-2xl font-medium tabular-nums">
              {all.filter((u) => u.role === r && u.isActive).length}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">active</span>
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
      <MembersTable rows={rows} />
    </>
  );
}
