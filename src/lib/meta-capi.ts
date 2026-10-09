import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, lte, lt, ne, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orderForms, orderFormCapi, metaCapiOutbox, orderLeads, appSettings } from "@/db/schema";
import type { LeadDb } from "./order-leads";
import { encryptSecret,decryptSecret } from "./secret-box";
import { CapiError,makeCapiEvent,sendCapiEvent,type CapiContext,type CapiEvent } from "./meta-capi-client";
import { readTracking } from "./order-form-config";
export type CapiInput={enabled:boolean;pixelId:string;token:string};
export type CapiView={enabled:boolean;pixelId:string;hasToken:boolean;version:string;testStatus:string|null;testSucceeded:boolean|null;testedAt:string|null;counts:Record<string,number>;worker:{status:string;at:string}|null;events:{eventId:string;eventName:string;pixelId:string;status:string;attempts:number;lastError:string|null;errorCode:number|null;traceId:string|null;createdAt:string;nextAttemptAt:string;sentAt:string|null;canRetry:boolean}[]};
const MAX_AGE=24*3600000;
const MAX_ATTEMPTS=8;

const capiInput=z.object({enabled:z.boolean(),pixelId:z.string().trim().regex(/^\d{5,25}$/, "Pixel ID CAPI harus berupa angka."),token:z.string().trim().max(4096).refine(v=>!v||/^[A-Za-z0-9_.|-]{20,4096}$/.test(v),'Access Token tidak valid.')});
export async function saveCapiConfig(tx:LeadDb,actor:{id:number;role:string},formId:number,input:CapiInput){
 const [form]=await tx.select().from(orderForms).where(eq(orderForms.id,formId)).for('update');
 if(!form||form.deletedAt||!(actor.role==='supervisor'||actor.role==='advertiser'&&form.ownerId===actor.id))throw new CapiError("Tidak memiliki akses konfigurasi CAPI.");
 const [old]=await tx.select().from(orderFormCapi).where(eq(orderFormCapi.formId,formId)).for('update');
 if(!input.enabled&&!input.pixelId&&!input.token&&!old)return;
 // Disabling must remain possible even if an old encryption key is unavailable.
 if(old&&!input.enabled&&!input.token&&input.pixelId===old.pixelId){
  if(old.enabled){await tx.update(orderFormCapi).set({enabled:false,version:randomUUID(),updatedAt:new Date(),testStatus:null,testSucceeded:null,testedAt:null}).where(eq(orderFormCapi.formId,formId));
   await tx.update(metaCapiOutbox).set({status:'cancelled',lastError:'CAPI dinonaktifkan.',payload:''}).where(and(eq(metaCapiOutbox.formId,formId),inArray(metaCapiOutbox.status,['pending','failed'])));}
  return;
 }
 const parsed=capiInput.safeParse(input);if(!parsed.success)throw new CapiError(parsed.error.issues[0].message);
 const data=parsed.data;const token=data.token||(old?decryptSecret(old.token):null);
 if(!token)throw new CapiError("Isi Access Token CAPI terlebih dahulu.");
 if(old&&old.pixelId!==data.pixelId&&!data.token)throw new CapiError("Masukkan token untuk Pixel ID baru.");
 const changed=!old||old.enabled!==data.enabled||old.pixelId!==data.pixelId||token!==decryptSecret(old.token);
 if(!changed)return;
 const version=randomUUID();
 await tx.insert(orderFormCapi).values({formId,pixelId:data.pixelId,token:encryptSecret(token),enabled:data.enabled,version,testStatus:null,testSucceeded:null,testedAt:null}).onConflictDoUpdate({target:orderFormCapi.formId,set:{pixelId:data.pixelId,token:encryptSecret(token),enabled:data.enabled,version,testStatus:null,testSucceeded:null,testedAt:null,updatedAt:new Date()}});
 if(old?.enabled&&data.enabled&&old.pixelId===data.pixelId){
  // A token rotation keeps the destination and original event snapshot unchanged.
  await tx.update(metaCapiOutbox).set({configVersion:version}).where(and(eq(metaCapiOutbox.formId,formId),eq(metaCapiOutbox.configVersion,old.version),inArray(metaCapiOutbox.status,['pending','failed'])));
 }else await tx.update(metaCapiOutbox).set({status:'cancelled',lastError:'CAPI dinonaktifkan atau Pixel berubah. Event lama tidak dipindah ke Pixel baru.',payload:''}).where(and(eq(metaCapiOutbox.formId,formId),inArray(metaCapiOutbox.status,['pending','failed'])));
}
export async function getCapiView(formId:number):Promise<CapiView>{
 const [row]=await db.select({enabled:orderFormCapi.enabled,pixelId:orderFormCapi.pixelId,version:orderFormCapi.version,testStatus:orderFormCapi.testStatus,testSucceeded:orderFormCapi.testSucceeded,testedAt:orderFormCapi.testedAt}).from(orderFormCapi).where(eq(orderFormCapi.formId,formId));
 const events=await db.select({eventId:metaCapiOutbox.eventId,eventName:metaCapiOutbox.eventName,pixelId:metaCapiOutbox.pixelId,status:metaCapiOutbox.status,attempts:metaCapiOutbox.attempts,lastError:metaCapiOutbox.lastError,errorCode:metaCapiOutbox.errorCode,traceId:metaCapiOutbox.traceId,createdAt:metaCapiOutbox.createdAt,nextAttemptAt:metaCapiOutbox.nextAttemptAt,sentAt:metaCapiOutbox.sentAt,version:metaCapiOutbox.configVersion,hasPayload:sql<boolean>`${metaCapiOutbox.payload} <> ''`}).from(metaCapiOutbox).where(eq(metaCapiOutbox.formId,formId)).orderBy(desc(metaCapiOutbox.id)).limit(20);
 const totals=await db.select({status:metaCapiOutbox.status,n:sql<number>`count(*)`.mapWith(Number)}).from(metaCapiOutbox).where(eq(metaCapiOutbox.formId,formId)).groupBy(metaCapiOutbox.status);
 const [heartbeat]=await db.select({value:appSettings.value,at:appSettings.updatedAt}).from(appSettings).where(eq(appSettings.key,'capi.worker'));
 const worker=heartbeat?{status:Date.now()-heartbeat.at.getTime()>7*60000?'stale':heartbeat.value,at:heartbeat.at.toISOString()}:null;
 return {enabled:row?.enabled??false,pixelId:row?.pixelId??'',hasToken:!!row,version:row?.version??'',testStatus:row?.testStatus??null,testSucceeded:row?.testSucceeded??null,testedAt:row?.testedAt?.toISOString()??null,counts:Object.fromEntries(totals.map(t=>[t.status,t.n])),worker,events:events.map(({hasPayload,version,...e})=>({...e,createdAt:e.createdAt.toISOString(),nextAttemptAt:e.nextAttemptAt.toISOString(),sentAt:e.sentAt?.toISOString()??null,canRetry:!!row?.enabled&&version===row.version&&e.status==='failed'&&hasPayload&&e.attempts<MAX_ATTEMPTS&&Date.now()-e.createdAt.getTime()<MAX_AGE&&e.nextAttemptAt<=new Date()}))};
}
export async function queueCapiLead(tx:LeadDb,form:typeof orderForms.$inferSelect,lead:typeof orderLeads.$inferSelect,context:CapiContext){
 const [config]=await tx.select().from(orderFormCapi).where(and(eq(orderFormCapi.formId,form.id),eq(orderFormCapi.enabled,true)));
 const tracking=readTracking(form.tracking);const meta={event:tracking.metaEvent,pixelIds:[...new Set([...tracking.metaPixelIds,...(config?[config.pixelId]:[])])]};
 await tx.update(orderLeads).set({metaTracking:meta}).where(eq(orderLeads.id,lead.id));
 if(!config||!lead.measurementConsent)return meta;
 const fallback=new URL(`/f/${form.slug}`,process.env.APP_URL||'http://localhost:3000').href;
 const event=makeCapiEvent(lead,meta.event,context,fallback,lead.attribution.fbclid);
 await tx.insert(metaCapiOutbox).values({formId:form.id,leadId:lead.id,eventId:lead.publicId,eventName:meta.event,pixelId:config.pixelId,configVersion:config.version,payload:encryptSecret(JSON.stringify(event))}).onConflictDoNothing({target:metaCapiOutbox.eventId});
 return meta;
}
export async function processCapiOutbox(limit=20){
 // Purge expired payloads even when an event is no longer in the due queue.
 await db.update(metaCapiOutbox).set({payload:'',status:sql`case when ${metaCapiOutbox.status} = 'pending' then 'failed' else ${metaCapiOutbox.status} end`,lastError:sql`case when ${metaCapiOutbox.status} = 'pending' then 'Batas percobaan ulang 24 jam berakhir.' else ${metaCapiOutbox.lastError} end`}).where(and(lt(metaCapiOutbox.createdAt,new Date(Date.now()-MAX_AGE)),ne(metaCapiOutbox.payload,'')));

 const due=await db.select({id:metaCapiOutbox.id,formId:metaCapiOutbox.formId}).from(metaCapiOutbox).where(and(eq(metaCapiOutbox.status,'pending'),lte(metaCapiOutbox.nextAttemptAt,new Date()))).orderBy(asc(metaCapiOutbox.id)).limit(limit);
 for(const item of due)await db.transaction(async tx=>{
  // Lock config first: saving credentials waits for any in-flight event to finish.
  const [config]=await tx.select().from(orderFormCapi).where(eq(orderFormCapi.formId,item.formId)).for('update');
  const [row]=await tx.select().from(metaCapiOutbox).where(eq(metaCapiOutbox.id,item.id)).for('update');
  if(!row||row.status!=='pending'||row.nextAttemptAt>new Date())return;
  if(!config?.enabled||row.configVersion!==config.version){await tx.update(metaCapiOutbox).set({status:'cancelled',payload:'',lastError:'CAPI dinonaktifkan atau konfigurasi berubah.'}).where(eq(metaCapiOutbox.id,row.id));return;}
  if(Date.now()-row.createdAt.getTime()>MAX_AGE){await tx.update(metaCapiOutbox).set({status:'failed',payload:'',lastError:'Batas percobaan ulang 24 jam berakhir.'}).where(eq(metaCapiOutbox.id,row.id));return;}
  const attempts=row.attempts+1;
  try{
   const token=decryptSecret(config.token),payload=decryptSecret(row.payload);if(!token||!payload)throw new CapiError('Kredensial atau payload tidak dapat dibaca. Simpan ulang konfigurasi.');
   const receipt=await sendCapiEvent(row.pixelId,token,JSON.parse(payload) as CapiEvent);
   await tx.update(metaCapiOutbox).set({status:'sent',sentAt:new Date(),attempts,lastError:null,errorCode:null,traceId:receipt.traceId,payload:''}).where(eq(metaCapiOutbox.id,row.id));
  }catch(error){
   const retry=error instanceof CapiError&&error.retryable&&attempts<MAX_ATTEMPTS;
   const delay=Math.max(Math.min(3600,30*2**attempts)*1000,error instanceof CapiError?error.retryAfterMs:0);
   await tx.update(metaCapiOutbox).set({status:retry?'pending':'failed',attempts,lastError:error instanceof CapiError?error.message:'Event belum dapat diproses.',errorCode:error instanceof CapiError?error.code:null,traceId:error instanceof CapiError?error.traceId:null,nextAttemptAt:new Date(Date.now()+delay),...(attempts>=MAX_ATTEMPTS?{payload:''}:{})}).where(eq(metaCapiOutbox.id,row.id));
  }
 });
}
export async function testSavedCapi(actor:{id:number;role:string},formId:number,testCode:string){
 if(!/^[A-Za-z0-9_-]{3,100}$/.test(testCode))throw new CapiError('Isi Test Event Code dari Events Manager. Tes tidak dikirim sebagai event produksi.');
 return db.transaction(async tx=>{
  const [form]=await tx.select().from(orderForms).where(eq(orderForms.id,formId)).for('update');
  if(!form||form.deletedAt||!(actor.role==='supervisor'||actor.role==='advertiser'&&form.ownerId===actor.id))throw new CapiError('Form tidak ditemukan.');
  const [config]=await tx.select().from(orderFormCapi).where(eq(orderFormCapi.formId,formId)).for('update');
  if(!config)throw new CapiError('Simpan Pixel ID dan Access Token terlebih dahulu.');
  if(config.testedAt&&Date.now()-config.testedAt.getTime()<60000)throw new CapiError('Tunggu satu menit sebelum menguji lagi.');
  let message;let ok=false;
  try{const token=decryptSecret(config.token);if(!token)throw new CapiError('Access Token tidak dapat dibaca. Simpan ulang.');
   const event=makeCapiEvent({publicId:randomUUID(),phone:null,email:'capi-test@example.invalid',createdAt:new Date()},readTracking(form.tracking).metaEvent,{userAgent:'KPIAds CAPI Test'},new URL(`/f/${form.slug}`,process.env.APP_URL||'http://localhost:3000').href);
   await sendCapiEvent(config.pixelId,token,event,testCode);message='Meta menerima 1 event uji. Periksa Test Events untuk detail.';ok=true;
  }catch(error){message=error instanceof CapiError?error.message:'Pengujian belum berhasil.';}
  await tx.update(orderFormCapi).set({testedAt:new Date(),testStatus:message,testSucceeded:ok}).where(eq(orderFormCapi.formId,form.id));return {ok,message};
 });
}

export async function retryCapiEvent(actor:{id:number;role:string},formId:number,eventId:string){
 if(!Number.isSafeInteger(formId)||formId<1||!z.uuid().safeParse(eventId).success)throw new CapiError('Event tidak valid.');
 await db.transaction(async tx=>{
  const [form]=await tx.select().from(orderForms).where(eq(orderForms.id,formId)).for('update');
  if(!form||form.deletedAt||!(actor.role==='supervisor'||actor.role==='advertiser'&&form.ownerId===actor.id))throw new CapiError('Form tidak ditemukan.');
  const [config]=await tx.select().from(orderFormCapi).where(eq(orderFormCapi.formId,formId)).for('update');
  const [event]=await tx.select().from(metaCapiOutbox).where(and(eq(metaCapiOutbox.formId,formId),eq(metaCapiOutbox.eventId,eventId))).for('update');
  if(!config?.enabled||!event||event.configVersion!==config.version||event.pixelId!==config.pixelId)throw new CapiError('Konfigurasi event sudah berubah atau CAPI tidak aktif.');
  if(event.status!=='failed'||!event.payload||event.attempts>=MAX_ATTEMPTS||Date.now()-event.createdAt.getTime()>=MAX_AGE)throw new CapiError('Event tidak dapat dicoba ulang. Batasnya 8 percobaan dan 24 jam; event terkirim tidak dikirim ulang.');
  if(event.nextAttemptAt>new Date())throw new CapiError('Tunggu jadwal percobaan berikutnya sebelum mencoba ulang.');
  await tx.update(metaCapiOutbox).set({status:'pending',nextAttemptAt:new Date()}).where(eq(metaCapiOutbox.id,event.id));
 });
}
export async function markCapiWorker(status:'running'|'healthy'|'error'){
 await db.insert(appSettings).values({key:'capi.worker',value:status,updatedAt:new Date()}).onConflictDoUpdate({target:appSettings.key,set:{value:status,updatedAt:new Date()}});
}
