"use client";

import * as React from "react";
import { useActionState } from "react";
import { LoaderIcon, SaveIcon, TargetIcon } from "lucide-react";
import { toast } from "sonner";
import { saveTargets } from "@/actions/team";
import { periodRange } from "@/lib/kpi";
import { targetMinimum, targetMaximum } from "@/lib/target-rules";
import { cn, type Unit } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Panel } from "@/components/dashboard/panel";
import { UserAvatar } from "@/components/user-avatar";

type M = { key: string; targetMode: "monthly" | "daily" | "growth"; id: number; name: string; unit: Unit; aggregation: string; higherIsBetter: boolean; weight: number; defaultTarget: number | null };
/** `share`: the member's share of this role (100 unless they hold two roles); scales default totals. */
type Member = { id: number; name: string; title: string | null; share: number; targets: Record<number, number> };

const defaultFor = (m: M, share: number) =>
  m.defaultTarget === null ? null : m.aggregation === "sum" && m.targetMode === "monthly" && share !== 100 ? Math.round(m.defaultTarget * share) / 100 : m.defaultTarget;

const unitHint = (u: Unit) => (u === "currency" ? "Rp" : u === "percent" ? "%" : u === "ratio" ? "x" : "");

export function TargetsForm({ role, period, metrics, members }: { role: string; period: string; metrics: M[]; members: Member[] }) {
  const [state, action, pending] = useActionState(saveTargets, undefined);
  const [weights, setWeights] = React.useState<Record<number, string>>(() => Object.fromEntries(metrics.map((m) => [m.id, String(m.weight)])));
  const [chatCadence, setChatCadence] = React.useState("monthly");
  const days = periodRange(period).days;
  const [values, setValues] = React.useState<Record<string, string>>(() => Object.fromEntries(metrics.flatMap((m) => [
    [`default_${m.id}`, String(m.defaultTarget ?? "")],
    ...members.map((mem) => [`target_${mem.id}_${m.id}`, String(mem.targets[m.id] ?? "")]),
  ])));
  const changeCadence = (cadence: string) => {
    const chat = metrics.find((m) => m.key === "leads");
    if (chat && cadence !== chatCadence) setValues((current) => Object.fromEntries(Object.entries(current).map(([key, value]) =>
      [key, key.endsWith(`_${chat.id}`) && value !== "" ? String(Number(value) * (cadence === "daily" ? 1 / days : days)) : value],
    )));
    setChatCadence(cadence);
  };
  const total = Object.values(weights).reduce((s, v) => s + (Number(v) || 0), 0);

  React.useEffect(() => {
    if (state?.ok) toast.success(state.message);
  }, [state]);

  const cell = "h-8 w-full min-w-28 rounded-md border bg-card px-2 text-right text-sm tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30";

  return (
    <form action={action}>
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="chatCadence" value={chatCadence} />
      <div className="mb-3 rounded-xl border bg-muted/30 p-4 text-sm">
        {role === "advertiser" && <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="chat-cadence">Target jumlah chat</label>
          <select id="chat-cadence" value={chatCadence} onChange={(e) => changeCadence(e.target.value)} className="rounded-md border bg-card px-3 py-2">
            <option value="monthly">Bulanan</option><option value="daily">Harian</option>
          </select>
          <span className="text-muted-foreground">{days} hari dalam bulan ini. CPR = spend ÷ chat; CPLV = spend ÷ LPV. Isi batas biaya maksimum.</span>
        </div>}
        {role === "seo" && <p>SEO Score minimal 85 · minimal 1 artikel per hari kalender · impression dan klik naik minimal 5% per bulan. Pertumbuhan memakai total bulan sebelumnya; tanpa baseline positif, belum dinilai.</p>}
        {role === "webmaster" && <p>Target penyelesaian task 100%. Dihitung otomatis dari task berstatus Done, termasuk backlog dan task tanpa tenggat; task dengan tenggat setelah bulan ini tidak dihitung. Tanpa task, belum dinilai.</p>}
        {role === "creative" && <p>Atur target dan bobot KPI anggota tim.</p>}
      </div>
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
                      {m.targetMode === "growth" ? "% kenaikan / bulan" : m.targetMode === "daily" || (m.key === "leads" && chatCadence === "daily") ? "jumlah / hari" : m.aggregation === "sum" ? "monthly total" : m.aggregation === "avg" ? "daily average" : m.aggregation === "last" ? "month-end value" : "ratio"}
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
                      min={targetMinimum(m.key)}
                      step="any"
                      value={values[`default_${m.id}`] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [`default_${m.id}`]: e.target.value }))}
                      required={targetMinimum(m.key) > 0}
                      max={targetMaximum(m.key)}
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
                        <span className="block text-xs text-muted-foreground">
                          {mem.share !== 100 ? `Rangkap · porsi ${mem.share}% (default diprorata)` : mem.title}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  {metrics.map((m) => (
                    <TableCell key={m.id}>
                      <input
                        name={`target_${mem.id}_${m.id}`}
                        type="number"
                        min={targetMinimum(m.key)}
                        step="any"
                        value={values[`target_${mem.id}_${m.id}`] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [`target_${mem.id}_${m.id}`]: e.target.value }))}
                        max={targetMaximum(m.key)}
                        placeholder={defaultFor(m, mem.share) === null ? "—" : String((defaultFor(m, mem.share) ?? 0) / (m.key === "leads" && chatCadence === "daily" ? days : 1))}
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
        by elapsed days when scoring the running month. Input chat harian dikonversi menjadi target bulanan sesuai jumlah hari pada bulan terpilih. Target artikel diisi per hari; target pertumbuhan diisi dalam persen.
      </p>
    </form>
  );
}
