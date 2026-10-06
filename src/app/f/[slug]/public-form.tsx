"use client";
import { useState, useEffect, useRef } from "react";
import { FIELD_LABELS, type FieldKey, type OrderFields } from "@/lib/order-form-input";
import type { FormAppearance } from "@/lib/order-form-config";
import { ArrowRightCircle } from "lucide-react";
export function PublicOrderForm({slug,fields,token,appearance,hasTracking,hasCapi}:{slug:string;fields:OrderFields;token:string;appearance:FormAppearance;hasTracking:boolean;hasCapi:boolean}){
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [result,setResult]=useState<{url:string;reference:string}|null>(null);
  const trackingContext=useRef<Record<string,string>>({});
  const [embedded,setEmbedded]=useState(false);
  const parentOrigin=()=>{try{const value=new URLSearchParams(location.search).get("embed_origin");if(!value)return null;const url=new URL(value);return /^https?:$/.test(url.protocol)&&url.origin===value?value:null;}catch{return null;}};
  useEffect(()=>{
    setEmbedded(window.self!==window.top);
    const target=parentOrigin();const container=document.getElementById("public-order-container");if(!target||!container)return;
    const resize=()=>window.parent.postMessage({type:"kpiads:resize",slug,height:Math.ceil(container.getBoundingClientRect().height)+4},target);
    const receive=(event:MessageEvent)=>{if(event.origin===target&&event.source===window.parent&&event.data?.type==="kpiads:context"&&event.data.slug===slug){const data=event.data;for(const key of ["sourceUrl","fbp","fbc"])if(typeof data[key]==="string")trackingContext.current[key]=data[key].slice(0,1000);}};
    window.addEventListener("message",receive);window.parent.postMessage({type:"kpiads:ready",slug},target);
    const observer=new ResizeObserver(resize);observer.observe(container);resize();return ()=>{observer.disconnect();window.removeEventListener("message",receive);};
  },[slug]);
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setBusy(true);setError("");
    const form=new FormData(event.currentTarget);const attribution:Record<string,string>={};const query=new URLSearchParams(window.location.search);
    for(const key of ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","fbclid","ttclid"]){const value=query.get(key);if(value)attribution[key]=value;}
    try{
      const response=await fetch(`/api/order-forms/${slug}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...Object.fromEntries(form),trackingConsent:form.get("trackingConsent")==="on",trackingContext:form.get("trackingConsent")==="on"?{sourceUrl:location.origin+location.pathname,...trackingContext.current}:{},token,attribution})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Pendaftaran belum berhasil.");
      setResult(data);
      const target=parentOrigin();if(target&&form.get("trackingConsent")==="on")window.parent.postMessage({type:"kpiads:lead",slug,reference:data.reference,meta:data.meta,consent:true},target);
      // The stored result and explicit button survive blocked automatic navigation in an iframe.
      if(window.self===window.top)window.location.assign(data.url);
      else window.open(data.url,"_blank","noopener,noreferrer");
    }catch(error){setError(error instanceof Error?error.message:"Koneksi bermasalah. Coba kirim lagi.");}finally{setBusy(false);}
  }
  if(result)return <div className="of-line mt-6 border p-5" style={{borderRadius:"var(--of-card-radius)"}}><h2 className="font-semibold">Pendaftaran tersimpan</h2><p className="of-muted mt-2 text-sm">Lanjutkan ke WhatsApp lalu tekan Kirim agar CSO menerima pesan Anda.</p><a className="of-button mt-4" data-variant={appearance.buttonStyle} href={result.url} target="_blank" rel="noopener noreferrer">Lanjutkan ke WhatsApp CSO</a><p className="of-muted mt-3 break-all text-xs">Referensi: {result.reference}</p></div>;
  return <form onSubmit={submit} className="mt-6 grid gap-4">
    {(Object.keys(FIELD_LABELS) as FieldKey[]).filter(key=>fields[key]!=="off").map(key=><div className="grid gap-2" key={key}><label className={appearance.showLabels?"text-sm font-medium":"sr-only"} htmlFor={key}>{FIELD_LABELS[key]} {fields[key]==="required"?"*":"(opsional)"}</label><input className="of-field" data-variant={appearance.fieldStyle} id={key} name={key} type={key==="email"?"email":key==="phone"?"tel":"text"} autoComplete={{name:"name",phone:"tel",email:"email",city:"address-level2"}[key]} placeholder={appearance.placeholders[key]+(!appearance.showLabels&&fields[key]==="required"?" *":"")} maxLength={key==="email"?180:120} required={fields[key]==="required"} /></div>)}
    <div className="absolute -left-[10000px]" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    {(hasCapi||embedded&&hasTracking)&&<label className="of-muted flex items-start gap-2 text-xs leading-relaxed"><input className="mt-1" style={{accentColor:"var(--of-accent)"}} type="checkbox" name="trackingConsent" />Izinkan pengukuran iklan melalui Meta, Google atau TikTok (opsional).</label>}
    {error&&<p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    <button className="of-button" data-variant={appearance.buttonStyle} type="submit" disabled={busy}>{busy?"Menyimpan…":appearance.buttonText}{appearance.showButtonIcon&&<ArrowRightCircle className="size-5 shrink-0" />}</button>{appearance.note&&<p className="of-muted text-center text-xs">{appearance.note}</p>}
  </form>;
}
