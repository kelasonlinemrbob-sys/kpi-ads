import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getMembers, getMetrics, getTargetMap } from "@/lib/data";
import { resolveMemberTargetPeriod } from "@/lib/member-targets";
import { roleLabel } from "@/lib/roles";
import { PageHeader, Panel } from "@/components/dashboard/panel";
import { MemberTargetsForm } from "./member-targets-form";

export const metadata: Metadata = { title: "Target KPI Anggota" };
export default async function TargetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("supervisor");
  const sp = await searchParams;
  const { period } = resolveMemberTargetPeriod(sp.period);
  const [metrics, members] = await Promise.all([getMetrics(), getMembers(true, true)]);
  const member = sp.user ? members.find((item) => item.id === Number(sp.user)) : members[0];
  if (sp.user && !member) notFound();
  const targets = member ? await getTargetMap(period, [member.id]) : new Map<number, Map<number, number>>();
  return <>
    <PageHeader title="Target KPI per Anggota" description="Tentukan target setiap orang untuk setiap bulan. Perubahan hanya berlaku untuk anggota dan bulan yang dipilih." actions={<Link href={`/team?period=${period}`} className="text-sm underline underline-offset-4">Kelola anggota</Link>} />
    <form className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4" action="/targets">
      <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">Anggota<select name="user" defaultValue={member?.id} className="h-10 w-full min-w-48 rounded-md border bg-background px-3" aria-label="Pilih anggota">{members.map((item) => <option key={item.id} value={item.id}>{item.name} · {roleLabel(item.role, item.advertiserLevel)}{!item.isActive ? " (nonaktif)" : ""}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm font-medium">Bulan target<input type="month" name="period" defaultValue={period} required className="h-10 rounded-md border bg-background px-3" /></label>
      <button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Tampilkan target</button>
    </form>
    {member ? <Panel title={`${member.name} · ${period}`} bodyClassName="p-4"><MemberTargetsForm key={`${member.id}-${period}`} member={member} metrics={metrics} targets={Object.fromEntries(targets.get(member.id) ?? [])} period={period} /></Panel> : <p className="text-sm text-muted-foreground">Tambahkan anggota di Team untuk mengatur targetnya.</p>}
  </>;
}
