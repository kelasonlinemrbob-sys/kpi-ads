import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getMembers, getMetrics, getTargetMap } from "@/lib/data";
import { hasRole, roleSlots } from "@/lib/member-roles";
import { MEMBER_ROLES, ROLE_LABEL } from "@/lib/roles";
import { resolvePeriod } from "@/lib/period";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/panel";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { TargetsForm } from "./targets-form";

export const metadata: Metadata = { title: "KPI Targets" };

export default async function TargetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("supervisor");
  const sp = await searchParams;
  const { period, options } = resolvePeriod(sp.period);
  const role = MEMBER_ROLES.find((r) => r === sp.role) ?? "advertiser";
  const [metrics, members] = await Promise.all([getMetrics(), getMembers(false, true)]);
  const roleMetrics = metrics.filter((m) => m.role === role);
  // Members holding the role as main or second role; the second role's defaults are prorated by its share.
  const roleMembers = members.filter((m) => hasRole(m, role));
  const targets = await getTargetMap(period, roleMembers.map((m) => m.id));

  return (
    <>
      <PageHeader
        title="KPI Targets"
        description="Monthly targets and weights per role. Leave a member's cell empty to use the role default."
        actions={<PeriodSelect value={period} options={options} />}
      />
      <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl border bg-muted/50 p-1 sm:w-fit">
        {MEMBER_ROLES.map((r) => (
          <Link
            key={r}
            href={`/targets?role=${r}&period=${period}`}
            className={cn(
              "flex h-8 shrink-0 items-center rounded-lg px-4 text-sm transition-colors",
              role === r ? "bg-card font-medium shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {ROLE_LABEL[r]}
          </Link>
        ))}
      </div>
      <TargetsForm
        key={`${role}-${period}`}
        role={role}
        period={period}
        metrics={roleMetrics.map((m) => ({
          id: m.id,
          key: m.key,
          targetMode: m.targetMode,
          name: m.role === "supervisor" ? `${m.name} · Supervisor` : m.name,
          unit: m.unit,
          aggregation: m.aggregation,
          higherIsBetter: m.higherIsBetter,
          weight: m.weight,
          defaultTarget: m.defaultTarget,
        }))}
        members={roleMembers.map((m) => ({
          id: m.id,
          name: m.role === "supervisor" ? `${m.name} · Supervisor` : m.name,
          title: m.title,
          share: roleSlots(m).find((slot) => slot.role === role)?.share ?? 100,
          targets: Object.fromEntries(targets.get(m.id) ?? []),
        }))}
      />
    </>
  );
}
