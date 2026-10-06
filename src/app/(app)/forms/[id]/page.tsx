import { getCapiView } from "@/lib/meta-capi";
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { campaigns, orderForms, users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/panel";
import { FormEditor } from "./form-editor";
export default async function FormEditorPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{saved?:string}>}){
 const actor=await requireRole("supervisor","advertiser");const {id}=await params;
 const [form]=id==="new"?[]:await db.select().from(orderForms).where(eq(orderForms.id,Number(id)||0));
 if(id!=="new"&&(!form||(actor.role!=="supervisor"&&form.ownerId!==actor.id)))notFound();
 const products=await db.select({id:campaigns.id,name:campaigns.name,product:campaigns.product,platform:campaigns.platform,owner:users.name,status:campaigns.status,formLeadSince:campaigns.formLeadSince}).from(campaigns).innerJoin(users,eq(users.id,campaigns.ownerId)).where(actor.role==="supervisor"?undefined:eq(campaigns.ownerId,actor.id)).orderBy(asc(campaigns.name));
 const csos=await db.select({id:users.id,name:users.name,phone:users.csoPhone}).from(users).where(and(eq(users.role,"cso"),eq(users.isActive,true),eq(users.invitationPending,false))).orderBy(asc(users.name));
 const saved=(await searchParams).saved==="1";
 return <>{saved&&<p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Form berhasil disimpan. Preview dan kode embed mengikuti pengaturan terbaru.</p>}<PageHeader title={form?"Kelola form order":"Buat form order"} description="Atur data customer, tujuan WhatsApp, dan sumber lead laporan." /><FormEditor capi={form?await getCapiView(form.id):undefined} form={form} products={products.filter(p=>p.status==="active"||p.id===form?.campaignId)} csos={csos} origin={new URL(process.env.APP_URL||"http://localhost:3000").origin} /></>;
}
