import Link from "next/link";
import { count, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { orderLeads, users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/order-form-input";
import { PAYMENT_STATUSES,PAYMENT_LABEL } from "@/lib/order-form-config";
import { leadFilters,leadScope,listLeads } from "@/lib/lead-list";
import { PageHeader, Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadsTable } from "./leads-table";
export const metadata={title:"Leads & Order"};
const selectClass="h-9 w-full rounded-md border bg-background px-2 text-sm";
export default async function LeadsPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const me=await requireRole("supervisor","advertiser","cso"),sp=await searchParams;
 const {where,from,to}=leadFilters(me,sp);const page=Math.max(1,Math.min(100000,Math.floor(Number(sp.page)||1)));
 const owner=alias(users,"filter_owner"),cso=alias(users,"filter_cso");
 const [[stats],rows,options]=await Promise.all([
  db.select({n:count(),ads:sql<number>`count(*) filter (where ${orderLeads.source} = 'ads')`.mapWith(Number),organic:sql<number>`count(*) filter (where ${orderLeads.source} = 'organic')`.mapWith(Number),won:sql<number>`count(*) filter (where ${orderLeads.status} = 'won')`.mapWith(Number),paid:sql<number>`coalesce(sum(${orderLeads.revenue}) filter (where ${orderLeads.paymentStatus} = 'paid'),0)`.mapWith(Number)}).from(orderLeads).where(where),
  listLeads(where,50,(page-1)*50),
  db.selectDistinct({ownerId:orderLeads.ownerId,owner:owner.name,csoId:orderLeads.assigneeId,cso:cso.name,productId:orderLeads.campaignId,product:orderLeads.product}).from(orderLeads).innerJoin(owner,eq(owner.id,orderLeads.ownerId)).innerJoin(cso,eq(cso.id,orderLeads.assigneeId)).where(leadScope(me)),
 ]);
 const unique=(key:"owner"|"cso"|"product")=>[...new Map(options.map(r=>[r[`${key}Id`],r[key]])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
 const query=new URLSearchParams(Object.entries(sp).filter((p):p is [string,string]=>typeof p[1]==="string"));query.set("from",from);query.set("to",to);
 const href=(p:number)=>{const q=new URLSearchParams(query);q.set("page",String(p));return `/leads?${q}`;};
 return <><PageHeader title={me.role==="cso"?"Lead Saya":"Leads & Order"} description="Kelola pendaftaran, penanganan CSO, pembayaran dan follow-up dalam satu tempat." actions={me.role!=="cso"?<Button asChild variant="outline"><Link href="/forms">Kelola form</Link></Button>:undefined} />
 <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-5">{[["Total lead",stats.n],["Lead iklan",stats.ads],["Lead organik",stats.organic],["Closing",stats.won],["Nilai order lunas",`Rp ${stats.paid.toLocaleString("id-ID")}`]].map(([label,n])=><Panel key={String(label)} title={String(label)}><p className="p-4 text-xl font-semibold tabular-nums">{n}</p></Panel>)}</div>
 <form className="mb-4 grid gap-3 rounded-xl border bg-muted/10 p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_160px_160px_auto]"><label className="grid gap-1 text-xs">Cari lead<Input name="q" defaultValue={sp.q} placeholder="Nama, No. HP, email, produk atau #ID…" maxLength={80} /></label><label className="grid gap-1 text-xs">Dari (WIB)<Input type="date" name="from" defaultValue={from} /></label><label className="grid gap-1 text-xs">Sampai<Input type="date" name="to" defaultValue={to} /></label><div className="flex items-end gap-2"><Button type="submit" variant="outline">Terapkan</Button><Button asChild type="button" variant="ghost"><Link href="/leads">Reset</Link></Button></div></div>
 <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><label className="grid gap-1 text-xs">Status<select className={selectClass} name="status" defaultValue={sp.status??""}><option value="">Semua status</option>{LEAD_STATUSES.map(s=><option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>)}</select></label><label className="grid gap-1 text-xs">Pembayaran<select className={selectClass} name="payment" defaultValue={sp.payment??""}><option value="">Semua pembayaran</option>{PAYMENT_STATUSES.map(s=><option key={s} value={s}>{PAYMENT_LABEL[s]}</option>)}</select></label><label className="grid gap-1 text-xs">Sumber<select className={selectClass} name="source" defaultValue={sp.source??""}><option value="">Semua sumber</option><option value="ads">Iklan</option><option value="organic">Organik</option></select></label>{(["product","owner","cso"] as const).filter(k=>!(me.role==="cso"&&k==="cso")&&!(me.role==="advertiser"&&k==="owner")).map(k=><label className="grid gap-1 text-xs" key={k}>{{product:"Produk",owner:"Advertiser",cso:"CSO"}[k]}<select className={selectClass} name={k} defaultValue={sp[k]??""}><option value="">Semua</option>{unique(k).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>)}</div>
 <div className="flex flex-wrap gap-3 text-xs"><label className="flex items-center gap-2"><input type="checkbox" name="due" value="1" defaultChecked={sp.due==="1"} />Jadwal follow-up sudah tiba</label>{sp.form&&<><input type="hidden" name="form" value={sp.form} /><span className="rounded border px-2">Form #{sp.form}</span></>}</div></form>
 <Panel title={`${stats.n} lead · ${from} — ${to}`}><LeadsTable rows={rows.map(r=>({...r,createdAt:r.createdAt.toISOString(),followUpAt:r.followUpAt?.toISOString()??null}))} exportUrl={`/api/leads/export?${query}`} /><div className="flex items-center justify-between gap-3 border-t p-3 text-xs text-muted-foreground"><span>Halaman {page} · 50 per halaman · geser tabel untuk kolom lainnya</span><div className="flex gap-2">{page>1&&<Button asChild variant="outline" size="sm"><Link href={href(page-1)}>Sebelumnya</Link></Button>}{page*50<stats.n&&<Button asChild variant="outline" size="sm"><Link href={href(page+1)}>Berikutnya</Link></Button>}</div></div></Panel><p className="mt-3 text-xs text-muted-foreground">Ringkasan dan ekspor mengikuti filter. Nilai order dan pembayaran dicatat manual oleh tim; belum terhubung payment gateway. Lead tersimpan tidak otomatis berarti pesan WhatsApp sudah dikirim.</p></>;
}
