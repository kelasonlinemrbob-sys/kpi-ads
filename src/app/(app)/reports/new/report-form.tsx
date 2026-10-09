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
import type { WebmasterTaskSnapshot } from "@/db/schema";
import type { WebmasterTaskOption } from "@/lib/webmaster-report";
import { WebmasterTasksEditor } from "./webmaster-tasks-editor";
import { SeoDailyTargets } from "@/components/seo-daily-targets";
import { SEO_REPORT_KEYS, isSeoReportKey, seoValueError, type SeoDailyTarget } from "@/lib/seo-report";
import type { SeoReportFigures } from "@/lib/search-console";
import { SeoSearchConsoleFill } from "./seo-search-console-fill";

/** Report fields Search Console fills on the SEO report. */
const FROM_SEARCH_CONSOLE: Record<string, (f: SeoReportFigures) => number> = {
  seo_clicks: (f) => f.clicks,
  seo_impressions: (f) => f.impressions,
  top10_keywords: (f) => f.top10,
};

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
  seoTargets = [],
  webmasterOptions = [],
  webmasterSnapshots = [],
  existing,
}: {
  role: string;
  dualRole?: boolean;
  date: string;
  minDate: string;
  maxDate: string;
  metrics: MetricField[];
  seoTargets?: SeoDailyTarget[];
  webmasterOptions?: WebmasterTaskOption[];
  webmasterSnapshots?: WebmasterTaskSnapshot[];
  existing: { status: string; summary: string; blockers: string | null; planTomorrow: string | null; reviewNote: string | null } | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveReport, undefined);
  const inputs = metrics.filter((m) => m.aggregation !== "ratio" && m.key !== "task_completion");
  const seo = role === "seo";
  const webmaster = role === "webmaster";
  // SEO: the Search Console figures first (right under their button), then what the member fills in.
  const primaryInputs = seo ? (["seo_clicks", "seo_impressions", "seo_score", "articles"] as const).flatMap((key) => inputs.filter((m) => m.key === key)) : webmaster ? [] : inputs;
  const extraInputs = seo ? inputs.filter((m) => !isSeoReportKey(m.key)) : webmaster ? inputs : [];
  const derived = metrics.filter((m) => m.aggregation === "ratio");
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(inputs.map((m) => [m.key, m.value === null ? "" : String(m.value)])),
  );
  const locked = existing?.status === "approved";
  const [summary, setSummary] = React.useState(existing?.summary ?? "");
  const [fromSearchConsole, setFromSearchConsole] = React.useState<Set<string>>(() => new Set());
  const fillFromSearchConsole = (f: SeoReportFigures) => {
    const keys = Object.keys(FROM_SEARCH_CONSOLE).filter((k) => inputs.some((m) => m.key === k));
    setValues((v) => ({ ...v, ...Object.fromEntries(keys.map((k) => [k, String(FROM_SEARCH_CONSOLE[k]!(f))])) }));
    setFromSearchConsole(new Set(keys));
    const sites = f.sites.map((s) => s.siteUrl.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "")).join(", ");
    const line = `Search Console ${f.date}: ${f.clicks.toLocaleString("id-ID")} klik, ${f.impressions.toLocaleString("id-ID")} impresi organik, ${f.top10.toLocaleString("id-ID")} kata kunci di 10 besar (${sites}).`;
    // A summary already written is kept; the figures line is added once.
    setSummary((cur) => (cur.includes("Search Console ") ? cur.replace(/Search Console \d{4}-\d{2}-\d{2}:[^\n]*/, line) : cur.trim() ? `${cur.trim()}\n${line}` : line));
  };
  const num = (k: string | null) => Number(values[k ?? ""] || 0);

  const renderInput = (m: MetricField) => (
    <div key={m.key} className="grid gap-2">
      <Label htmlFor={m.key}>
        {m.name}
        {fromSearchConsole.has(m.key) && <span className="rounded bg-info/10 px-1.5 py-px text-[10px] font-medium text-info">dari Search Console</span>}
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
          inputMode={seo && isSeoReportKey(m.key) && m.key !== "seo_score" ? "numeric" : "decimal"}
          min={0}
          max={m.unit === "percent" || m.key === "seo_score" ? 100 : undefined}
          step={seo && isSeoReportKey(m.key) && m.key !== "seo_score" ? 1 : "any"}
          placeholder="0"
          value={values[m.key] ?? ""}
          onChange={(e) => { setValues((v) => ({ ...v, [m.key]: e.target.value })); setFromSearchConsole((s) => { const n = new Set(s); n.delete(m.key); return n; }); }}
          className={m.unit === "currency" ? "pl-9 tabular-nums" : m.unit === "percent" ? "pr-8 tabular-nums" : "tabular-nums"}
          disabled={locked}
          required={!webmaster && (!seo || isSeoReportKey(m.key))}
        />
        {m.unit === "percent" && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
        )}
      </div>
      {seo && isSeoReportKey(m.key) && <p className="text-xs font-medium text-muted-foreground">
        {m.key === "seo_score" || m.key === "articles"
          ? `Target harian: minimal ${formatValue(seoTargets.find((t) => t.key === m.key)?.dailyTarget ?? (m.key === "seo_score" ? 85 : 1), "number")}`
          : "Dari tombol Search Console di atas, atau isi jumlah hari ini (bukan total bulanan)."}
      </p>}
      {m.description && !(seo && isSeoReportKey(m.key)) && <p className="text-xs text-muted-foreground">{m.description}</p>}
    </div>
  );

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

        <Panel title={seo ? "Laporan Harian SEO" : webmaster ? "Laporan Harian Webmaster" : "KPI Numbers"} icon={CalculatorIcon} iconPosition="left" bodyClassName="p-4">
          <div className="mb-4 grid gap-2 sm:max-w-60">
            <Label htmlFor="date">{seo || webmaster ? "Tanggal laporan" : "Report date"}</Label>
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
          {seo && <div className="mb-4"><SeoSearchConsoleFill date={date} minDate={minDate} disabled={locked} onFill={fillFromSearchConsole} onPickDate={(d) => router.replace(`/reports/new?date=${d}${dualRole ? `&role=${role}` : ""}`)} /></div>}
          <div className="grid gap-4 sm:grid-cols-2">
            {primaryInputs.map(renderInput)}
          </div>
          {extraInputs.length > 0 && <details className="mt-5 rounded-lg border p-3" open={extraInputs.some((m) => m.value !== null) || undefined}>
            <summary className="cursor-pointer text-sm font-medium">{webmaster ? "Metrik teknis tambahan (opsional)" : "Metrik SEO tambahan (opsional)"}</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">{extraInputs.map(renderInput)}</div>
          </details>}
        </Panel>

        {webmaster && <WebmasterTasksEditor options={webmasterOptions} snapshots={webmasterSnapshots} locked={locked || pending} historical={date < maxDate} />}

        <Panel title={seo ? "Aktivitas SEO" : webmaster ? "Ringkasan Aktivitas Webmaster" : "Activity Summary"} icon={ClipboardPenIcon} iconPosition="left" bodyClassName="grid gap-4 p-4">
          <div className="grid gap-2">
            <Label htmlFor="summary">{seo || webmaster ? "Aktivitas dan hasil hari ini" : "What did you work on today?"}</Label>
            <Textarea
              id="summary"
              name="summary"
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={seo ? "Contoh: menerbitkan 1 artikel, memperbaiki meta description, dan memeriksa performa di Search Console…" : webmaster ? "Contoh: menyelesaikan revisi landing page, memperbaiki tracking, dan menunggu review hasil pengujian…" : "e.g. Scaled 2 winning ad sets, launched new retargeting audience…"}
              disabled={locked}
              required
              minLength={10}
            />
          </div>
          {(() => {
            const extra = (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="blockers">{seo ? "Kendala" : "Blockers"}</Label>
                  <Textarea id="blockers" name="blockers" rows={3} defaultValue={existing?.blockers ?? ""} placeholder={seo ? "Ada yang menghambat?" : "Anything slowing you down?"} disabled={locked} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="planTomorrow">{seo ? "Rencana besok" : "Plan for tomorrow"}</Label>
                  <Textarea id="planTomorrow" name="planTomorrow" rows={3} defaultValue={existing?.planTomorrow ?? ""} placeholder={seo ? "Langkah berikutnya" : "Next steps"} disabled={locked} />
                </div>
              </div>
            );
            // The SEO report keeps only what matters up front; the rest is one click away.
            return seo ? (
              <details className="rounded-lg border p-3" open={Boolean(existing?.blockers || existing?.planTomorrow) || undefined}>
                <summary className="cursor-pointer text-sm font-medium">Kendala &amp; rencana besok <span className="font-normal text-muted-foreground">(opsional)</span></summary>
                <div className="mt-3">{extra}</div>
              </details>
            ) : extra;
          })()}
        </Panel>
      </div>

      <div className="grid content-start gap-3">
        {seo && <SeoDailyTargets targets={seoTargets} values={Object.fromEntries(SEO_REPORT_KEYS.map((key) => {
          const raw = values[key]?.trim();
          const value = raw ? Number(raw) : null;
          return [key, value !== null && seoValueError(key, value) === null ? value : null];
        }))} />}
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
            {seo ? existing ? "Perbarui laporan SEO" : "Kirim laporan SEO" : webmaster ? existing ? "Perbarui laporan Webmaster" : "Kirim laporan Webmaster" : existing ? "Update report" : "Submit report"}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">You can edit a report until your supervisor approves it.</p>
        </div>
      </div>
    </form>
  );
}
