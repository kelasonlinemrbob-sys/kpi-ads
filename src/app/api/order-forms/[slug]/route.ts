import { db } from "@/db";
import { leadErrorMessage, LeadError, submitOrderLead, verifyFormChallenge } from "@/lib/order-leads";
import { takeResetQuota } from "@/lib/password-reset";
import { allowedFormOrigin } from "@/lib/form-domains";
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
export async function POST(request:Request,{params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  if(!/^[a-f0-9]{24}$/.test(slug))return reply({error:"Form tidak tersedia."},404);
  if(!await allowedFormOrigin(request.headers.get("origin"),request.headers.get("host")||new URL(request.url).host,slug))return reply({error:"Asal permintaan tidak valid."},403);
  if(!request.headers.get("content-type")?.startsWith("application/json"))return reply({error:"Format data tidak valid."},415);
  let raw:Record<string,unknown>;
  try{
    const reader=request.body?.getReader();if(!reader)throw new Error();
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();return reply({error:"Data terlalu besar."},413);}chunks.push(value);}
    raw=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(!raw||Array.isArray(raw)||typeof raw!=="object")throw new Error();
  }catch{return reply({error:"Data tidak valid."},400);}
  const ip=request.headers.get("x-real-ip")||"unknown";
  if(!await takeResetQuota(db,`order:ip:${ip}`,60) || !await takeResetQuota(db,`order:form:${slug}:${ip}`,20))return reply({error:"Terlalu banyak percobaan. Coba lagi dalam 15 menit."},429);
  if(raw.website)return reply({error:"Periksa isi form kembali."},400);
  if(typeof raw.token!=="string")return reply({error:"Muat ulang halaman form."},400);
  try{verifyFormChallenge(slug,raw.token);}catch(error){return reply({error:leadErrorMessage(error)},400);}
  const attribution:Record<string,string>={};
  const incoming=raw.attribution;
  if(incoming&&typeof incoming==="object"&&!Array.isArray(incoming))for(const key of ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","fbclid","ttclid"]){const value=(incoming as Record<string,unknown>)[key];if(typeof value==="string")attribution[key]=value.replace(/[\u0000-\u001f]/g,"").slice(0,200);}
  const metadata=raw.trackingContext&&typeof raw.trackingContext==="object"&&!Array.isArray(raw.trackingContext)?raw.trackingContext as Record<string,unknown>:{};
  const value=(key:string)=>typeof metadata[key]==="string"?(metadata[key] as string).slice(0,1000):undefined;
  try{
    const result=await db.transaction(tx=>submitOrderLead(tx,slug,raw.token as string,raw,attribution,new Date(),{ip,userAgent:request.headers.get("user-agent")??undefined,sourceUrl:value("sourceUrl"),fbp:value("fbp"),fbc:value("fbc")}));
    return reply({reference:result.reference,url:result.url,meta:result.meta});
  }catch(error){return reply({error:leadErrorMessage(error)},error instanceof LeadError?400:503);}
}
