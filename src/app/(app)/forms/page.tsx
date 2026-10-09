import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, orderForms, orderLeads, users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { PageHeader, Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormCardActions } from "./form-card-actions";
export const metadata={title:"Form Order"};
export default async function FormsPage(){
 const me=await requireRole("supervisor","advertiser");
 const forms=await db.select({form:orderForms,product:campaigns.product,platform:campaigns.platform,owner:users.name,leadSince:campaigns.formLeadSince}).from(orderForms).innerJoin(campaigns,eq(campaigns.id,orderForms.campaignId)).innerJoin(users,eq(users.id,orderForms.ownerId)).where(and(isNull(orderForms.deletedAt),me.role==="supervisor"?undefined:eq(orderForms.ownerId,me.id))).orderBy(desc(orderForms.createdAt));
 const totals=await db.select({id:orderLeads.formId,n:sql<number>`count(*)`.mapWith(Number)}).from(orderLeads).where(me.role==="supervisor"?undefined:eq(orderLeads.ownerId,me.id)).groupBy(orderLeads.formId);
 return <><PageHeader title="Form Order" description="Hubungkan pendaftaran di landing page dengan advertiser, CSO, dan laporan lead harian." actions={<Button asChild><Link href="/forms/new">Buat form</Link></Button>} />
 {!forms.length?<Panel title="Mulai menerima lead"><div className="space-y-3 p-6"><p>Buat form untuk produk aktif, atur field, lalu pilih CSO penerima.</p><p className="text-sm text-muted-foreground">Supervisor menambahkan CSO dan nomor WhatsApp melalui Team. CSO perlu menerima undangan dan mengaktifkan akun sebelum dipilih.</p><Button asChild variant="outline"><Link href="/forms/new">Buat form pertama</Link></Button></div></Panel>:<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{forms.map(({form,product,platform,owner,leadSince})=><Panel key={form.id} title={form.title}><div className="grid gap-3 p-4"><div className="flex gap-2"><Badge variant={form.published?"success":"secondary"}>{form.published?"Terbit":"Nonaktif / draf"}</Badge><Badge variant="outline">{form.source==="organic"?"Organik":platform}</Badge></div><p className="text-sm">{product} · {owner}</p><p className="text-xs text-muted-foreground">{form.routing==="fixed"?"CSO tetap":form.routing==="weighted"?"CSO persentase":"CSO sama rata"} · {totals.find(t=>t.id===form.id)?.n??0} lead{leadSince&&form.source==="ads"?` · KPI dari form mulai ${leadSince}`:""}</p><div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link href={`/forms/${form.id}`}>Kelola & pasang</Link></Button><Button asChild variant="ghost" size="sm"><Link href={`/leads?form=${form.id}`}>Lihat lead</Link></Button></div><FormCardActions id={form.id} title={form.title} /></div></Panel>)}</div>}</>;
}
