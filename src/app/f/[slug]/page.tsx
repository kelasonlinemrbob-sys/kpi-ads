import { OrderFormFrame, formMaxWidth, formPageBackground, formThemeStyle } from "@/components/order-form-frame";
import { ORDER_FORM_FONT_CLASSES } from "@/components/order-form-fonts";
import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { activeDomainForSlug, applicationOrigin } from "@/lib/form-domains";
import { db } from "@/db";
import { campaigns, orderForms, orderFormCapi, users } from "@/db/schema";
import { createFormChallenge } from "@/lib/order-leads";
import { readAppearance, readTracking } from "@/lib/order-form-config";
import { PublicOrderForm } from "./public-form";
export const dynamic="force-dynamic";
export const metadata={title:"Pendaftaran",robots:{index:false,follow:false},referrer:"no-referrer" as const};
export default async function PublicFormPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;if(!/^[a-f0-9]{24}$/.test(slug))notFound();
  const host=(await headers()).get("host")?.toLowerCase();
  if(!host || (host!==new URL(applicationOrigin()).host && !await activeDomainForSlug(host,slug)))notFound();
  const [row]=await db.select({hasCapi:orderFormCapi.enabled,appearance:orderForms.appearance,tracking:orderForms.tracking,title:orderForms.title,description:orderForms.description,fields:orderForms.fields,product:campaigns.product,name:campaigns.name}).from(orderForms).leftJoin(orderFormCapi,eq(orderFormCapi.formId,orderForms.id)).innerJoin(campaigns,eq(campaigns.id,orderForms.campaignId)).innerJoin(users,eq(users.id,orderForms.ownerId)).where(and(eq(orderForms.slug,slug),eq(orderForms.published,true),isNull(orderForms.deletedAt),eq(campaigns.status,"active"),eq(users.isActive,true)));
  if(!row)return <main className="mx-auto max-w-lg p-8 text-center"><h1 className="text-xl font-semibold">Pendaftaran belum tersedia</h1><p className="mt-3 text-muted-foreground">Form sedang tidak menerima pendaftaran. Silakan kembali nanti.</p></main>;
  const appearance=readAppearance(row.appearance);const tracking=readTracking(row.tracking);
  const transparent=appearance.pageColor==="transparent";
  // The outer wrapper fills the viewport; the iframe height is measured from the inner container only.
  return <div className={`of-root min-h-dvh ${ORDER_FORM_FONT_CLASSES}`} style={{...formThemeStyle(appearance),background:formPageBackground(appearance)}}>{transparent&&<style>{"html,body{background:transparent}"}</style>}<main id="public-order-container" className="mx-auto w-full p-3 sm:p-6" style={{maxWidth:formMaxWidth(appearance)}}><OrderFormFrame appearance={appearance} product={row.product||row.name} title={row.title} description={row.description}><PublicOrderForm slug={slug} fields={row.fields} appearance={appearance} hasCapi={!!row.hasCapi} hasTracking={!!(tracking.metaPixelIds.length||tracking.gtmIds.length||tracking.tiktokPixelIds.length)} token={createFormChallenge(slug)} /></OrderFormFrame></main></div>;
}
