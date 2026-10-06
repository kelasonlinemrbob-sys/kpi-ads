import type { KpiMetric } from "@/db/schema";
import { hasRole, roleSlots, type RoleHolder } from "./member-roles";
import { currentPeriod, isPeriod, periodLabel, shiftPeriod, scaleTarget } from "./kpi";
import { validTarget } from "./target-rules";

export function resolveMemberTargetPeriod(raw?: string) {
  const now = currentPeriod();
  const period = isPeriod(raw) && Number(raw.slice(0, 4)) >= 1900 ? raw : now;
  const options = Array.from({ length: 24 }, (_, index) => {
    const value = shiftPeriod(now, 12 - index);
    return { value, label: value === now ? "Bulan ini" : periodLabel(value) };
  });
  if (!options.some((option) => option.value === period)) options.push({ value: period, label: periodLabel(period) });
  return { period, options };
}

export function suggestedMemberTarget(metric: KpiMetric, member: RoleHolder) {
  if (metric.defaultTarget === null) return null;
  return scaleTarget(metric, metric.defaultTarget, (roleSlots(member).find((slot) => slot.role === metric.role)?.share ?? 100) / 100);
}

/** Only explicit numeric values are saved. Blank fields preserve existing targets. */
export function parseMemberTargets(form: FormData, metrics: KpiMetric[], member: RoleHolder) {
  const period = String(form.get("targetPeriod") ?? "");
  if (!isPeriod(period) || Number(period.slice(0, 4)) < 1900) throw new Error("Pilih bulan target yang valid.");
  const allowed = new Map(metrics.filter((metric) => hasRole(member, metric.role)).map((metric) => [metric.id, metric]));
  const values: { metricId: number; target: number }[] = [];
  const seen = new Set<number>();
  for (const [key, raw] of form.entries()) {
    if (!key.startsWith("memberTarget_")) continue;
    const id = Number(key.slice("memberTarget_".length));
    const metric = allowed.get(id);
    if (!metric || seen.has(id)) throw new Error("Metrik target tidak sesuai dengan anggota ini.");
    seen.add(id);
    if (typeof raw !== "string") throw new Error("Target harus berupa angka.");
    if (!raw.trim()) continue;
    const target = Number(raw);
    if (!validTarget(metric.key, target)) throw new Error(`Target ${metric.name} tidak memenuhi batas minimum / maksimum.`);
    values.push({ metricId: id, target });
  }
  return { period, values };
}
