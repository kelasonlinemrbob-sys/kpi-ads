import assert from 'node:assert/strict';
import { test,after } from 'node:test';
import { createHash,randomUUID } from 'node:crypto';
import { asc,eq,inArray } from 'drizzle-orm';
import { db } from '@/db';
import { users,campaigns,orderForms,orderLeads,orderFormCapi,metaCapiOutbox } from '@/db/schema';
import { saveOrderForm,createFormChallenge,submitOrderLead } from './order-leads';
import { saveCapiConfig,getCapiView,processCapiOutbox,testSavedCapi,retryCapiEvent } from './meta-capi';
import { decryptSecret } from './secret-box';
import { DEFAULT_ORDER_FIELDS } from './order-form-input';
import { jakartaDate } from './sheets-report';
after(()=>db.$client.end());
test('CAPI: authorization, encryption, opt-in, idempotency, retry, cancellation and isolated test events',async()=>{
 // Never process unrelated events, even though every HTTP call below is mocked.
 assert.equal((await db.select().from(metaCapiOutbox).where(eq(metaCapiOutbox.status,'pending'))).length,0);
 const ids:number[]=[];let campaignId=0;const originalFetch=globalThis.fetch;const calls:{url:string;body:any;headers:any}[]=[];let responseCode=200;
 globalThis.fetch=async(input,init)=>{calls.push({url:String(input),body:JSON.parse(String(init?.body)),headers:init?.headers});return Response.json(responseCode===200?{events_received:1}:{error:{code:responseCode===503?2:190,message:'secret must never surface'}},{status:responseCode});};
 try{
  for(const role of ['advertiser','advertiser','cso'] as const){const [user]=await db.insert(users).values({name:'CAPI QA',email:`${randomUUID()}@example.invalid`,passwordHash:'inaccessible',role,csoPhone:role==='cso'?'6281234567890':null}).returning();ids.push(user.id);}
  const actor={id:ids[0],role:'advertiser'};const [campaign]=await db.insert(campaigns).values({name:'CAPI QA',ownerId:actor.id,platform:'meta'}).returning();campaignId=campaign.id;
  const form=await db.transaction(tx=>saveOrderForm(tx,actor,{campaignId,title:'CAPI QA Form',description:'',fields:DEFAULT_ORDER_FIELDS,routing:'fixed',assigneeIds:[ids[2]],published:true,source:'ads',message:'Halo',useFormLeads:false,effectiveDate:jakartaDate(),tracking:{metaPixelIds:['9999999999'],metaEvent:'Lead'}}));
  const events=()=>db.select().from(metaCapiOutbox).where(eq(metaCapiOutbox.formId,form.id)).orderBy(asc(metaCapiOutbox.id));
  const settings={enabled:true,pixelId:'1234567890',token:'fake_capi_token_for_local_tests_only'};
  await assert.rejects(()=>db.transaction(tx=>saveCapiConfig(tx,{id:ids[1],role:'advertiser'},form.id,settings)),/akses/);
  await assert.rejects(()=>db.transaction(tx=>saveCapiConfig(tx,{id:ids[2],role:'cso'},form.id,settings)),/akses/);
  await assert.rejects(()=>db.transaction(tx=>saveCapiConfig(tx,actor,form.id,{...settings,token:''})),/Token/);
  await db.transaction(tx=>saveCapiConfig(tx,actor,form.id,settings));
  const [stored]=await db.select().from(orderFormCapi).where(eq(orderFormCapi.formId,form.id));assert.notEqual(stored.token,settings.token);assert.equal(decryptSecret(stored.token),settings.token);
  await db.transaction(tx=>saveCapiConfig(tx,actor,form.id,{...settings,token:''}));assert.equal((await getCapiView(form.id)).version,stored.version);
  assert.ok(!JSON.stringify(await getCapiView(form.id)).includes(settings.token));
  await assert.rejects(()=>db.transaction(tx=>saveCapiConfig(tx,actor,form.id,{...settings,pixelId:'7777777777',token:''})),/token/);
  let phone=0;
  const send=(consent:boolean,token=createFormChallenge(form.slug))=>db.transaction(tx=>submitOrderLead(tx,form.slug,token,{name:'Customer',phone:`0812777700${String(phone++).padStart(2,'0')}`,email:'CUSTOMER@example.invalid',city:'Malang',trackingConsent:consent},{fbclid:'clickid'},new Date(),{ip:'203.0.113.1',userAgent:'QA browser',sourceUrl:'https://landing.example/order?email=private@example.invalid#private'}));
  await send(false);assert.equal((await events()).length,0,'No CAPI without measurement opt-in; contact consent is not required');
  const token=createFormChallenge(form.slug);const pair=await Promise.all([send(true,token),send(true,token)]);assert.equal(pair[0].reference,pair[1].reference);assert.deepEqual(pair[0].meta,{event:'Lead',pixelIds:['9999999999','1234567890']});
  let rows=await events();assert.equal(rows.length,1);let event=JSON.parse(decryptSecret(rows[0].payload)!);
  assert.equal(event.event_id,pair[0].reference);assert.equal(event.event_name,'Lead');assert.equal(event.event_source_url,'https://landing.example/order');assert.equal(event.user_data.em[0],createHash('sha256').update('customer@example.invalid').digest('hex'));assert.equal(event.user_data.client_ip_address,'203.0.113.1');assert.ok(event.user_data.fbc.endsWith('.clickid'));
  assert.equal(calls.length,0,'Saving a lead never waits for Meta');
  responseCode=503;await processCapiOutbox();rows=await events();assert.equal(rows[0].status,'pending');assert.equal(rows[0].attempts,1);assert.ok(rows[0].nextAttemptAt>new Date());assert.ok(!rows[0].lastError?.includes('secret'));
  await db.update(metaCapiOutbox).set({nextAttemptAt:new Date(0)}).where(eq(metaCapiOutbox.id,rows[0].id));responseCode=200;await Promise.all([processCapiOutbox(),processCapiOutbox()]);
  rows=await events();assert.equal(rows[0].status,'sent');assert.equal(rows[0].payload,'');assert.equal(calls.length,2);assert.deepEqual(calls[0].body,calls[1].body);assert.ok(!calls[0].url.includes(settings.token));assert.equal(calls[0].headers.Authorization,`Bearer ${settings.token}`);
  await send(true);responseCode=401;await processCapiOutbox();rows=await events();assert.equal(rows[1].status,'failed');assert.ok(rows[1].payload);assert.equal(rows[1].errorCode,190);
  await assert.rejects(()=>retryCapiEvent({id:ids[1],role:'advertiser'},form.id,rows[1].eventId),/ditemukan/);
  await assert.rejects(()=>retryCapiEvent(actor,form.id,rows[1].eventId),/jadwal/);
  await db.update(metaCapiOutbox).set({nextAttemptAt:new Date(0)}).where(eq(metaCapiOutbox.id,rows[1].id));
  const oldVersion=(await getCapiView(form.id)).version;
  await db.transaction(tx=>saveCapiConfig(tx,actor,form.id,{...settings,token:'replacement_token_for_same_pixel_12345'}));
  assert.notEqual((await getCapiView(form.id)).version,oldVersion);assert.equal((await events())[1].status,'failed');assert.equal((await getCapiView(form.id)).events.find(e=>e.eventId===rows[1].eventId)?.canRetry,true);
  const reference=rows[1].eventId;await retryCapiEvent(actor,form.id,reference);
  await assert.rejects(()=>retryCapiEvent(actor,form.id,reference),/dicoba ulang/);
  responseCode=200;await processCapiOutbox();assert.equal((await events())[1].status,'sent');assert.equal(calls.at(-1)?.body.data[0].event_id,reference);assert.equal(calls.at(-1)?.headers.Authorization,'Bearer replacement_token_for_same_pixel_12345');
  await assert.rejects(()=>retryCapiEvent(actor,form.id,reference),/dicoba ulang/);
  await send(true);await db.transaction(tx=>saveCapiConfig(tx,actor,form.id,{...settings,enabled:false,token:''}));rows=await events();assert.equal(rows[2].status,'cancelled');assert.equal(rows[2].payload,'');
  const before=calls.length;await processCapiOutbox();assert.equal(calls.length,before);await send(true);assert.equal((await events()).length,3,'Disabled config does not queue');
  await assert.rejects(()=>testSavedCapi(actor,form.id,''),/Test Event Code/);await assert.rejects(()=>testSavedCapi({id:ids[1],role:'advertiser'},form.id,'TEST123'),/ditemukan/);
  const count=(await db.select().from(orderLeads).where(eq(orderLeads.formId,form.id))).length;responseCode=200;assert.deepEqual(await testSavedCapi(actor,form.id,'TEST123'),{ok:true,message:'Meta menerima 1 event uji. Periksa Test Events untuk detail.'});assert.equal(calls.at(-1)?.body.test_event_code,'TEST123');assert.equal((await db.select().from(orderLeads).where(eq(orderLeads.formId,form.id))).length,count);await assert.rejects(()=>testSavedCapi(actor,form.id,'TEST123'),/satu menit/);
  await db.update(orderFormCapi).set({testedAt:null}).where(eq(orderFormCapi.formId,form.id));responseCode=401;assert.equal((await testSavedCapi(actor,form.id,'TEST123')).ok,false);assert.equal((await getCapiView(form.id)).testSucceeded,false);
  const view=await getCapiView(form.id);assert.deepEqual(view.counts,{sent:2,cancelled:1});assert.ok(!JSON.stringify(view).includes('replacement_token'));assert.ok(!JSON.stringify(view).includes('customer@example.invalid'));
  await db.transaction(tx=>saveCapiConfig(tx,actor,form.id,settings));
  await send(true);let fresh=(await events()).at(-1)!;
  await db.transaction(tx=>saveCapiConfig(tx,actor,form.id,{...settings,token:'third_token_same_pixel_123456789'}));assert.equal((await events()).at(-1)?.status,'pending');
  await db.update(metaCapiOutbox).set({createdAt:new Date(Date.now()-25*3600000),nextAttemptAt:new Date(Date.now()+3600000)}).where(eq(metaCapiOutbox.id,fresh.id));
  const beforeExpiry=calls.length;await processCapiOutbox();assert.equal(calls.length,beforeExpiry);assert.equal((await events()).at(-1)?.status,'failed');assert.equal((await events()).at(-1)?.payload,'');
  await assert.rejects(()=>retryCapiEvent(actor,form.id,fresh.eventId),/dicoba ulang/);
  await send(true);fresh=(await events()).at(-1)!;
  await db.update(metaCapiOutbox).set({attempts:7}).where(eq(metaCapiOutbox.id,fresh.id));responseCode=503;await processCapiOutbox();assert.equal((await events()).at(-1)?.attempts,8);assert.equal((await events()).at(-1)?.status,'failed');assert.equal((await events()).at(-1)?.payload,'');
  await send(true);fresh=(await events()).at(-1)!;await db.transaction(tx=>saveCapiConfig(tx,actor,form.id,{...settings,pixelId:'5555555555'}));assert.equal((await events()).at(-1)?.status,'cancelled');await assert.rejects(()=>retryCapiEvent(actor,form.id,fresh.eventId),/berubah/);

 }finally{
  globalThis.fetch=originalFetch;
  if(campaignId){await db.delete(orderLeads).where(eq(orderLeads.campaignId,campaignId));await db.delete(orderForms).where(eq(orderForms.campaignId,campaignId));await db.delete(campaigns).where(eq(campaigns.id,campaignId));}
  if(ids.length)await db.delete(users).where(inArray(users.id,ids));
 }
});
