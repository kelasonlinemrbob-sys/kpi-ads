import "server-only";
import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { orderLeads, users } from "@/db/schema";
import { LEAD_STATUSES } from "./order-form-input";
import { jakartaDate } from "./sheets-report";
export type LeadActor={id:number;role:string};
export const leadScope=(actor:LeadActor)=>actor.role==="supervisor"?undefined:actor.role==="cso"?eq(orderLeads.assigneeId,actor.id):eq(orderLeads.ownerId,actor.id);
export function leadFilters(actor:LeadActor,sp:Record<string,string|undefined>){
 const valid=(v:string|undefined)=>!!v&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 const today=jakartaDate(),from=valid(sp.from)?sp.from!:today.slice(0,7)+"-01";
 const to=valid(sp.to)&&sp.to!>=from?sp.to!:(today>=from?today:from);
 const positive=(s:string|undefined)=>Number.isSafeInteger(Number(s))&&Number(s)>0&&Number(s)<=2147483647?Number(s):undefined;
 const form=positive(sp.form),cso=positive(sp.cso),owner=positive(sp.owner),campaign=positive(sp.product);
 const q=(sp.q||"").trim().slice(0,80).replace(/[\\%_]/g,"\\$&");
 const where=and(leadScope(actor),gte(orderLeads.date,from),lte(orderLeads.date,to),form?eq(orderLeads.formId,form):undefined,cso?eq(orderLeads.assigneeId,cso):undefined,owner?eq(orderLeads.ownerId,owner):undefined,campaign?eq(orderLeads.campaignId,campaign):undefined,
 LEAD_STATUSES.includes(sp.status as never)?eq(orderLeads.status,sp.status!):undefined,
 ["ads","organic"].includes(sp.source??"")?eq(orderLeads.source,sp.source!):undefined,
 q?or(ilike(orderLeads.name,`%${q}%`),ilike(orderLeads.phone,`%${q}%`),ilike(orderLeads.email,`%${q}%`),ilike(orderLeads.product,`%${q}%`),/^#?\d+$/.test(q)&&Number(q.replace('#',''))<=2147483647?eq(orderLeads.id,Number(q.replace('#',''))):undefined):undefined);
 return {where,from,to};
}
export async function listLeads(where:ReturnType<typeof leadFilters>["where"],limit=50,offset=0){
 const owner=alias(users,"lead_owner"),cso=alias(users,"lead_cso");
 return db.select({id:orderLeads.id,publicId:orderLeads.publicId,name:orderLeads.name,phone:orderLeads.phone,email:orderLeads.email,city:orderLeads.city,product:orderLeads.product,platform:orderLeads.platform,source:orderLeads.source,status:orderLeads.status,waOpenedAt:orderLeads.waOpenedAt,attribution:orderLeads.attribution,createdAt:orderLeads.createdAt,owner:owner.name,cso:cso.name}).from(orderLeads).innerJoin(owner,eq(owner.id,orderLeads.ownerId)).innerJoin(cso,eq(cso.id,orderLeads.assigneeId)).where(where).orderBy(desc(orderLeads.createdAt),desc(orderLeads.id)).limit(limit).offset(offset);
}
export function csvCell(value:unknown){const raw=String(value??"");return '"'+(/^[\s]*[=+@-]|^[\t\r\n]/.test(raw)?"'":"")+raw.replaceAll('"','""')+'"';}
