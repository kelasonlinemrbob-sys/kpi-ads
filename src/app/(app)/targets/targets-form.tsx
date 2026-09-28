"use client";

import * as React from "react";
import { useActionState } from "react";
import { LoaderIcon, SaveIcon, TargetIcon } from "lucide-react";
import { toast } from "sonner";
import { saveTargets } from "@/actions/team";
import { cn, type Unit } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Panel } from "@/components/dashboard/panel";
import { UserAvatar } from "@/components/user-avatar";

type M = { id: number; name: string; unit: Unit; aggregation: string; higherIsBetter: boolean; weight: number; defaultTarget: number | null };
type Member = { id: number; name: string; title: string | null; targets: Record<number, number> };

const unitHint = (u: Unit) => (u === "currency" ? "Rp" : u === "percent" ? "%" : u === "ratio" ? "x" : "");

export function TargetsForm({ role, period, metrics, members }: { role: string; period: string; metrics: M[]; members: Member[] }) {
  const [state, action, pending] = useActionState(saveTargets, undefined);
  const [weights, setWeights] = React.useState<Record<number, string>>(() => Object.fromEntries(metrics.map((m) => [m.id, String(m.weight)])));
  const total = Object.values(weights).reduce((s, v) => s + (Number(v) || 0), 0);

  React.useEffect(() => {
    if (state?.ok) toast.success(state.message);
  }, [state]);

  const cell = "h-8 w-full min-w-28 rounded-md border bg-card px-2 text-right text-sm tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30";

  return (
    <form action={action}>
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="role" value={role} />
      <Panel
        title="Targets"
        icon={TargetIcon}
        iconPosition="left"
        action={
          <div className="flex items-center gap-3">
            <span className={cn("hidden text-sm sm:inline", total === 100 ? "text-muted-foreground" : "text-warning")}>Weights total: {total}%</span>
            <Button type="submit" size="sm" className="h-8" disabled={pending}>
              {pending ? <LoaderIcon className="animate-spin" /> : <SaveIcon />} Save targets
            </Button>
          </div>
        }
      >
        <div className="p-1.5">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-52">KPI →</TableHead>
                {metrics.map((m) => (
                  <TableHead key={m.id} className="text-right">
                    <span className="block">{m.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {m.aggregation === "sum" ? "monthly total" : m.aggregation === "avg" ? "daily average" : m.aggregation === "last" ? "month-end value" : "ratio"}
                      {!m.higherIsBetter && " · max"} {unitHint(m.unit) && `(${unitHint(m.unit)})`}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell className="font-medium">
                  Weight <span className="block text-xs font-normal text-muted-foreground">Share of the KPI score (0 = tracked only)</span>
                </TableCell>
                {metrics.map((m) => (
                  <TableCell key={m.id}>
                    <input
                      name={`weight_${m.id}`}
                      type="number"
                      min={0}
                      max={100}
                      value={weights[m.id] ?? ""}
                      onChange={(e) => setWeights((w) => ({ ...w, [m.id]: e.target.value }))}
                      className={cell}
                      aria-label={`${m.name} weight`}
                    />
                  </TableCell>
                ))}
              </TableRow>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell className="font-medium">
                  Role default <span className="block text-xs font-normal text-muted-foreground">Used when a member has no override</span>
                </TableCell>
                {metrics.map((m) => (
                  <TableCell key={m.id}>
                    <input
                      name={`default_${m.id}`}
                      type="number"
                      min={0}
                      step="any"
                      defaultValue={m.defaultTarget ?? ""}
                      className={cn(cell, m.unit === "currency" && "min-w-36")}
                      aria-label={`${m.name} default target`}
                    />
                  </TableCell>
                ))}
              </TableRow>
              {members.map((mem) => (
                <TableRow key={mem.id}>
                  <TableCell>
                    <span className="flex items-center gap-2.5">
                      <UserAvatar name={mem.name} className="size-7" />
                      <span>
                        <span className="block font-medium">{mem.name}</span>
                        <span className="block text-xs text-muted-foreground">{mem.title}</span>
                      </span>
                    </span>
                  </TableCell>
                  {metrics.map((m) => (
                    <TableCell key={m.id}>
                      <input
                        name={`target_${mem.id}_${m.id}`}
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={mem.targets[m.id] ?? ""}
                        placeholder={m.defaultTarget === null ? "—" : String(m.defaultTarget)}
                        className={cn(cell, m.unit === "currency" && "min-w-36", mem.targets[m.id] !== undefined && "border-foreground/30 font-medium")}
                        aria-label={`${mem.name} ${m.name} target`}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {members.length === 0 && <p className="p-5 text-center text-sm text-muted-foreground">No active members with this role.</p>}
        </div>
      </Panel>
      {state?.error && <p className="mt-3 text-sm text-destructive">{state.error}</p>}
      <p className="mt-3 text-xs text-muted-foreground">
        Weights and role defaults apply to every month; member overrides apply to the selected month only. Monthly totals are pro-rated
        by elapsed days when scoring the running month.
      </p>
    </form>
  );
}
