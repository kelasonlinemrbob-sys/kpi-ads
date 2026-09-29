import type { Metadata } from "next";
import { BookOpenIcon, CalculatorIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getMetrics } from "@/lib/data";
import { MAX_ACHIEVEMENT } from "@/lib/kpi";
import { hasRole } from "@/lib/member-roles";
import { MEMBER_ROLES, ROLE_LABEL } from "@/lib/roles";
import { formatValue } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiStatusLabel } from "@/components/dashboard/kpi-status";
import { PageHeader, Panel } from "@/components/dashboard/panel";

export const metadata: Metadata = { title: "KPI Guide" };

const AGG = { sum: "Monthly total", avg: "Daily average", last: "Latest value", ratio: "Calculated ratio" };

export default async function GuidePage() {
  const user = await requireUser();
  const metrics = await getMetrics();
  const roles = user.role === "supervisor" ? MEMBER_ROLES : MEMBER_ROLES.filter((r) => hasRole(user, r));

  return (
    <>
      <PageHeader title="KPI Guide" description="How every KPI is defined, weighted and turned into a single score." />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid min-w-0 content-start gap-3">
          {roles.map((role) => (
            <Panel key={role} title={ROLE_LABEL[role]} icon={BookOpenIcon} iconPosition="left" bodyClassName="p-1.5">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>KPI</TableHead>
                    <TableHead>How it's measured</TableHead>
                    <TableHead className="text-right">Default target</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics
                    .filter((m) => m.role === role)
                    .map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="align-top whitespace-normal">
                          <span className="block font-medium">{m.name}</span>
                          <span className="block max-w-md text-xs text-muted-foreground">{m.description}</span>
                        </TableCell>
                        <TableCell className="align-top text-muted-foreground">
                          {AGG[m.aggregation]}
                          {!m.higherIsBetter && " · lower is better"}
                        </TableCell>
                        <TableCell className="text-right align-top tabular-nums">
                          {m.defaultTarget === null ? "—" : formatValue(m.defaultTarget, m.unit)}
                        </TableCell>
                        <TableCell className="text-right align-top tabular-nums">{m.weight ? `${m.weight}%` : "tracked"}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </Panel>
          ))}
        </div>
        <Panel title="How the score works" icon={CalculatorIcon} bodyClassName="grid gap-3 p-4 text-sm leading-relaxed">
          <p>
            <strong>1. Achievement per KPI.</strong> Actual ÷ target (or target ÷ actual when lower is better), capped at{" "}
            {MAX_ACHIEVEMENT * 100}% so one great KPI can&apos;t hide the others.
          </p>
          <p>
            <strong>2. Pro-rated targets.</strong> For monthly totals, the target is scaled to the days elapsed — on the 15th of a 30-day
            month you&apos;re expected to be at 50%.
          </p>
          <p>
            <strong>3. Weighted score.</strong> Achievements are averaged using each KPI&apos;s weight. 100 means exactly on target.
          </p>
          <div className="grid gap-2 rounded-xl border bg-muted/40 p-4">
            <span className="flex justify-between">
              <KpiStatusLabel status="exceeding" /> <span className="tabular-nums">≥ 100</span>
            </span>
            <span className="flex justify-between">
              <KpiStatusLabel status="on_track" /> <span className="tabular-nums">80 – 99</span>
            </span>
            <span className="flex justify-between">
              <KpiStatusLabel status="at_risk" /> <span className="tabular-nums">60 – 79</span>
            </span>
            <span className="flex justify-between">
              <KpiStatusLabel status="off_track" /> <span className="tabular-nums">&lt; 60</span>
            </span>
          </div>
          <p className="text-muted-foreground">
            Numbers come from daily reports. Submit one every working day (Mon–Sat); missed or late reports lower your score because the
            pro-rated target keeps growing.
          </p>
        </Panel>
      </div>
    </>
  );
}
