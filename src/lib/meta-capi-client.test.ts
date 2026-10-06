import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CapiError,makeCapiEvent,retryAfterMs,sendCapiEvent } from './meta-capi-client';
test('retry-after accepts seconds/date and bounds malformed values',()=>{
 assert.equal(retryAfterMs('120'),120000);assert.equal(retryAfterMs('bad'),0);assert.equal(retryAfterMs('999999999'),86400000);assert.equal(retryAfterMs('Thu, 01 Jan 1970 00:02:00 GMT',0),120000);
});
test('Meta receipts and errors keep diagnostic IDs but never raw error text',async()=>{
 const fetch=globalThis.fetch;const event=makeCapiEvent({publicId:crypto.randomUUID(),phone:null,email:'qa@example.invalid',createdAt:new Date()},'Lead',{},'https://app.example/f/qa');
 try{
  globalThis.fetch=async()=>Response.json({events_received:1,fbtrace_id:'trace_123'});assert.deepEqual(await sendCapiEvent('123456','fake',event),{traceId:'trace_123'});
  globalThis.fetch=async()=>new Response('<html>rate limited</html>',{status:429,headers:{'Retry-After':'900'}});
  await assert.rejects(()=>sendCapiEvent('123456','fake',event),(e:unknown)=>e instanceof CapiError&&e.retryable&&e.retryAfterMs===900000);
  globalThis.fetch=async()=>Response.json({error:{code:190,fbtrace_id:'error-trace',message:'SECRET_TOKEN'}},{status:400});
  await assert.rejects(()=>sendCapiEvent('123456','fake',event),(e:unknown)=>e instanceof CapiError&&!e.retryable&&e.code===190&&e.traceId==='error-trace'&&!e.message.includes('SECRET_TOKEN'));
  globalThis.fetch=async()=>Response.json({events_received:0});await assert.rejects(()=>sendCapiEvent('123456','fake',event),(e:unknown)=>e instanceof CapiError&&e.retryable);
  globalThis.fetch=async()=>{throw new Error('token=SECRET_TOKEN')};await assert.rejects(()=>sendCapiEvent('123456','fake',event),(e:unknown)=>e instanceof CapiError&&e.retryable&&!e.message.includes('SECRET_TOKEN'));
 }finally{globalThis.fetch=fetch;}
});
