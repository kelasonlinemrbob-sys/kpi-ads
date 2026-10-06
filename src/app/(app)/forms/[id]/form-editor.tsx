"use client";
import { useActionState,useState,useRef,useEffect } from "react";
import { TrackingSettings,type TrackingFocus } from "./tracking-settings";
import type { CapiInput,CapiView } from "@/lib/meta-capi";
import Link from "next/link";
import { toast } from "sonner";
import { saveOrderFormAction } from "@/actions/order-forms";
import { DEFAULT_ORDER_FIELDS, orderFormInput, type OrderFields } from "@/lib/order-form-input";
import { jakartaDate } from "@/lib/sheets-report";
import type { orderForms } from "@/db/schema";
import { Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FORM_THEMES, readAppearance, readTracking } from "@/lib/order-form-config";
import { OrderFormPreview } from "@/components/order-form-preview";
import { AppearanceSettings } from "./appearance-settings";
import { CsoRouting } from "./cso-routing";
const STEPS=[{id:"of-info",title:"Informasi",description:"Tentukan produk dan tujuan form."},{id:"of-look",title:"Tampilan",description:"Pilih field dan sesuaikan tampilan untuk customer."},{id:"of-cso",title:"CSO",description:"Atur penerima lead dan pesan WhatsApp."},{id:"of-tracking",title:"Tracking",description:"Opsional. Hubungkan pixel untuk mengukur konversi."},{id:"of-publish",title:"Simpan & pasang",description:"Periksa ringkasan, simpan form, lalu pasang di landing page."}];
const fieldStep:Record<string,number>={campaignId:0,title:0,description:0,source:0,fields:1,appearance:1,routing:2,assigneeIds:2,weights:2,message:2,tracking:3,effectiveDate:4,published:4,useFormLeads:4};
const selectClass="h-10 w-full rounded-md border bg-background px-3 text-sm";
export function FormEditor({form,products,csos,origin,capi}:{capi?:CapiView;form?:typeof orderForms.$inferSelect;products:{id:number;name:string;product:string|null;platform:string;owner:string;formLeadSince:string|null}[];csos:{id:number;name:string;phone:string|null}[];origin:string}){
 const [capiValue,setCapiValue]=useState<CapiInput>({enabled:capi?.enabled??false,pixelId:capi?.pixelId??"",token:""});
 useEffect(()=>{setCapiValue({enabled:capi?.enabled??false,pixelId:capi?.pixelId??"",token:""});},[capi?.version]);
 const [step,setStep]=useState(0);
 const [stepError,setStepError]=useState("");
 const [showPreview,setShowPreview]=useState(false);
 const formRef=useRef<HTMLFormElement>(null);const headingRef=useRef<HTMLHeadingElement>(null);
 const [state,action,pending]=useActionState(saveOrderFormAction,undefined);
 const [campaignId,setCampaignId]=useState(form?.campaignId??products[0]?.id??0);
 const [source,setSource]=useState(form?.source??"ads");
 const selected=products.find(p=>p.id===campaignId);
 const [fields,setFields]=useState<OrderFields>(form?.fields??DEFAULT_ORDER_FIELDS);
 const [title,setTitle]=useState(form?.title??"Silakan isi data Anda");
 const [description,setDescription]=useState(form?.description??"Tim kami siap membantu memilih program yang sesuai.");
 const [appearance,setAppearance]=useState(readAppearance(form?.appearance??{}));
 const [tracking,setTracking]=useState(readTracking(form?.tracking??{}));
 const [routing,setRouting]=useState(form?.routing??"fixed");
 const [assignees,setAssignees]=useState<number[]>(form?.assigneeIds??[]);
 const [weights,setWeights]=useState<Record<string,number>>(form?.weights??{});
 const [message,setMessage]=useState(form?.message??"Halo, saya ingin informasi lebih lanjut mengenai program ini.");
 const [published,setPublished]=useState(form?.published??false);
 const [useFormLeads,setUseFormLeads]=useState(true);
 const [effectiveDate,setEffectiveDate]=useState(jakartaDate());
 const [trackingFocus,setTrackingFocus]=useState<TrackingFocus>({platform:"meta",version:0});
 function revealTracking(field="capi"){setTrackingFocus(previous=>({platform:field==="gtmIds"?"gtm":field==="tiktokPixelIds"?"tiktok":"meta",version:previous.version+1,field}));}

 function goTo(next:number){setStep(next);setStepError("");requestAnimationFrame(()=>headingRef.current?.focus());}
 function validate(final=false){
  const parsed=orderFormInput.safeParse({id:form?.id,campaignId,title,description,fields,appearance,tracking,routing,assigneeIds:assignees,weights:routing==="weighted"?Object.fromEntries(assignees.map(id=>[id,weights[id]??0])):{},published:final?published:false,source,message,useFormLeads:source==="ads"&&useFormLeads,effectiveDate:selected?.formLeadSince??effectiveDate});
  if(final||step>=3){
   const configured=capiValue.enabled||!!capiValue.pixelId||!!capiValue.token||capi?.hasToken;
   const error=configured&&!/^\d{5,25}$/.test(capiValue.pixelId)?"Pixel ID CAPI harus berupa angka (5–25 digit).":configured&&(!capi?.hasToken||capi.pixelId!==capiValue.pixelId)&&!capiValue.token?"Isi Access Token untuk Pixel ID CAPI ini.":capiValue.token&&!/^[A-Za-z0-9_.|-]{20,4096}$/.test(capiValue.token)?"Access Token CAPI tidak valid.":"";
   if(error){setStep(3);revealTracking();setStepError(error);requestAnimationFrame(()=>headingRef.current?.focus());return false;}
  }
  if(parsed.success)return true;
  const issue=parsed.error.issues.map(issue=>({issue,step:fieldStep[String(issue.path[0])]??step})).filter(item=>final||item.step<=step).sort((a,b)=>a.step-b.step)[0];
  if(!issue)return true;if(issue.step===3)revealTracking(String(issue.issue.path[1]??""));setStep(issue.step);setStepError(issue.issue.message);requestAnimationFrame(()=>headingRef.current?.focus());return false;
 }
 function next(){if(validate())goTo(Math.min(4,step+1));}
 useEffect(()=>{if(state?.error){setStepError(state.error);requestAnimationFrame(()=>headingRef.current?.focus());}},[state]);
 const link=form?`${origin}/f/${form.slug}`:"";const embed=form?`<script async src="${origin}/embed/order.js?form=${form.slug}"></script>`:"";
 async function copy(value:string){try{await navigator.clipboard.writeText(value);toast.success("Disalin");}catch{toast.error("Pilih teks dan salin secara manual.");}}
 return <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"><form ref={formRef} action={action} noValidate onSubmit={e=>{if(pending){e.preventDefault();return;}if(step<4){e.preventDefault();next();return;}if(!validate(true))e.preventDefault();}} className="grid gap-4">
 <nav aria-label="Langkah setup form" className="rounded-xl border bg-card p-3"><ol className="grid grid-cols-5 gap-1 sm:gap-2">{STEPS.map((item,index)=><li key={item.id}><button type="button" disabled={pending} aria-current={step===index?"step":undefined} aria-controls={item.id} onClick={()=>goTo(index)} className={`flex w-full flex-col items-center gap-2 rounded-lg px-1 py-2 text-center text-xs transition-colors sm:text-sm ${step===index?"bg-primary/10 font-semibold text-foreground":"text-muted-foreground hover:bg-muted"}`}><span className={`flex size-7 items-center justify-center rounded-full border text-xs ${step===index?"border-primary bg-primary text-primary-foreground":index<step?"border-primary/30 bg-primary/5":"border-border"}`}>{index+1}</span><span>{item.title}</span></button></li>)}</ol></nav>
 <div className="px-1"><p className="text-xs text-muted-foreground">Langkah {step+1} dari {STEPS.length}{step===3?" · Opsional":""}</p><h2 ref={headingRef} tabIndex={-1} className="mt-1 text-lg font-semibold outline-none">{STEPS[step].title}</h2><p className="mt-1 text-sm text-muted-foreground">{STEPS[step].description}</p></div>
 {stepError&&<p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{stepError}</p>}

 <input type="hidden" name="appearance" value={JSON.stringify(appearance)} /><input type="hidden" name="tracking" value={JSON.stringify(tracking)} /><input type="hidden" name="weights" value={JSON.stringify(routing==="weighted"?Object.fromEntries(assignees.map(id=>[id,weights[id]??0])):{})} />
 {form&&<input type="hidden" name="id" value={form.id} />}
 <div id="of-info" hidden={step!==0}><Panel title="Informasi form"><div className="grid gap-4 p-4"><div className="grid gap-2"><Label htmlFor="of-product">Produk · advertiser</Label><select id="of-product" className={selectClass} name="campaignId" value={campaignId} onChange={e=>setCampaignId(Number(e.target.value))} required disabled={!!form}>{!products.length&&<option value="">Belum ada produk aktif</option>}{products.map(p=><option key={p.id} value={p.id}>{p.product||p.name} · {p.platform} · {p.owner}</option>)}</select>{form&&<input name="campaignId" type="hidden" value={form.campaignId} />}{!products.length&&<Link className="text-sm underline" href="/campaigns?tab=products">Tambahkan produk aktif di Campaigns terlebih dahulu.</Link>}</div>
 <div className="grid gap-2"><Label htmlFor="of-title">Judul form</Label><Input id="of-title" name="title" value={title} onChange={e=>setTitle(e.target.value)} required maxLength={120} /></div>
 <div className="grid gap-2"><Label htmlFor="of-desc">Deskripsi</Label><textarea id="of-desc" name="description" className="min-h-20 rounded-md border bg-background p-3 text-sm" maxLength={600} value={description} onChange={e=>setDescription(e.target.value)} /></div>
 <div className="grid gap-2"><Label htmlFor="of-source">Sumber pengunjung</Label><select id="of-source" name="source" className={selectClass} value={source} onChange={e=>setSource(e.target.value)} disabled={!!form}><option value="ads">Iklan {selected?.platform} — dihitung untuk produk ini</option><option value="organic">Organik — dicatat terpisah dari hasil iklan</option></select>{form&&<input type="hidden" name="source" value={form.source} />}<p className="text-xs text-muted-foreground">Gunakan form berbeda untuk tiap produk/platform dan trafik organik. Parameter UTM disimpan untuk penelusuran sumber.</p></div></div></Panel></div>
 <div id="of-look" hidden={step!==1}><AppearanceSettings fields={fields} setFields={setFields} appearance={appearance} setAppearance={setAppearance} /></div>
 <div id="of-cso" hidden={step!==2} className="space-y-4"><CsoRouting csos={csos} routing={routing} setRouting={setRouting} assignees={assignees} setAssignees={setAssignees} weights={weights} setWeights={setWeights} /><Panel title="Pesan WhatsApp"><div className="grid gap-3 p-4"><Label htmlFor="of-message">Pesan pembuka WhatsApp</Label><textarea id="of-message" name="message" className="min-h-24 rounded-md border bg-background p-3 text-sm" maxLength={500} value={message} onChange={e=>setMessage(e.target.value)} required /><p className="text-xs text-muted-foreground">Produk, data customer yang aktif, dan nomor referensi ditambahkan otomatis.</p></div></Panel></div>
 <div id="of-tracking" hidden={step!==3}><TrackingSettings formId={form?.id} capi={capi} capiValue={capiValue} setCapiValue={setCapiValue} tracking={tracking} setTracking={setTracking} focus={trackingFocus} /></div>
 <div id="of-publish" hidden={step!==4}><Panel title="Ringkasan & penerbitan"><div className="grid gap-4 p-4"><dl className="grid gap-3 rounded-lg bg-muted/30 p-4 text-sm sm:grid-cols-2">{[["Produk",selected?.product||selected?.name||"Belum dipilih"],["Judul",title],["Field aktif",Object.values(fields).filter(v=>v!=="off").length+" field"],["CSO",assignees.map(id=>csos.find(c=>c.id===id)?.name??`#${id}`).join(", ")||"Belum dipilih"],["Pembagian",routing==="weighted"?"Persentase · "+assignees.map(id=>`${csos.find(c=>c.id===id)?.name??`#${id}`} ${weights[id]??0}%`).join(" / "):routing==="fixed"?"CSO tetap":"Bergiliran"],["Tema",appearance.theme==="custom"?"Kustom":FORM_THEMES[appearance.theme].label],["Meta CAPI",capiValue.enabled?"Aktif setelah disimpan":"Nonaktif"],["Tracking",[...tracking.metaPixelIds,...tracking.gtmIds,...tracking.tiktokPixelIds].length+" ID terpasang"]].map(([label,value])=><div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" checked={published} onChange={e=>setPublished(e.target.checked)} />Terbitkan form dan terima pendaftaran</label>{selected?.formLeadSince?<p className="rounded-lg border p-3 text-sm">Produk ini menggunakan Lead Form untuk KPI mulai {selected.formLeadSince}. Lead Ads tetap disimpan sebagai pembanding. Kebijakan ini tetap berlaku jika form dinonaktifkan.</p>:<label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="useFormLeads" checked={useFormLeads} onChange={e=>setUseFormLeads(e.target.checked)} disabled={source!=="ads"} />Gunakan Lead Form sebagai Results/Lead produk ini setelah form diterbitkan</label>}<div className="grid gap-2"><Label htmlFor="of-effective">Berlaku mulai (WIB)</Label><Input id="of-effective" type="date" name="effectiveDate" value={selected?.formLeadSince??effectiveDate} onChange={e=>setEffectiveDate(e.target.value)} min={selected?.formLeadSince??jakartaDate()} readOnly={!!selected?.formLeadSince} required /></div><p className="text-xs text-muted-foreground">Lead form valid dihitung sekali per kontak, form, dan hari. Organik tetap terpisah. Perubahan ini tidak mengganti laporan historis.</p></div></Panel></div>
 <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur"><Button type="button" variant="outline" disabled={pending||step===0} onClick={()=>goTo(step-1)}>Kembali</Button><span className="hidden text-xs text-muted-foreground sm:block">Isian tetap tersimpan saat berpindah langkah</span>{step<4?<Button key="wizard-next" type="button" disabled={pending} onClick={e=>{e.preventDefault();next();}}>{step===3?"Lanjut ke ringkasan":"Lanjut"}</Button>:<Button key="wizard-save" disabled={pending||!products.length} type="submit">{pending?"Menyimpan…":published?"Simpan & terbitkan":"Simpan draf"}</Button>}</div>
 </form>
 <aside className="grid gap-4 xl:sticky xl:top-6"><Button type="button" variant="outline" className="xl:hidden" aria-expanded={showPreview} aria-controls="wizard-preview" onClick={()=>setShowPreview(!showPreview)}>{showPreview?"Tutup preview":"Lihat preview form"}</Button><div id="wizard-preview" className={showPreview?"block":"hidden xl:block"}><Panel title="Preview form · langsung"><div className="p-3"><OrderFormPreview title={title} description={description} product={selected?.product||selected?.name} fields={fields} appearance={appearance} /><p className="mt-3 text-center text-xs text-muted-foreground">Preview tidak mengirim lead atau event tracking.</p></div></Panel></div>{step===4&&<Panel title="Pasang di landing page"><div className="grid gap-3 p-4 text-sm">{form?<><p>Bagikan tautan atau tempel kode berikut pada blok HTML landing page.</p><Label>Tautan publik</Label><Input readOnly value={link} /><div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>copy(link)}>Salin tautan</Button><Button asChild variant="outline" size="sm"><a href={link} target="_blank" rel="noreferrer">Buka form</a></Button></div><Label>Kode embed</Label><textarea readOnly value={embed} className="min-h-28 w-full rounded-lg border bg-muted/30 p-3 font-mono text-xs" /><Button variant="outline" size="sm" onClick={()=>copy(embed)}>Salin kode embed</Button><p className="text-xs text-muted-foreground">Kode meneruskan UTM dan ID klik dari alamat landing page ke form. Setelah data tersimpan, customer melanjutkan ke WhatsApp CSO.</p></>:<p className="text-muted-foreground">Simpan form untuk mendapatkan tautan dan kode embed.</p>}</div></Panel>}<div className="rounded-lg border border-dashed p-4 text-xs leading-relaxed text-muted-foreground">Perubahan diterapkan setelah menekan Simpan di langkah terakhir. Tracking boleh dikosongkan.</div></aside></div>;
}
