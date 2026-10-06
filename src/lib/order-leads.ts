import { queueCapiLead } from "./meta-capi";
import type { CapiContext } from "./meta-capi-client";
import "server-only";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, advertiserReportItems, campaigns, dailyReports, kpiEntries, kpiMetrics, orderForms, orderLeadEvents, orderLeads, users } from "@/db/schema";
import { normalizePhone, orderFormInput, validateCustomer, type LEAD_STATUSES } from "./order-form-input";
import { DEFAULT_REPORT_RULES } from "./reporting";
import { jakartaDate } from "./sheets-report";
import { weightedRecipient, leadCommerceSchema, type LeadCommerce } from "./order-form-config";
export type LeadDb = Pick<typeof db,"select"|"insert"|"update"|"delete">;
export class LeadError extends Error {}
export const leadErrorMessage = (error: unknown) => error instanceof LeadError ? error.message : "Permintaan belum dapat diproses. Silakan coba lagi.";
function digest(value: string) { const secret=process.env.AUTH_SECRET; if(!secret) throw new Error("AUTH_SECRET missing");return createHmac("sha256",secret).update(value).digest("hex"); }
export function createFormChallenge(slug: string, now=Date.now()) {
  const payload=Buffer.from(JSON.stringify({slug,nonce:randomBytes(24).toString("hex"),expires:now+2*3600000})).toString("base64url");
  return payload+"."+digest("order-form:"+payload);
}
export function verifyFormChallenge(slug: string, token: string, now=Date.now()) {
  if(token.length>1000) throw new LeadError("Form kedaluwarsa. Muat ulang halaman.");
  try {
    const [payload,signature]=token.split(".");const expected=digest("order-form:"+payload);
    if(!signature || signature.length!==64 || !timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) throw new Error();
    const data=JSON.parse(Buffer.from(payload,"base64url").toString());
    if(data.slug!==slug || typeof data.expires!=="number" || data.expires<=now || !/^[a-f0-9]{48}$/.test(data.nonce)) throw new Error();
    return digest("order-request:"+data.nonce);
  }catch{throw new LeadError("Form kedaluwarsa. Muat ulang halaman.");}
}
export async function saveOrderForm(tx: LeadDb, actor: {id:number;role:string}, input: unknown) {
  if(!["advertiser","supervisor"].includes(actor.role)) throw new LeadError("Tidak memiliki akses mengelola form.");
  const parsed=orderFormInput.safeParse(input);if(!parsed.success) throw new LeadError(parsed.error.issues[0].message);
  const data=parsed.data;
  const [old]=data.id ? await tx.select().from(orderForms).where(eq(orderForms.id,data.id)).for("update") : [];
  if(data.id && (!old || (actor.role!=="supervisor" && old.ownerId!==actor.id))) throw new LeadError("Form tidak ditemukan.");
  if(old && (old.campaignId!==data.campaignId || old.source!==data.source)) throw new LeadError("Produk dan sumber form tidak dapat diganti. Buat form baru untuk menjaga riwayat lead.");
  const [product]=await tx.select().from(campaigns).where(eq(campaigns.id,data.campaignId)).for("update");
  if(!product || (actor.role!=="supervisor" && product.ownerId!==actor.id) || (old && old.ownerId!==product.ownerId)) throw new LeadError("Produk tidak sesuai pemilik advertiser.");
  const [owner]=await tx.select().from(users).where(eq(users.id,product.ownerId));
  if(!owner?.isActive || !["advertiser","supervisor"].includes(owner.role)) throw new LeadError("Advertiser pemilik produk tidak aktif.");
  const csos=data.assigneeIds.length ? await tx.select().from(users).where(inArray(users.id,data.assigneeIds)) : [];
  if(csos.length!==data.assigneeIds.length || csos.some(c=>c.role!=="cso" || !c.isActive || !c.csoPhone)) throw new LeadError("Pilih CSO aktif yang memiliki nomor WhatsApp.");
  for(const cso of csos) try {normalizePhone(cso.csoPhone!);}catch{throw new LeadError("Nomor WhatsApp CSO tidak valid.");}
  if(data.published && product.status!=="active") throw new LeadError("Aktifkan produk sebelum menerbitkan form.");
  if(data.published && data.useFormLeads && data.source==="ads" && !product.formLeadSince){
    if(data.effectiveDate<jakartaDate()) throw new LeadError("Peralihan sumber lead tidak dapat berlaku surut.");
    await tx.update(campaigns).set({formLeadSince:data.effectiveDate}).where(eq(campaigns.id,product.id));
    await syncFormLeadItems(tx,product.id,data.effectiveDate);
  }
  const routingChanged=!old || old.routing!==data.routing || JSON.stringify(old.assigneeIds)!==JSON.stringify(data.assigneeIds) || JSON.stringify(old.weights)!==JSON.stringify(data.weights);
  const values={appearance:data.appearance,tracking:data.tracking,weights:data.weights,...(routingChanged?{routingCredits:{},cursor:0}:{}),title:data.title,description:data.description,fields:data.fields,routing:data.routing,assigneeIds:data.assigneeIds,published:data.published,source:data.source,message:data.message,updatedAt:new Date()};
  const [saved]=old ? await tx.update(orderForms).set(values).where(eq(orderForms.id,old.id)).returning() : await tx.insert(orderForms).values({...values,slug:randomBytes(12).toString("hex"),ownerId:product.ownerId,campaignId:product.id}).returning();
  return saved;
}
/** Campaign lock serializes public submissions with report saves and source policy changes. */
export async function syncFormLeadItems(tx: LeadDb, campaignId:number, date:string) {
  const [product]=await tx.select().from(campaigns).where(eq(campaigns.id,campaignId));
  if(!product?.formLeadSince || date<product.formLeadSince) return;
  const [total]=await tx.select({n:sql<number>`count(*)`.mapWith(Number)}).from(orderLeads).where(and(eq(orderLeads.campaignId,campaignId),eq(orderLeads.ownerId,product.ownerId),eq(orderLeads.source,"ads"),eq(orderLeads.date,date)));
  // CSV historical values are immutable even if an operator later changes dates.
  const reports=await tx.select({id:dailyReports.id}).from(dailyReports).innerJoin(advertiserReportItems,eq(advertiserReportItems.reportId,dailyReports.id)).where(and(eq(advertiserReportItems.campaignId,campaignId),eq(advertiserReportItems.performanceDate,date),eq(dailyReports.source,"app"),eq(dailyReports.userId,product.ownerId)));
  const ids=[...new Set(reports.map(r=>r.id))]; if(!ids.length)return;
  await tx.select({id:dailyReports.id}).from(dailyReports).where(inArray(dailyReports.id,ids)).orderBy(asc(dailyReports.id)).for("update");
  const [rule]=await tx.select({value:appSettings.value}).from(appSettings).where(eq(appSettings.key,"report.cutoff"));
  const cutoff=rule?.value&&/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.value)?rule.value:DEFAULT_REPORT_RULES.cutoff;
  const [partial]=await tx.select({n:sql<number>`count(*)`.mapWith(Number)}).from(orderLeads).where(and(eq(orderLeads.campaignId,campaignId),eq(orderLeads.ownerId,product.ownerId),eq(orderLeads.source,"ads"),eq(orderLeads.date,date),lt(orderLeads.createdAt,new Date(`${date}T${cutoff}:00+07:00`))));
  for(const [window,n] of [["previous_day",total.n],["today_to_cutoff",partial.n]] as const) {
    await tx.update(advertiserReportItems).set({leadSource:"form",adsLeads:sql`case when ${advertiserReportItems.leadSource} = 'form' then ${advertiserReportItems.adsLeads} else coalesce(${advertiserReportItems.adsLeads},${advertiserReportItems.leads}) end`,leads:n}).where(and(eq(advertiserReportItems.campaignId,campaignId),eq(advertiserReportItems.performanceDate,date),eq(advertiserReportItems.window,window),inArray(advertiserReportItems.reportId,ids)));
  }
  for(const id of ids){
    const [sum]=await tx.select({n:sql<number>`coalesce(sum(${advertiserReportItems.leads}),0)`.mapWith(Number)}).from(advertiserReportItems).where(and(eq(advertiserReportItems.reportId,id),eq(advertiserReportItems.window,"previous_day")));
    const [metric]=await tx.select({id:kpiMetrics.id}).from(kpiMetrics).where(and(eq(kpiMetrics.role,"advertiser"),eq(kpiMetrics.key,"leads")));
    if(metric)await tx.update(kpiEntries).set({value:sum.n}).where(and(eq(kpiEntries.reportId,id),eq(kpiEntries.metricId,metric.id)));
  }
}
export async function submitOrderLead(tx: LeadDb, slug:string, token:string, raw:Record<string,unknown>, attribution:Record<string,string>={}, now=new Date(), context:CapiContext={}) {
  const requestHash=verifyFormChallenge(slug,token,now.getTime());
  const [form]=await tx.select().from(orderForms).where(eq(orderForms.slug,slug)).for("update");
  if(!form) throw new LeadError("Form tidak tersedia.");
  const [retry]=await tx.select().from(orderLeads).where(and(eq(orderLeads.formId,form.id),eq(orderLeads.requestHash,requestHash)));
  if(retry)return {reference:retry.publicId,url:retry.whatsappUrl,repeated:true,meta:retry.metaTracking};
  if(!form.published)throw new LeadError("Form sedang tidak menerima pendaftaran.");
  const [product]=await tx.select().from(campaigns).where(eq(campaigns.id,form.campaignId)).for("update");
  const [owner]=await tx.select().from(users).where(eq(users.id,form.ownerId));
  if(!owner?.isActive || !["supervisor","advertiser"].includes(owner.role) || product?.ownerId!==form.ownerId || product.status!=="active") throw new LeadError("Form sedang tidak tersedia.");
  let customer;try{customer=validateCustomer(form.fields,raw);}catch(error){throw new LeadError(error instanceof Error?error.message:"Data tidak valid.");}
  const date=jakartaDate(now);const contactHash=digest(`contact:${form.id}:${date}:${customer.phone||customer.email}`);
  const [duplicate]=await tx.select({id:orderLeads.id}).from(orderLeads).where(and(eq(orderLeads.formId,form.id),eq(orderLeads.date,date),eq(orderLeads.contactHash,contactHash)));
  if(duplicate)throw new LeadError("Kontak ini sudah terdaftar melalui form ini hari ini. Silakan lanjutkan percakapan WhatsApp sebelumnya.");
  const eligible=form.assigneeIds.length ? await tx.select().from(users).where(and(inArray(users.id,form.assigneeIds),eq(users.role,"cso"),eq(users.isActive,true),eq(users.invitationPending,false))).orderBy(asc(users.id)) : [];
  const csos=form.assigneeIds.flatMap(id=>eligible.filter(c=>c.id===id&&c.csoPhone));
  const weighted=form.routing==="weighted"?weightedRecipient(csos.map(c=>c.id),form.weights,form.routingCredits):null;
  const chosen=form.routing==="weighted"?csos.find(c=>c.id===weighted?.id):form.routing==="fixed" ? csos.find(c=>c.id===form.assigneeIds[0]) : csos[form.cursor % csos.length];
  if(!chosen)throw new LeadError("CSO belum tersedia. Silakan coba lagi nanti.");
  let phone;try{phone=normalizePhone(chosen.csoPhone!);}catch{throw new LeadError("Nomor CSO belum tersedia.");}
  const reference=randomUUID();
  const message=[form.message,`Produk: ${product.product||product.name}`,customer.name&&`Nama: ${customer.name}`,customer.phone&&`No. HP: ${customer.phone}`,customer.email&&`Email: ${customer.email}`,customer.city&&`Kota: ${customer.city}`,`Referensi: ${reference}`].filter(Boolean).join("\n");
  const url=`https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const [lead]=await tx.insert(orderLeads).values({measurementConsent:raw.trackingConsent===true,publicId:reference,formId:form.id,ownerId:form.ownerId,campaignId:product.id,assigneeId:chosen.id,csoPhone:phone,product:product.product||product.name,source:form.source,platform:form.source==="organic"?"organic":product.platform,...customer,date,requestHash,contactHash,whatsappUrl:url,attribution,createdAt:now,updatedAt:now}).returning();
  const meta=await queueCapiLead(tx,form,lead,context);
  await tx.update(orderForms).set({cursor:sql`(${orderForms.cursor} + 1) % 1000000000`,...(weighted?{routingCredits:weighted.credits}:{})}).where(eq(orderForms.id,form.id));
  await syncFormLeadItems(tx,product.id,date);
  return {reference,url,repeated:false,meta};
}
export async function updateOrderLead(tx:LeadDb,actor:{id:number;role:string},id:number,status:typeof LEAD_STATUSES[number],notes:string,assigneeId?:number,commerce?:LeadCommerce){
  const [lead]=await tx.select().from(orderLeads).where(eq(orderLeads.id,id)).for("update");
  if(!lead || (actor.role!=="supervisor" && !(actor.role==="advertiser"&&lead.ownerId===actor.id) && !(actor.role==="cso"&&lead.assigneeId===actor.id)))throw new LeadError("Lead tidak ditemukan.");
  const patch:{status:string;notes:string;updatedAt:Date;assigneeId?:number;csoPhone?:string}={status,notes,updatedAt:new Date()};
  if(assigneeId && assigneeId!==lead.assigneeId){
    if(actor.role==="cso")throw new LeadError("Hanya advertiser pemilik atau supervisor yang dapat memindahkan lead.");
    const [cso]=await tx.select().from(users).where(and(eq(users.id,assigneeId),eq(users.role,"cso"),eq(users.isActive,true)));
    if(!cso?.csoPhone)throw new LeadError("Pilih CSO aktif dengan nomor WhatsApp.");
    patch.assigneeId=cso.id;patch.csoPhone=normalizePhone(cso.csoPhone);
  }
  const parsedCommerce=commerce?leadCommerceSchema.safeParse(commerce):null;
  if(parsedCommerce&&!parsedCommerce.success)throw new LeadError("Pembayaran atau follow-up tidak valid.");
  const extra=parsedCommerce?.success?{...parsedCommerce.data,followUpAt:parsedCommerce.data.followUpAt?new Date(parsedCommerce.data.followUpAt):null}:{};
  await tx.update(orderLeads).set({...patch,...extra}).where(eq(orderLeads.id,lead.id));
  await tx.insert(orderLeadEvents).values({leadId:lead.id,actorId:actor.id,detail:JSON.stringify({statusBefore:lead.status,statusAfter:status,assigneeBefore:lead.assigneeId,assigneeAfter:patch.assigneeId??lead.assigneeId,notes,...(commerce?{commerceBefore:{paymentStatus:lead.paymentStatus,revenue:lead.revenue,followUpStep:lead.followUpStep,followUpAt:lead.followUpAt},commerceAfter:commerce}:{})})});
}
