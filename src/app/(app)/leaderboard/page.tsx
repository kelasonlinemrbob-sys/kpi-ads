import type { Metadata } from "next";
import Link from "next/link";
import { CrownIcon, MedalIcon, TrophyIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getMembers, getScorecards } from "@/lib/data";
import { pctDelta, periodAsOf, periodRange, STATUS_META, statusOf, workingDays } from "@/lib/kpi";
import { hasRole, reportsMondayToFriday } from "@/lib/member-roles";
import { resolvePeriod } from "@/lib/period";
import { MEMBER_ROLES, ROLE_BADGE, ROLE_LABEL } from "@/lib/roles";
import { cn, formatDelta, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiStatusLabel, TONE_BAR } from "@/components/dashboard/kpi-status";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/panel";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { UserAvatar } from "@/components/user-avatar";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { period, options } = resolvePeriod(sp.period);
  const role = MEMBER_ROLES.find((r) => r === sp.role) ?? null;
  // A role tab ranks everyone holding that role (dual-role members too) by their score in that role only;
  // "All roles" uses each member's total score.
  const members = (await getMembers()).filter((m) => !role || hasRole(m, role));
  const cards = (await getScorecards(period, members))
    .map((c) => {
      const part = role ? c.roleScores.find((r) => r.role === role) : null;
      return part ? { ...c, score: part.score, prevScore: part.prevScore, status: statusOf(part.score) } : c;
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const reportStart = periodRange(period).start;
  const reportEnd = periodAsOf(period);
  const podium = cards.slice(0, 3);
  const tabs = [{ value: null, label: "All roles" }, ...MEMBER_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))];

  return (
    <>
      <PageHeader
        title="Leaderboard"
        description="KPI score ranking. Scores are comparable across roles because each is measured against its own targets."
        actions={<PeriodSelect value={period} options={options} />}
      />
      <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl border bg-muted/50 p-1 sm:w-fit">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={`/leaderboard?period=${period}${t.value ? `&role=${t.value}` : ""}`}
            className={cn(
              "flex h-8 shrink-0 items-center rounded-lg px-4 text-sm transition-colors",
              role === t.value ? "bg-card font-medium shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {cards.length === 0 ? (
        <EmptyState icon={TrophyIcon} title="No members to rank" />
      ) : (
        <>
          <div className="mb-3 grid gap-3 md:grid-cols-3">
            {podium.map((c, i) => {
              const Icon = i === 0 ? CrownIcon : MedalIcon;
              return (
                <Panel key={c.member.id} title={`#${i + 1}`} icon={Icon} className={cn(i === 0 && "md:order-2", i === 1 && "md:order-1", i === 2 && "md:order-3")}>
                  <div className="flex flex-col items-center px-4 pt-4 pb-4 text-center">
                    <UserAvatar name={c.member.name} className={cn(i === 0 ? "size-16 text-base" : "size-12")} />
                    <p className="mt-3 font-medium">
                      {c.member.name}
                      {c.member.id === user.id && <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {ROLE_LABEL[c.member.role]}
                      {c.member.secondaryRole ? ` + ${ROLE_LABEL[c.member.secondaryRole]}` : ""}
                    </p>
                    <p className="mt-3 text-3xl font-medium tracking-tight tabular-nums">{c.score === null ? "–" : formatNumber(c.score, 1)}</p>
                    <KpiStatusLabel status={c.status} className="mt-1 text-muted-foreground" />
                  </div>
                </Panel>
              );
            })}
          </div>
          <Panel title="Full Ranking" icon={TrophyIcon} iconPosition="left" bodyClassName="p-1.5">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-14">Rank</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="min-w-52">KPI Score</TableHead>
                  <TableHead>vs last month</TableHead>
                  <TableHead>Reports</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards.map((c, i) => {
                  const d = pctDelta(c.score, c.prevScore);
                  const me = c.member.id === user.id;
                  return (
                    <TableRow key={c.member.id} className={cn(me && "bg-muted/50")}>
                      <TableCell className="font-medium tabular-nums">#{i + 1}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2.5">
                          <UserAvatar name={c.member.name} className="size-8" />
                          <span className="font-medium">
                            {user.role === "supervisor" ? <Link href={`/scorecard?user=${c.member.id}&period=${period}`}>{c.member.name}</Link> : c.member.name}
                            {me && <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ROLE_BADGE[c.member.role]}>
                          {ROLE_LABEL[c.member.role]}
                          {c.member.secondaryRole ? ` + ${ROLE_LABEL[c.member.secondaryRole]}` : ""}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-3">
                          <span className="h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-muted">
                            <span className={cn("block h-full rounded-full", TONE_BAR[STATUS_META[c.status].tone])} style={{ width: `${Math.min(100, c.score ?? 0)}%` }} />
                          </span>
                          <span className="w-12 text-right font-medium tabular-nums">{c.score === null ? "–" : formatNumber(c.score, 1)}</span>
                        </span>
                      </TableCell>
                      <TableCell className={cn("tabular-nums", d === null ? "text-muted-foreground" : d >= 0 ? "text-success" : "text-destructive")}>
                        {formatDelta(d)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {c.reportsCount}
                        <span className="text-muted-foreground">/{workingDays(reportStart, reportEnd, reportsMondayToFriday(c.member))}</span>
                      </TableCell>
                      <TableCell>
                        <KpiStatusLabel status={c.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Panel>
        </>
      )}
    </>
  );
}
