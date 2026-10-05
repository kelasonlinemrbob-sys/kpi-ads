import { TargetIcon } from "lucide-react";
import { seoDailyProgress, type SeoDailyTarget } from "@/lib/seo-report";
import { cn, formatNumber } from "@/lib/utils";
import { Panel } from "@/components/dashboard/panel";

export function SeoDailyTargets({ targets, values }: { targets: SeoDailyTarget[]; values: Record<string, number | null> }) {
  return (
    <Panel title="Pencapaian Target SEO" icon={TargetIcon} bodyClassName="divide-y">
      {targets.map((target) => {
        const value = values[target.key] ?? null;
        const { growth, actual, expected, achieved } = seoDailyProgress(target, value);
        const label = expected === null ? "Belum ada baseline" : value === null ? "Belum diisi" : achieved ? growth ? "Sesuai laju target" : "Target tercapai" : growth ? "Di bawah laju target" : "Belum tercapai";
        return (
          <div key={target.key} className="space-y-2 p-4">
            <p className="text-sm font-medium">{target.name}</p>
            <p className="text-xs text-muted-foreground">
              {growth ? `Target pertumbuhan ${formatNumber(target.growthPercent ?? 0)}% / bulan` : `Target harian ≥ ${formatNumber(target.dailyTarget ?? 0, 2)}`}
            </p>
            <p className="text-lg font-medium tabular-nums">
              {actual === null ? "—" : formatNumber(actual, target.key === "seo_score" ? 2 : 0)}
              <span className="text-xs font-normal text-muted-foreground">{growth ? " bulan ini" : " hari ini"}</span>
            </p>
            {growth && <dl className="space-y-1 text-xs text-muted-foreground">
              <Row label="Total bulan sebelumnya" value={target.baseline} />
              <Row label="Target akhir bulan" value={target.monthlyTarget} />
              <Row label="Target kumulatif s.d. tanggal laporan" value={target.expectedToDate} />
              <Row label="Acuan rata-rata per hari" value={target.dailyTarget} />
            </dl>}
            <p className={cn("text-xs font-medium", achieved === null ? "text-muted-foreground" : achieved ? "text-success" : "text-warning")}>{label}</p>
          </div>
        );
      })}
      <p className="p-4 text-xs leading-relaxed text-muted-foreground">
        Impression dan klik dinilai dari total bulan berjalan sampai tanggal laporan, termasuk angka hari ini.
        Target pertumbuhan berlaku per bulan. Tanpa data bulan sebelumnya yang lebih dari 0, pertumbuhan belum dinilai.
        Target mengikuti pengaturan supervisor. Laporan tetap dapat dikirim meskipun target belum tercapai.
      </p>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: number | null }) {
  return <div className="flex justify-between gap-3"><dt>{label}</dt><dd className="shrink-0 tabular-nums">{value === null ? "—" : formatNumber(value, 2)}</dd></div>;
}
