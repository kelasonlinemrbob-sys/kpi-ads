import "server-only";
import { and, eq, gte, inArray, lte, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, orderLeads } from "@/db/schema";
export async function getFormLeadCounts(start:string,end:string,userIds?:number[],tx:Pick<typeof db,"select">=db, partial?:{date:string;cutoff:string}){
 if(userIds&&!userIds.length)return [];
 return tx.select({campaignId:orderLeads.campaignId,userId:orderLeads.ownerId,date:orderLeads.date,leads:sql<number>`count(*)`.mapWith(Number)}).from(orderLeads).innerJoin(campaigns,eq(campaigns.id,orderLeads.campaignId)).where(and(
  partial?or(sql`${orderLeads.date} <> ${partial.date}`,lt(orderLeads.createdAt,new Date(`${partial.date}T${partial.cutoff}:00+07:00`))):undefined,
  eq(orderLeads.source,"ads"),eq(orderLeads.ownerId,campaigns.ownerId),gte(orderLeads.date,start),lte(orderLeads.date,end),gte(orderLeads.date,campaigns.formLeadSince),userIds?inArray(orderLeads.ownerId,userIds):undefined,
 )).groupBy(orderLeads.campaignId,orderLeads.ownerId,orderLeads.date);
}
