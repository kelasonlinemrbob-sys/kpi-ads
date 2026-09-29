"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { CalculatorIcon, ClipboardPenIcon, LoaderIcon, LockIcon, RotateCcwIcon } from "lucide-react";
import { saveReport } from "@/actions/reports";
import { formatValue, type Unit } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/dashboard/panel";

type MetricField = {
  key: string;
  name: string;
  description: string | null;
  unit: Unit;
  aggregation: "sum" | "avg" | "last" | "ratio";
  numeratorKey: string | null;
  denominatorKey: string | null;
  higherIsBetter: boolean;
  value: number | null;
};

export function ReportForm({
  role,
  dualRole = false,
  date,
  minDate,
  maxDate,
  metrics,
  existing,
}: {
  role: string;
  dualRole?: boolean;
  date: string;
  minDate: string;
  maxDate: string;
  metrics: MetricField[];
  existing: { status: string; summary: string; blockers: string | null; planTomorrow: string | null; reviewNote: string | null } | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveReport, undefined);
  const inputs = metrics.filter((m) => m.aggregation !== "ratio");
  const derived = metrics.filter((m) => m.aggregation === "ratio");
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(inputs.map((m) => [m.key, m.value === null ? "" : String(m.value)])),
  );
  const locked = existing?.status === "approved";
  const num = (k: string | null) => Number(values[k ?? ""] || 0);

  return (
    <form action={action} className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
      <input type="hidden" name="role" value={role} />
      <div className="grid min-w-0 gap-3">
        {existing?.status === "revision" && (
          <div className="flex gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm">
            <RotateCcwIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Your supervisor requested a revision</p>
              <p className="text-muted-foreground">{existing.reviewNote}</p>
            </div>
          </div>
        )}
        {locked && (
          <div className="flex gap-3 rounded-xl border bg-muted/50 p-4 text-sm">
            <LockIcon className="mt-0.5 size-4 shrink-0" />
            This report has been approved and is locked.
          </div>
        )}

        <Panel title="KPI Numbers" icon={CalculatorIcon} iconPosition="left" bodyClassName="p-4">
          <div className="mb-4 grid gap-2 sm:max-w-60">
            <Label htmlFor="date">Report date</Label>
            <Input
              id="date"
              name="date"
              type="date"
              defaultValue={date}
              min={minDate}
              max={maxDate}
              onChange={(e) => e.target.value && router.replace(`/reports/new?date=${e.target.value}${dualRole ? `&role=${role}` : ""}`)}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {inputs.map((m) => (
              <div key={m.key} className="grid gap-2">
                <Label htmlFor={m.key}>
                  {m.name}
                  {m.aggregation === "last" && <span className="font-normal text-muted-foreground">(current total)</span>}
                  {m.aggregation === "avg" && <span className="font-normal text-muted-foreground">(today)</span>}
                </Label>
                <div className="relative">
                  {m.unit === "currency" && (
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
                  )}
                  <Input
                    id={m.key}
                    name={`metric_${m.key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={m.unit === "percent" ? 100 : undefined}
                    step="any"
                    placeholder="0"
                    value={values[m.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [m.key]: e.target.value }))}
                    className={m.unit === "currency" ? "pl-9 tabular-nums" : m.unit === "percent" ? "pr-8 tabular-nums" : "tabular-nums"}
                    disabled={locked}
                    required
                  />
                  {m.unit === "percent" && (
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  )}
                </div>
                {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Activity Summary" icon={ClipboardPenIcon} iconPosition="left" bodyClassName="grid gap-4 p-4">
          <div className="grid gap-2">
            <Label htmlFor="summary">What did you work on today?</Label>
            <Textarea
              id="summary"
              name="summary"
              rows={4}
              defaultValue={existing?.summary}
              placeholder="e.g. Scaled 2 winning ad sets, launched new retargeting audience…"
              disabled={locked}
              required
              minLength={10}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="blockers">Blockers</Label>
              <Textarea id="blockers" name="blockers" rows={3} defaultValue={existing?.blockers ?? ""} placeholder="Anything slowing you down?" disabled={locked} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="planTomorrow">Plan for tomorrow</Label>
              <Textarea id="planTomorrow" name="planTomorrow" rows={3} defaultValue={existing?.planTomorrow ?? ""} placeholder="Next steps" disabled={locked} />
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid content-start gap-3">
        {derived.length > 0 && (
          <Panel title="Calculated KPI" icon={CalculatorIcon} bodyClassName="divide-y">
            {derived.map((m) => {
              const d = num(m.denominatorKey);
              const v = d > 0 ? num(m.numeratorKey) / d : null;
              return (
                <div key={m.key} className="flex items-center justify-between px-4 py-3">
                  <span>
                    <span className="block text-sm font-medium">{m.name}</span>
                    <span className="block text-xs text-muted-foreground">{m.description}</span>
                  </span>
                  <span className="text-xl font-medium tabular-nums">{v === null ? "–" : formatValue(v, m.unit)}</span>
                </div>
              );
            })}
          </Panel>
        )}
        <div className="rounded-xl border bg-card p-4">
          {state?.error && (
            <p role="alert" className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={pending || locked}>
            {pending && <LoaderIcon className="animate-spin" />}
            {existing ? "Update report" : "Submit report"}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">You can edit a report until your supervisor approves it.</p>
        </div>
      </div>
    </form>
  );
}
