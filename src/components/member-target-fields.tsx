"use client";

import type { KpiMetric } from "@/db/schema";
import { roleSlots, type RoleHolder } from "@/lib/member-roles";
import { suggestedMemberTarget } from "@/lib/member-targets";
import { targetMinimum, targetMaximum } from "@/lib/target-rules";
import { ROLE_LABEL } from "@/lib/roles";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MemberTargetFields({ metrics, member, targets = {}, period }: {
  metrics: KpiMetric[]; member: RoleHolder; targets?: Record<number, number>; period: string;
}) {
  return <section className="grid gap-4 rounded-xl border bg-muted/20 p-4">
    <input type="hidden" name="targetPeriod" value={period} />
    <div><h3 className="font-semibold">Target KPI bulanan · {period}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Nilai disimpan khusus untuk anggota dan bulan ini. Sesuaikan nilai awal sebelum menyimpan. Kolom kosong tidak mengubah target tersimpan.</p></div>
    {roleSlots(member).map((slot) => {
      const list = metrics.filter((metric) => metric.role === slot.role);
      const renderMetric = (metric: KpiMetric) => {
        const value = targets[metric.id] ?? suggestedMemberTarget(metric, member);
        const unit = metric.targetMode === "growth" ? "% kenaikan dari bulan sebelumnya" : metric.targetMode === "daily" ? "per hari kalender pada bulan ini" : metric.unit === "currency" ? "Rp" : metric.unit === "percent" ? "%" : metric.unit === "ratio" ? "rasio" : metric.aggregation === "sum" ? "total bulan ini" : "nilai pada bulan ini";
        return <div key={`${period}-${slot.role}-${metric.id}`} className="grid content-start gap-1.5">
          <Label htmlFor={`member-target-${metric.id}`}>{metric.name}{!metric.higherIsBetter && <span className="font-normal text-muted-foreground"> · maks.</span>}</Label>
          <Input id={`member-target-${metric.id}`} name={`memberTarget_${metric.id}`} type="number" inputMode="decimal" step="any" min={targetMinimum(metric.key)} max={targetMaximum(metric.key)} defaultValue={value ?? ""} placeholder="Belum ditetapkan" aria-describedby={`member-target-hint-${metric.id}`} />
          <p id={`member-target-hint-${metric.id}`} className="text-xs text-muted-foreground">{unit}{targets[metric.id] !== undefined ? " · target pribadi tersimpan" : ""}</p>
        </div>;
      };
      return <div key={slot.role} className="grid gap-3">
        <h4 className="text-sm font-medium">{ROLE_LABEL[slot.role]}{roleSlots(member).length > 1 && <span className="font-normal text-muted-foreground"> · bobot peran {slot.share}%</span>}</h4>
        <div className="grid gap-4 sm:grid-cols-2">{list.filter((metric) => metric.weight > 0).map(renderMetric)}</div>
        {list.some((metric) => metric.weight === 0) && <details className="rounded-lg border bg-card p-3"><summary className="cursor-pointer text-xs font-medium">Target metrik tambahan</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">{list.filter((metric) => metric.weight === 0).map(renderMetric)}</div></details>}
      </div>;
    })}
    <p className="text-xs text-muted-foreground">Target pribadi tidak diprorata oleh porsi role. Artikel menggunakan target harian; impression dan klik SEO menggunakan persentase pertumbuhan untuk bulan terpilih.</p>
  </section>;
}
