"use server";
import { saveCapiConfig,testSavedCapi,retryCapiEvent } from "@/lib/meta-capi";
import { CapiError } from "@/lib/meta-capi-client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { requireRole } from "@/lib/auth";
import { leadErrorMessage, saveOrderForm, updateOrderLead } from "@/lib/order-leads";
import { leadCommerceSchema, type LeadCommerce } from "@/lib/order-form-config";
import { orderLeads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { FIELD_LABELS, LEAD_STATUSES } from "@/lib/order-form-input";
import type { FormState } from "./auth";
export async function saveOrderFormAction(_:FormState,form:FormData):Promise<FormState>{
  const actor=await requireRole("supervisor","advertiser");
  let id:number;
  try{
    const result=await db.transaction(async tx=>{const saved=await saveOrderForm(tx,actor,{
      appearance:form.has("appearance")?JSON.parse(String(form.get("appearance"))):undefined,
      tracking:form.has("tracking")?JSON.parse(String(form.get("tracking"))):undefined,
      weights:form.has("weights")?JSON.parse(String(form.get("weights"))):undefined,
      id:form.get("id")?Number(form.get("id")):undefined,campaignId:Number(form.get("campaignId")),
      title:String(form.get("title")??""),description:String(form.get("description")??""),
      fields:Object.fromEntries(Object.keys(FIELD_LABELS).map(key=>[key,String(form.get(`field_${key}`)??"off")])),
      routing:String(form.get("routing")),assigneeIds:form.getAll("assigneeIds").map(Number),published:form.get("published")==="on",
      source:String(form.get("source")),message:String(form.get("message")??""),useFormLeads:form.get("useFormLeads")==="on",effectiveDate:String(form.get("effectiveDate")),
    });
    if(form.has("capiSettings"))await saveCapiConfig(tx,actor,saved.id,{...JSON.parse(String(form.get("capiSettings"))),token:String(form.get("capiToken")??"")});
    return saved;});id=result.id;
  }catch(error){return {error:error instanceof CapiError?error.message:leadErrorMessage(error)};}
  revalidatePath("/forms");revalidatePath("/leads");redirect(`/forms/${id}?saved=1`);
}
export async function updateLeadAction(_:FormState,form:FormData):Promise<FormState>{
  const actor=await requireRole("supervisor","advertiser","cso");
  const parsed=z.object({id:z.coerce.number().int().positive(),status:z.enum(LEAD_STATUSES),notes:z.string().trim().max(4000),assigneeId:z.coerce.number().int().positive().optional()}).safeParse({id:form.get("id"),status:form.get("status"),notes:form.get("notes")??"",assigneeId:form.get("assigneeId")||undefined});
  if(!parsed.success)return {error:"Status, CSO atau catatan tidak valid."};
  let commerce:LeadCommerce|undefined;
  if(form.has("paymentStatus")){
    const when=String(form.get("followUpAt")||"");
    const result=leadCommerceSchema.safeParse({paymentStatus:form.get("paymentStatus"),revenue:Number(form.get("revenue")),followUpStep:Number(form.get("followUpStep")),followUpAt:when?`${when}:00+07:00`:null});
    if(!result.success)return {error:"Periksa pembayaran, omzet dan jadwal follow-up."};commerce=result.data;
  }
  try{await db.transaction(tx=>updateOrderLead(tx,actor,parsed.data.id,parsed.data.status,parsed.data.notes,parsed.data.assigneeId,commerce));}
  catch(error){return {error:leadErrorMessage(error)};}
  revalidatePath("/leads");revalidatePath(`/leads/${parsed.data.id}`);return {ok:true,message:"Lead diperbarui."};
}

export async function bulkLeadStatusAction(_:FormState,form:FormData):Promise<FormState>{
 const actor=await requireRole("supervisor","advertiser","cso");
 const parsed=z.object({ids:z.array(z.coerce.number().int().positive()).min(1).max(50),status:z.enum(LEAD_STATUSES)}).safeParse({ids:form.getAll("ids"),status:form.get("status")});
 if(!parsed.success)return {error:"Pilih 1–50 lead dan status yang valid."};
 try{await db.transaction(async tx=>{
   for(const id of [...new Set(parsed.data.ids)].sort((a,b)=>a-b)){
     const [lead]=await tx.select().from(orderLeads).where(eq(orderLeads.id,id)).for("update");
     await updateOrderLead(tx,actor,id,parsed.data.status,lead?.notes??"");
   }
 });}catch(error){return {error:leadErrorMessage(error)};}
 revalidatePath("/leads");return {ok:true,message:"Status lead terpilih diperbarui."};
}

export async function testCapiAction(formId:number,code:string):Promise<FormState>{
 const actor=await requireRole("supervisor","advertiser");
 try{const result=await testSavedCapi(actor,formId,code);revalidatePath(`/forms/${formId}`);return result.ok?{ok:true,message:result.message}:{error:result.message};}
 catch(error){return {error:error instanceof CapiError?error.message:"Pengujian belum berhasil."};}
}

export async function retryCapiAction(formId:number,eventId:string):Promise<FormState>{
 const actor=await requireRole("supervisor","advertiser");
 try{await retryCapiEvent(actor,formId,eventId);revalidatePath(`/forms/${formId}`);return {ok:true,message:"Event masuk antrean kembali dengan ID yang sama."};}
 catch(error){return {error:error instanceof CapiError?error.message:"Event belum dapat dijadwalkan ulang."};}
}
