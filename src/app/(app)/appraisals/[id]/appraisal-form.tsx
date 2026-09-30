"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, LoaderIcon, LockOpenIcon, PrinterIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteAppraisal, finalizeAppraisal, reopenAppraisal, saveAppraisal, type AppraisalInput } from "@/actions/appraisals";
import {
  APPRAISAL_DOCUMENT,
  computeAppraisal,
  formatIdNumber,
  formatScore,
  KPI_INDICATORS,
  KPI_TIERS,
  parseIdNumber,
  SKILL_ASPECTS,
  SKILL_SCALE,
  type KpiEntry,
  type KpiIndicator,
  type KpiValues,
} from "@/lib/appraisal";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type KpiText = Record<string, { target: string; real: string; score: string }>;

const toText = (value: number | null | undefined) => (value === null || value === undefined ? "" : formatIdNumber(value));

function kpiToText(kpi: KpiValues): KpiText {
  return Object.fromEntries(
    KPI_INDICATORS.map((k) => [k.key, { target: toText(kpi[k.key]?.target), real: toText(kpi[k.key]?.real), score: toText(kpi[k.key]?.score) }]),
  );
}

function textToKpi(text: KpiText): KpiValues {
  return Object.fromEntries(
    Object.entries(text).map(([key, v]): [string, KpiEntry] => [
      key,
      { target: parseIdNumber(v.target), real: parseIdNumber(v.real), score: parseIdNumber(v.score) },
    ]),
  );
}

const formatUnit = (value: number | null, unit: KpiIndicator["unit"]) =>
  value === null ? "—" : unit === "currency" ? `Rp ${formatIdNumber(Math.round(value))}` : unit === "percent" ? `${formatScore(value, 1)}%` : formatIdNumber(value);

/* Table cell styles matching the printed form. */
const th = "border border-border bg-muted px-2 py-1.5 text-center text-xs font-semibold";
const td = "border border-border px-2 py-1.5 align-middle text-[13px]";

export function AppraisalForm({
  id,
  editable,
  canManage,
  status,
  employee,
  period,
  reviewerName,
  finalizedLabel,
  initial,
  actuals,
}: {
  id: number;
  editable: boolean;
  canManage: boolean;
  status: "draft" | "final";
  employee: { name: string };
  period: string;
  reviewerName: string | null;
  finalizedLabel: string | null;
  initial: { skillScores: Record<string, number>; skillNote: string; kpi: KpiValues; kpiNote: string };
  actuals: { leads: number; cpl: number | null; spent: number; days: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [scores, setScores] = React.useState(initial.skillScores);
  const [skillNote, setSkillNote] = React.useState(initial.skillNote);
  const [kpiText, setKpiText] = React.useState<KpiText>(() => kpiToText(initial.kpi));
  const [kpiNote, setKpiNote] = React.useState(initial.kpiNote);
  const [dirty, setDirty] = React.useState(false);

  const kpi = React.useMemo(() => textToKpi(kpiText), [kpiText]);
  const result = React.useMemo(() => computeAppraisal(scores, kpi), [scores, kpi]);
  const input = (): AppraisalInput => ({ skillScores: scores, skillNote, kpi, kpiNote });

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>, success: string, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else {
        toast.success(success);
        setDirty(false);
        after?.();
        router.refresh();
      }
    });

  const setScore = (indicatorId: string, score: number) => {
    setScores((s) => ({ ...s, [indicatorId]: score }));
    setDirty(true);
  };
  const setKpiField = (key: string, field: "target" | "real" | "score", value: string) => {
    setKpiText((t) => ({ ...t, [key]: { ...t[key]!, [field]: value } }));
    setDirty(true);
  };

  const scoredCount = Object.keys(scores).length;
  const indicatorCount = SKILL_ASPECTS.reduce((n, a) => n + a.indicators.length, 0);

  return (
    <div className="grid gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {status === "final" ? <Badge variant="success">Final</Badge> : <Badge variant="secondary">Draft</Badge>}
        <span className="text-sm text-muted-foreground">
          {status === "final"
            ? `Difinalisasi ${finalizedLabel ?? ""}${reviewerName ? ` oleh ${reviewerName}` : ""}`
            : `${scoredCount}/${indicatorCount} indikator skill dinilai`}
        </span>
        <span className="flex-1" />
        {editable && (
          <>
            <Button variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={pending} onClick={() => {
              if (confirm("Hapus draft penilaian ini?")) run(() => deleteAppraisal(id), "Draft dihapus", () => router.push("/appraisals"));
            }}>
              <Trash2Icon /> Hapus
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => run(() => saveAppraisal(id, input()), "Draft disimpan")}>
              {pending ? <LoaderIcon className="animate-spin" /> : <SaveIcon />} Simpan draft
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                if (confirm("Finalisasi penilaian? Hasilnya akan terlihat oleh karyawan dan tidak bisa diubah kecuali dibuka kembali.")) {
                  run(() => finalizeAppraisal(id, input()), "Penilaian difinalisasi");
                }
              }}
            >
              <CheckCircle2Icon /> Finalisasi
            </Button>
          </>
        )}
        {canManage && status === "final" && (
          <Button variant="outline" disabled={pending} onClick={() => run(() => reopenAppraisal(id), "Penilaian dibuka kembali")}>
            <LockOpenIcon /> Buka kembali
          </Button>
        )}
        <Button variant="outline" onClick={() => window.print()}>
          <PrinterIcon /> Cetak
        </Button>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 print:hidden">
        <SummaryCard
          title="Skill & Responsibility"
          value={result.skillTotal === null ? "—" : `${formatScore(result.skillTotal)} / 5`}
          label={result.skillCategory?.label ?? `${scoredCount} dari ${indicatorCount} indikator dinilai`}
          progress={result.skillTotal === null ? scoredCount / indicatorCount : result.skillTotal / 5}
        />
        <SummaryCard
          title="KPI Performance"
          value={result.kpiTotal === null ? "—" : `${formatScore(result.kpiTotal, 1)}%`}
          label={result.kpiTier?.label ?? "Lengkapi target, real & skor KPI"}
          progress={result.kpiTotal === null ? 0 : result.kpiTotal / 100}
        />
      </div>

      {/* The form, laid out like the printed HRGA document */}
      <article className="grid gap-8 rounded-xl border bg-card p-4 sm:p-8 print:border-0 print:p-0">
        <header className="grid gap-4">
          <p className="text-right text-[11px] text-muted-foreground">
            {APPRAISAL_DOCUMENT.company} - HRGA Department
          </p>
          <div className="text-center">
            <p className="font-semibold uppercase">{APPRAISAL_DOCUMENT.company}</p>
            <p className="text-[11px] uppercase text-muted-foreground">{APPRAISAL_DOCUMENT.department}</p>
          </div>
          <hr className="border-foreground/60" />
          <div className="text-center">
            <h1 className="text-lg font-bold uppercase sm:text-xl">{APPRAISAL_DOCUMENT.title}</h1>
            <p className="font-semibold uppercase">Jabatan: {APPRAISAL_DOCUMENT.position}</p>
          </div>
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              {[
                ["Nomor Dokumen", APPRAISAL_DOCUMENT.number],
                ["Jabatan", APPRAISAL_DOCUMENT.position],
                ["Departemen", APPRAISAL_DOCUMENT.division],
                ["Berlaku Efektif", APPRAISAL_DOCUMENT.effective],
                ["Disusun oleh", APPRAISAL_DOCUMENT.author],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className={cn(td, "w-40 bg-muted font-semibold")}>{k}</td>
                  <td className={td}>: {v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </header>

        {/* ---------------------------- Borang 1 ---------------------------- */}
        <section className="grid gap-3">
          <SectionTitle>1. Borang Penilaian Pencairan Tunjangan Skill &amp; Responsibility</SectionTitle>
          <EmployeeLines name={employee.name} period={period} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th className={cn(th, "w-10")}>No</th>
                  <th className={cn(th, "w-44")}>Aspek Penilaian</th>
                  <th className={th}>Deskripsi / Indikator</th>
                  <th className={cn(th, "w-16")}>Bobot (%)</th>
                  <th className={cn(th, "w-44")}>Skor (1-5)</th>
                  <th className={cn(th, "w-24")}>Skor x Bobot</th>
                </tr>
              </thead>
              <tbody>
                {SKILL_ASPECTS.map((aspect, ai) => {
                  const summary = result.aspects[ai]!;
                  return aspect.indicators.map((indicator, ii) => (
                    <tr key={indicator.id} className={ai % 2 ? "bg-muted/40" : undefined}>
                      {ii === 0 && (
                        <>
                          <td rowSpan={aspect.indicators.length} className={cn(td, "text-center")}>
                            {ai + 1}
                          </td>
                          <td rowSpan={aspect.indicators.length} className={td}>
                            {aspect.title}
                          </td>
                        </>
                      )}
                      <td className={td}>{indicator.text}</td>
                      {ii === 0 && (
                        <td rowSpan={aspect.indicators.length} className={cn(td, "text-center tabular-nums")}>
                          {aspect.weight}
                        </td>
                      )}
                      <td className={cn(td, "text-center")}>
                        <ScorePicker value={scores[indicator.id]} editable={editable} onChange={(s) => setScore(indicator.id, s)} />
                      </td>
                      {ii === 0 && (
                        <td rowSpan={aspect.indicators.length} className={cn(td, "text-center tabular-nums")}>
                          {summary.weighted === null ? (
                            "—"
                          ) : (
                            <>
                              <span className="block font-semibold">{formatScore(summary.weighted)}</span>
                              <span className="block text-[11px] text-muted-foreground">
                                rata-rata {formatScore(summary.average!)}
                                {!summary.complete && ` · ${summary.scored}/${aspect.indicators.length}`}
                              </span>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ));
                })}
                <tr className="font-semibold">
                  <td className={td} />
                  <td className={td} colSpan={2}>
                    TOTAL
                  </td>
                  <td className={cn(td, "text-center")}>100</td>
                  <td className={cn(td, "text-center")}>{result.skillCategory?.label ?? ""}</td>
                  <td className={cn(td, "text-center tabular-nums")}>{result.skillTotal === null ? "—" : formatScore(result.skillTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Skor aspek = rata-rata skor indikatornya. Skor x Bobot = rata-rata × bobot%. Total = jumlah Skor x Bobot (skala 1–5).
          </p>

          <p className="mt-2 text-sm font-semibold">Skala Penilaian:</p>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={cn(th, "w-20")}>Skor</th>
                <th className={th}>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {SKILL_SCALE.map((s) => (
                <tr key={s.score} className={result.skillCategory?.score === s.score ? "bg-primary/10 font-medium" : undefined}>
                  <td className={cn(td, "text-center")}>{s.score}</td>
                  <td className={td}>
                    {s.label} - {s.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Note label="Catatan / Rekomendasi Penilai:" value={skillNote} editable={editable} onChange={(v) => { setSkillNote(v); setDirty(true); }} />
        </section>

        {/* ---------------------------- Borang 2 ---------------------------- */}
        <section className="grid gap-3 print:break-before-page">
          <SectionTitle>2. Borang Penilaian KPI Performance</SectionTitle>
          <EmployeeLines name={employee.name} period={period} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th className={cn(th, "w-10")}>No</th>
                  <th className={cn(th, "w-40")}>Indikator KPI</th>
                  <th className={th}>Deskripsi / Cara Ukur</th>
                  <th className={cn(th, "w-32")}>Target</th>
                  <th className={cn(th, "w-32")}>Real</th>
                  <th className={cn(th, "w-16")}>Bobot (%)</th>
                  <th className={cn(th, "w-24")}>Skor (%)</th>
                </tr>
              </thead>
              <tbody>
                {KPI_INDICATORS.map((indicator, i) => {
                  const text = kpiText[indicator.key]!;
                  const score = result.kpis[i]!.score;
                  const fromReports =
                    indicator.key === "leads" ? (actuals.days ? actuals.leads : null) : indicator.key === "cpl" ? actuals.cpl : null;
                  return (
                    <tr key={indicator.key} className={i % 2 ? "bg-muted/40" : undefined}>
                      <td className={cn(td, "text-center")}>{i + 1}</td>
                      <td className={td}>{indicator.title}</td>
                      <td className={td}>{indicator.description}</td>
                      {indicator.mode === "manual" ? (
                        <td className={cn(td, "text-center text-muted-foreground")} colSpan={2}>
                          Dinilai oleh penilai
                        </td>
                      ) : (
                        <>
                          <td className={td}>
                            <KpiInput value={text.target} unit={indicator.unit} editable={editable} onChange={(v) => setKpiField(indicator.key, "target", v)} />
                          </td>
                          <td className={td}>
                            <KpiInput value={text.real} unit={indicator.unit} editable={editable} onChange={(v) => setKpiField(indicator.key, "real", v)} />
                            {fromReports !== null && editable && parseIdNumber(text.real) !== fromReports && (
                              <button
                                type="button"
                                className="mt-1 block text-left text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground print:hidden"
                                onClick={() => setKpiField(indicator.key, "real", formatIdNumber(fromReports))}
                              >
                                Laporan: {formatUnit(fromReports, indicator.unit)} — pakai
                              </button>
                            )}
                          </td>
                        </>
                      )}
                      <td className={cn(td, "text-center tabular-nums")}>{indicator.weight}</td>
                      <td className={cn(td, "text-center tabular-nums")}>
                        {indicator.mode === "manual" && editable ? (
                          <KpiInput value={text.score} unit="percent" editable onChange={(v) => setKpiField(indicator.key, "score", v)} />
                        ) : score === null ? (
                          "—"
                        ) : (
                          `${formatScore(score, 1)}`
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-semibold">
                  <td className={td} />
                  <td className={td} colSpan={4}>
                    TOTAL {result.kpiTier && <span className="font-normal text-muted-foreground">· {result.kpiTier.label}</span>}
                  </td>
                  <td className={cn(td, "text-center")}>100</td>
                  <td className={cn(td, "text-center tabular-nums")}>{result.kpiTotal === null ? "—" : formatScore(result.kpiTotal, 1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {editable && (
          <p className="text-xs text-muted-foreground print:hidden">
            Real jumlah lead & CPL dari laporan harian periode ini: {formatIdNumber(actuals.leads)} lead, spend Rp {formatIdNumber(actuals.spent)}
            {actuals.cpl !== null && `, CPL Rp ${formatIdNumber(actuals.cpl)}`} ({actuals.days} hari berlaporan). Angka bisa diketik dengan format 1.234 atau 54,5.
          </p>
          )}

          <p className="mt-2 text-sm font-semibold">Panduan Pengukuran Setiap Indikator:</p>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={cn(th, "w-48")}>Indikator</th>
                <th className={th}>Panduan Pengukuran</th>
              </tr>
            </thead>
            <tbody>
              {KPI_INDICATORS.map((k) => (
                <tr key={k.key}>
                  <td className={cn(td, "font-semibold")}>{k.title.replace(" (Cost Per Lead)", "")}</td>
                  <td className={td}>{k.guide}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-2 text-sm font-semibold">Tabel Tingkatan (Tier) Insentif Performance:</p>
          <table className="w-full max-w-md border-collapse">
            <thead>
              <tr>
                <th className={th}>Total Pencapaian KPI</th>
                <th className={th}>Kategori</th>
              </tr>
            </thead>
            <tbody>
              {KPI_TIERS.map((t) => (
                <tr key={t.label} className={result.kpiTier?.label === t.label ? "bg-primary/10 font-medium" : undefined}>
                  <td className={cn(td, "text-center")}>{t.range}</td>
                  <td className={cn(td, "text-center")}>{t.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Note label="Catatan / Rekomendasi Penilai:" value={kpiNote} editable={editable} onChange={(v) => { setKpiNote(v); setDirty(true); }} />
        </section>
      </article>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="border-b-2 border-foreground/70 pb-1 text-base font-bold uppercase">{children}</h2>;
}

function EmployeeLines({ name, period }: { name: string; period: string }) {
  return (
    <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-[13px]">
      <dt className="font-semibold">Nama Karyawan</dt>
      <dd>: {name}</dd>
      <dt className="font-semibold">Periode Penilaian</dt>
      <dd>: {period}</dd>
    </dl>
  );
}

function ScorePicker({ value, editable, onChange }: { value: number | undefined; editable: boolean; onChange: (score: number) => void }) {
  if (!editable) return <span className="font-semibold tabular-nums">{value ?? "—"}</span>;
  return (
    <>
      <span className="inline-flex gap-1 print:hidden" role="radiogroup" aria-label="Skor">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={value === s}
            onClick={() => onChange(s)}
            className={cn(
              "size-7 rounded-md border text-xs font-medium tabular-nums transition-colors",
              value === s ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {s}
          </button>
        ))}
      </span>
      <span className="hidden font-semibold print:inline">{value ?? ""}</span>
    </>
  );
}

function KpiInput({
  value,
  unit,
  editable,
  onChange,
}: {
  value: string;
  unit: KpiIndicator["unit"];
  editable: boolean;
  onChange: (value: string) => void;
}) {
  const prefix = unit === "currency" ? "Rp" : null;
  const suffix = unit === "percent" ? "%" : null;
  if (!editable) {
    return <span className="block text-center tabular-nums">{value ? `${prefix ? `${prefix} ` : ""}${value}${suffix ?? ""}` : "—"}</span>;
  }
  return (
    <span className="relative block">
      {prefix && <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-muted-foreground">{prefix}</span>}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className={cn("h-8 text-right tabular-nums print:border-0 print:shadow-none", prefix && "pl-7", suffix && "pr-6")}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
    </span>
  );
}

function Note({ label, value, editable, onChange }: { label: string; value: string; editable: boolean; onChange: (value: string) => void }) {
  return (
    <div className="mt-2 grid gap-1.5">
      <p className="text-sm font-semibold">{label}</p>
      {editable ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder="Tulis catatan atau rekomendasi…" className="print:border-0 print:shadow-none" />
      ) : (
        <p className="min-h-10 border-b border-dotted border-foreground/40 pb-1 text-sm whitespace-pre-wrap">{value || " "}</p>
      )}
    </div>
  );
}

function SummaryCard({ title, value, label, progress }: { title: string; value: string; label: string; progress: number }) {
  return (
    <div className="grid gap-2 rounded-xl border bg-card p-4">
      <p className="text-[13px] font-medium text-foreground/80">{title}</p>
      <p className="flex items-baseline gap-2">
        <span className="text-2xl font-medium tabular-nums">{value}</span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(Math.min(1, progress) * 100)}%` }} />
      </div>
    </div>
  );
}
