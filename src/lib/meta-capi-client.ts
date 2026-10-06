import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
export class CapiError extends Error {constructor(message:string,public retryable=false,public code:number|null=null,public traceId:string|null=null,public retryAfterMs=0){super(message);}}
export type CapiContext={ip?:string;userAgent?:string;sourceUrl?:string;fbp?:string;fbc?:string};
export type CapiEvent={event_name:string;event_time:number;event_id:string;action_source:"website";event_source_url:string;user_data:Record<string,string|string[]>};
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
export function cleanSourceUrl(value:string|undefined,fallback:string){
 try{const url=new URL(value||fallback);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return fallback;return `${url.origin}${url.pathname}`.slice(0,1000);}catch{return fallback;}
}
export function makeCapiEvent(lead:{publicId:string;phone:string|null;email:string|null;createdAt:Date},eventName:string,context:CapiContext,fallback:string,fbclid?:string):CapiEvent{
 const user:Record<string,string|string[]>={};
 if(lead.phone)user.ph=[hash(lead.phone.replace(/\D/g,''))];if(lead.email)user.em=[hash(lead.email.trim().toLowerCase())];
 user.external_id=[hash('kpiads:'+(lead.phone||lead.email||lead.publicId))];
 if(context.ip&&isIP(context.ip))user.client_ip_address=context.ip;
 if(context.userAgent)user.client_user_agent=context.userAgent.slice(0,512);
 if(context.fbp&&/^fb\.\d\.\d{10,13}\.\d{1,30}$/.test(context.fbp))user.fbp=context.fbp;
 if(context.fbc&&/^fb\.\d\.\d{10,13}\.[A-Za-z0-9_-]{1,300}$/.test(context.fbc))user.fbc=context.fbc;
 else if(fbclid&&/^[A-Za-z0-9_-]{1,200}$/.test(fbclid))user.fbc=`fb.1.${lead.createdAt.getTime()}.${fbclid}`;
 return {event_name:eventName,event_time:Math.floor(lead.createdAt.getTime()/1000),event_id:lead.publicId,action_source:'website',event_source_url:cleanSourceUrl(context.sourceUrl,fallback),user_data:user};
}
export function retryAfterMs(value:string|null,now=Date.now()){
 if(!value)return 0;
 const delay=/^\d+$/.test(value)?Number(value)*1000:Date.parse(value)-now;
 return Number.isFinite(delay)?Math.max(0,Math.min(86400000,delay)):0;
}
const trace=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value)?value:null;
export async function sendCapiEvent(pixelId:string,token:string,event:CapiEvent,testCode?:string){
 if(!/^\d{5,25}$/.test(pixelId))throw new CapiError("Pixel ID tidak valid.");
 const version=process.env.META_API_VERSION||'v24.0';if(!/^v\d+\.\d+$/.test(version))throw new CapiError("Versi Meta API belum dikonfigurasi dengan benar.");
 try{
  const response=await fetch(`https://graph.facebook.com/${version}/${pixelId}/events`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({data:[event],...(testCode?{test_event_code:testCode}:{})}),signal:AbortSignal.timeout(10000),cache:'no-store'});
  let body:{events_received?:number;fbtrace_id?:string;error?:{code?:number;fbtrace_id?:string;is_transient?:boolean}}={};
  try{body=await response.json();}catch{}
  const code=Number.isSafeInteger(body?.error?.code)?body.error!.code!:null;
  const traceId=trace(body?.error?.fbtrace_id??body?.fbtrace_id);
  if(response.ok&&body?.events_received===1)return {traceId};
  const delay=retryAfterMs(response.headers.get('retry-after'));
  if(response.status===429||response.status>=500||body?.error?.is_transient||[4,17,32,613].includes(code??0))throw new CapiError("Meta membatasi pengiriman atau sedang bermasalah. Percobaan ulang dijadwalkan otomatis.",true,code,traceId,delay);
  if(code===190||response.status===401||response.status===403||code===200||code===10)throw new CapiError("Token ditolak atau tidak memiliki akses ke Pixel. Perbarui token untuk Pixel yang sama, lalu coba ulang.",false,code,traceId);
  if(response.ok)throw new CapiError("Meta belum mengonfirmasi penerimaan event.",true,code,traceId,delay);
  throw new CapiError("Meta menolak konfigurasi atau event. Periksa Pixel ID, token, dan Test Events.",false,code,traceId);
 }catch(error){if(error instanceof CapiError)throw error;throw new CapiError("Koneksi Meta belum berhasil. Event akan dicoba ulang.",true);}
}
