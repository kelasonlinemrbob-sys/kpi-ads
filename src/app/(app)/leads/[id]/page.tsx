import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderLeadEvents, orderLeads, users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { PageHeader, Panel } from "@/components/dashboard/panel";
import { LEAD_STATUS_LABEL } from "@/lib/order-form-constants";
import { LeadEditor } from "./lead-editor";
import { WaButtons } from "../wa-buttons";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("supervisor", "advertiser", "cso");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const [lead] = await db.select().from(orderLeads).where(and(eq(orderLeads.id, id), actor.role === "supervisor" ? undefined : actor.role === "cso" ? eq(orderLeads.assigneeId, actor.id) : eq(orderLeads.ownerId, actor.id)));
  if (!lead) notFound();
  const csos = actor.role === "cso" ? [] : await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.role, "cso"), eq(users.isActive, true), eq(users.invitationPending, false)));
  const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, lead.ownerId));
  const [assigned] = await db.select({ name: users.name }).from(users).where(eq(users.id, lead.assigneeId));
  const events = await db.select({ id: orderLeadEvents.id, detail: orderLeadEvents.detail, createdAt: orderLeadEvents.createdAt, actor: users.name }).from(orderLeadEvents).innerJoin(users, eq(users.id, orderLeadEvents.actorId)).where(eq(orderLeadEvents.leadId, id)).orderBy(desc(orderLeadEvents.createdAt), desc(orderLeadEvents.id)).limit(30);
  const statusLabel = (value?: string) => value ? LEAD_STATUS_LABEL[value as keyof typeof LEAD_STATUS_LABEL] ?? value : "";
  return <>
    <Link href="/leads" className="mb-3 inline-block text-sm text-muted-foreground hover:underline">← Kembali ke Leads</Link>
    <PageHeader title={lead.name || "Customer tanpa nama"} description={`${lead.product} · ${lead.source === "organic" ? "Organik" : lead.platform} · ${lead.date} WIB`} />
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Panel title="Kontak customer">
        <dl className="grid grid-cols-2 gap-4 p-4 text-sm">{[["No. WhatsApp", lead.phone], ["Kota", lead.city], ["Email", lead.email], ["CSO", assigned.name], ["Advertiser", owner.name]].filter(([label, value]) => value || label === "No. WhatsApp").map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-all">{value || "—"}</dd></div>)}</dl>
        <div className="grid gap-3 border-t p-4"><WaButtons id={lead.id} phone={lead.phone} openedAt={lead.waOpenedAt} /><p className="text-xs text-muted-foreground">Pilih template untuk membuka WhatsApp customer. Pesan dikirim dari aplikasi WhatsApp Anda.</p></div>
      </Panel>
      <Panel title="Tindak lanjut"><LeadEditor lead={{ id: lead.id, status: lead.status, notes: lead.notes, assigneeId: lead.assigneeId }} csos={csos} canAssign={actor.role !== "cso"} /></Panel>
    </div>
    <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
      <details className="rounded-xl border bg-card"><summary className="cursor-pointer p-4 text-sm font-medium">Sumber kunjungan & referensi</summary><dl className="grid gap-3 border-t p-4 text-sm">{[["Referensi", lead.publicId], ...Object.entries(lead.attribution)].map(([key, value]) => <div key={key}><dt className="text-xs text-muted-foreground">{key}</dt><dd className="break-all">{value}</dd></div>)}</dl></details>
      <details className="rounded-xl border bg-card"><summary className="cursor-pointer p-4 text-sm font-medium">Riwayat penanganan</summary><div className="divide-y border-t">{events.map(event => {
        let info: { kind?: string; step?: number; statusBefore?: string; statusAfter?: string; notes?: string; assigneeBefore?: number; assigneeAfter?: number } = {};
        try { info = JSON.parse(event.detail); } catch {}
        return <div key={event.id} className="space-y-1 p-4 text-sm"><p className="font-medium">{event.actor}</p><p className="text-xs text-muted-foreground">{event.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</p>
          {info.kind === "whatsapp_opened" ? <p>WA {info.step} dibuka dengan template.</p> : <>
            {info.statusAfter && <p>{statusLabel(info.statusBefore)} → {statusLabel(info.statusAfter)}</p>}
            {info.assigneeBefore !== info.assigneeAfter && <p className="text-xs">CSO #{info.assigneeBefore} → #{info.assigneeAfter}</p>}
            {info.notes && <p className="whitespace-pre-wrap">{info.notes}</p>}
          </>}
        </div>;
      })}{!events.length && <p className="p-4 text-sm text-muted-foreground">Belum ada pembaruan penanganan.</p>}</div></details>
    </div>
  </>;
}
