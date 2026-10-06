import { z } from "zod";

const placeholder = z.string().trim().min(1,"Placeholder wajib diisi.").max(80);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Gunakan warna hex yang valid.");
const benefit = z.string().trim().min(1,"Teks keunggulan wajib diisi.").max(20);
export const FORM_FONTS = { sans:"Modern", rounded:"Bulat", serif:"Klasik (serif)", mono:"Monospace" } as const;
export const FORM_RADII = { none:"Kotak", sm:"Kecil", md:"Sedang", lg:"Besar", full:"Pil" } as const;
export const FIELD_STYLES = { filled:"Terisi", outline:"Garis", underline:"Garis bawah" } as const;
const keys = <T extends object>(value:T) => Object.keys(value) as [keyof T & string, ...(keyof T & string)[]];
/** Visual tokens a preset sets in one click. Text, labels and placeholders stay untouched. */
export const FORM_THEMES = {
  whatsapp:{label:"Hijau WhatsApp",buttonColor:"#27ae60",backgroundColor:"#ffffff",textColor:"#0f172a",pageColor:"#f8fafc",font:"sans",radius:"md",fieldStyle:"filled",buttonStyle:"solid"},
  ocean:{label:"Biru profesional",buttonColor:"#2563eb",backgroundColor:"#ffffff",textColor:"#0f172a",pageColor:"#eff6ff",font:"sans",radius:"md",fieldStyle:"outline",buttonStyle:"solid"},
  midnight:{label:"Gelap elegan",buttonColor:"#f59e0b",backgroundColor:"#111827",textColor:"#f9fafb",pageColor:"#030712",font:"sans",radius:"lg",fieldStyle:"filled",buttonStyle:"solid"},
  blush:{label:"Lembut pink",buttonColor:"#db2777",backgroundColor:"#fff7fb",textColor:"#3f0d24",pageColor:"#fdf2f8",font:"rounded",radius:"full",fieldStyle:"filled",buttonStyle:"solid"},
  earth:{label:"Hangat natural",buttonColor:"#b45309",backgroundColor:"#fffbeb",textColor:"#292524",pageColor:"#f5f5f4",font:"serif",radius:"sm",fieldStyle:"underline",buttonStyle:"solid"},
  mono:{label:"Minimal hitam",buttonColor:"#111827",backgroundColor:"#ffffff",textColor:"#111827",pageColor:"#ffffff",font:"sans",radius:"none",fieldStyle:"outline",buttonStyle:"outline"},
} as const;
export type FormThemeId = keyof typeof FORM_THEMES;
export const appearanceSchema = z.object({
  theme: z.enum([...keys(FORM_THEMES),"custom"]).default("whatsapp"),
  buttonText: z.string().trim().min(3,"Teks tombol minimal 3 karakter.").max(60).default("Tanya-tanya via WhatsApp"),
  buttonColor: hex.default("#27ae60"),
  buttonStyle: z.enum(["solid","outline"]).default("solid"),
  showButtonIcon: z.boolean().default(true),
  backgroundColor: hex.default("#ffffff"),
  textColor: hex.default("#0f172a"),
  /** "transparent" lets an embedded form blend into the landing page. */
  pageColor: z.union([hex,z.literal("transparent")]).default("#f8fafc"),
  font: z.enum(keys(FORM_FONTS)).default("sans"),
  radius: z.enum(keys(FORM_RADII)).default("md"),
  fieldStyle: z.enum(keys(FIELD_STYLES)).default("filled"),
  layout: z.enum(["card", "plain"]).default("card"),
  align: z.enum(["left","center"]).default("left"),
  showLabels: z.boolean().default(false),
  showProduct: z.boolean().default(true),
  showBenefits: z.boolean().default(true),
  benefits: z.tuple([benefit,benefit,benefit]).default(["Mudah","Cepat","Aman"]),
  note: z.string().trim().max(160).default("Data disimpan sebelum Anda diarahkan ke WhatsApp."),
  placeholders: z.object({name:placeholder.default("Nama Anda"),phone:placeholder.default("No. WhatsApp Anda"),email:placeholder.default("Email Anda"),city:placeholder.default("Kota Asal")}).default({name:"Nama Anda",phone:"No. WhatsApp Anda",email:"Email Anda",city:"Kota Asal"}),
});
export type FormAppearance = z.infer<typeof appearanceSchema>;
export const DEFAULT_APPEARANCE = appearanceSchema.parse({});
const ids = (pattern:RegExp) => z.array(z.string().trim().regex(pattern,"ID tracking tidak valid.")).max(5).refine(values=>new Set(values).size===values.length,"ID tracking tidak boleh duplikat.");
export const trackingSchema = z.object({
  metaPixelIds: ids(/^\d{5,25}$/).default([]),
  metaEvent: z.enum(["Lead","CompleteRegistration","Contact","AddToWishlist"]).default("Lead"),
  gtmIds: ids(/^GTM-[A-Z0-9]{4,15}$/).default([]),
  tiktokPixelIds: ids(/^[A-Z0-9]{10,40}$/).default([]),
});
export type FormTracking = z.infer<typeof trackingSchema>;
export const DEFAULT_TRACKING = trackingSchema.parse({});
export const readAppearance = (value:unknown) => appearanceSchema.catch(DEFAULT_APPEARANCE).parse(value);
export const readTracking = (value:unknown) => trackingSchema.catch(DEFAULT_TRACKING).parse(value);
const luminance=(hex:string)=>{
  const rgb=[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
};
export function buttonForeground(hex:string) { return luminance(hex)>.179?"#111827":"#ffffff"; }
/** WCAG contrast ratio, 1–21. */
export function contrastRatio(a:string,b:string) { const [x,y]=[luminance(a),luminance(b)].sort((m,n)=>n-m); return (x+.05)/(y+.05); }
export const PAYMENT_STATUSES=["unpaid","partial","paid","refunded"] as const;
export const PAYMENT_LABEL={unpaid:"Belum bayar",partial:"DP / sebagian",paid:"Lunas",refunded:"Dikembalikan"};
export const leadCommerceSchema=z.object({
  paymentStatus:z.enum(PAYMENT_STATUSES),
  revenue:z.number().int().min(0).max(1_000_000_000_000),
  followUpStep:z.number().int().min(0).max(4),
  followUpAt:z.iso.datetime({offset:true}).nullable(),
});
export type LeadCommerce=z.infer<typeof leadCommerceSchema>;
/** Smooth weighted rotation. The caller holds the form row lock until commit. */
export function weightedRecipient(ids:number[], weights:Record<string,number>, previous:Record<string,number>={}) {
  const eligible=ids.filter(id=>(weights[id]??0)>0);
  if(!eligible.length)return null;
  const credits:Record<string,number>={};let chosen=eligible[0];let total=0;
  for(const id of eligible){const weight=weights[id];total+=weight;credits[id]=(previous[id]??0)+weight;if(credits[id]>credits[chosen])chosen=id;}
  credits[chosen]-=total;
  return {id:chosen,credits};
}
/** Splits 100% as evenly as whole numbers allow; earlier CSOs receive the remainder. */
export function evenWeights(ids:number[]) {
  const base=Math.floor(100/(ids.length||1)), extra=100-base*ids.length;
  return Object.fromEntries(ids.map((id,index)=>[id,base+(index<extra?1:0)])) as Record<string,number>;
}
/** Sets one CSO's share and rescales the others so the total stays 100%. */
export function rebalanceWeights(ids:number[], weights:Record<string,number>, id:number, value:number) {
  const fixed=Math.max(0,Math.min(100,Math.round(value)||0)), others=ids.filter(other=>other!==id);
  if(!others.length)return {[id]:100} as Record<string,number>;
  const rest=100-fixed, current=others.reduce((n,other)=>n+(weights[other]??0),0);
  // All others at 0% share the rest equally instead of staying at 0.
  return {...scale(others,rest,current?weights:Object.fromEntries(others.map(other=>[other,1]))),[id]:fixed};
}
/** Largest-remainder rounding keeps the integer shares summing exactly to `total`. */
function scale(ids:number[], total:number, weights:Record<string,number>) {
  const sum=ids.reduce((n,id)=>n+(weights[id]??0),0)||1;
  const raw=ids.map(id=>({id,exact:(weights[id]??0)*total/sum}));
  const result=Object.fromEntries(raw.map(r=>[r.id,Math.floor(r.exact)])) as Record<string,number>;
  let left=total-raw.reduce((n,r)=>n+Math.floor(r.exact),0);
  for(const r of [...raw].sort((a,b)=>(b.exact%1)-(a.exact%1)))if(left-->0)result[r.id]++;
  return result;
}
