/** Operator-only importer. Dry run by default. Never queues notifications or exports. */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
const aliases = ['khabib','ryant','wahib','fadhilah','thoha','rizqi','nabilla'];
const rowSchema = z.object({
 line:z.number().int().min(2), name:z.enum(aliases), date:z.iso.date(),
 platform:z.enum(['meta','google','tiktok']),originalPlatform:z.string(),product:z.string().trim().min(1).max(120),
 spent:z.number().finite().min(0).max(2147483647),impressions:z.number().int().min(0).max(2147483647),clicks:z.number().int().min(0).max(2147483647),leads:z.number().int().min(0).max(2147483647),
 notes:z.string(),submittedAt:z.iso.datetime({offset:true}),sourceRowHash:z.string().regex(/^[a-f0-9]{64}$/),
});
const planSchema=z.object({sha256:z.string().regex(/^[a-f0-9]{64}$/),duplicatePolicy:z.literal('hold'),eligibleId:z.literal('0'),readyRows:z.number().int(),source:z.string(),rows:z.array(rowSchema).min(1),heldRows:z.number().int(),skipped:z.record(z.string(),z.number())});
const canonical=(s)=>s.trim().toLowerCase();
const total=(rows)=>rows.reduce((a,r)=>({spentCents:a.spentCents+Math.round(r.spent*100),impressions:a.impressions+r.impressions,clicks:a.clicks+r.clicks,leads:a.leads+r.leads}),{spentCents:0,impressions:0,clicks:0,leads:0});
export async function importLegacyReports(client, input, emails, apply=false) {
 const plan=planSchema.parse(input);
 assert.equal(plan.rows.length,plan.readyRows,'Plan row count mismatch');
 assert.equal(new Set(plan.rows.map(r=>r.line)).size,plan.rows.length,'Duplicate source row');
 const rowKeys=plan.rows.map(r=>JSON.stringify([r.name,r.date,r.platform,canonical(r.product)]));
 assert.equal(new Set(rowKeys).size,plan.rows.length,'Duplicate normalized product/date identity');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 for(const row of plan.rows) assert.ok(row.date<today,'Only historical dates may be imported');
 const mapping=Object.fromEntries(aliases.map(name=>[name,z.email().parse(emails[name]).trim().toLowerCase()]));
 assert.equal(new Set(Object.values(mapping)).size,aliases.length,'Each member must have a distinct email');
 const marker='import:csv:'+plan.sha256;
 await client.query('BEGIN');
 try {
  await client.query("select pg_advisory_xact_lock(hashtextextended('legacy-report-import',0))");
  const previous=(await client.query('select value from app_settings where key=$1',[marker])).rows[0];
  if(previous){
   const old=JSON.parse(previous.value);
   assert.deepEqual(old.mapping,mapping,'Completed import has a different email mapping');
   const count=+(await client.query('select count(*) from legacy_report_rows where file_hash=$1',[plan.sha256])).rows[0].count;
   assert.equal(count,plan.readyRows,'Existing import audit is incomplete');
   await client.query('ROLLBACK');return {...old,alreadyImported:true};
  }
  const receipt={source:plan.source,fileHash:plan.sha256,mapping,rows:plan.rows.length,heldRows:plan.heldRows,skipped:plan.skipped,byMember:{},createdUserIds:[],createdCampaignIds:[],reportIds:[],totals:total(plan.rows),applied:apply};
  const members=new Map();
  for(const name of aliases){
   let user=(await client.query('select id,name,role from users where lower(email)=$1',[mapping[name]])).rows[0];
   if(!user){
    assert.notEqual(name,'wahib','Wahib must map to the existing supervisor account');
    const hash=await bcrypt.hash(randomBytes(32).toString('hex'),10);
    user=(await client.query("insert into users(name,email,password_hash,role,advertiser_level,is_active,invitation_pending) values($1,$2,$3,'advertiser','junior',false,true) returning id,name,role",[name[0].toUpperCase()+name.slice(1),mapping[name],hash])).rows[0];
    receipt.createdUserIds.push(user.id);
   }
   assert.ok(['advertiser','supervisor'].includes(user.role),`Account ${name} is not an advertiser`);
   members.set(name,user.id);
   receipt.byMember[name]={userId:user.id,rows:plan.rows.filter(r=>r.name===name).length,reports:0,...total(plan.rows.filter(r=>r.name===name))};
  }
  const metrics=(await client.query("select id,key from kpi_metrics where role='advertiser' and key in ('ad_spend','leads')")).rows;
  assert.equal(metrics.length,2,'Advertiser KPI metrics missing');
  const groups=new Map();
  for(const row of plan.rows){const key=row.name+':'+row.date;groups.set(key,[...(groups.get(key)||[]),row]);}
  // Check every report collision before writing reports. Never merge into existing app data.
  const existing=(await client.query('select user_id,date::text from daily_reports where user_id=any($1::int[])',[Array.from(members.values())])).rows;
  const occupied=new Set(existing.map(r=>r.user_id+':'+r.date));
  for(const group of groups.values())assert.ok(!occupied.has(members.get(group[0].name)+':'+group[0].date),`Existing report conflict: ${group[0].name} ${group[0].date}`);
  const campaigns=new Map();
  for(const group of groups.values()){
   const first=group[0]; const uid=members.get(first.name);
   const submitted=group.map(r=>r.submittedAt).sort();
   const summary='Impor laporan historis · '+plan.source+'\nTanggal performa: '+first.date+'\n\n'+group.map(r=>`[${r.originalPlatform} · ${r.product} · baris ${r.line}]\n${r.notes}`).join('\n\n');
   const report=(await client.query("insert into daily_reports(user_id,date,summary,source,created_at,updated_at) values($1,$2,$3,'legacy_csv',$4,$5) returning id",[uid,first.date,summary,submitted[0],submitted.at(-1)])).rows[0];
   receipt.reportIds.push(report.id);receipt.byMember[first.name].reports++;
   for(const row of group){
    const key=JSON.stringify([uid,row.platform,canonical(row.product)]);
    let campaign=campaigns.get(key);
    if(!campaign){
     const found=(await client.query("select id from campaigns where owner_id=$1 and platform=$2 and lower(trim(coalesce(nullif(product,''),name)))=$3",[uid,row.platform,canonical(row.product)])).rows;
     assert.ok(found.length<=1,'Ambiguous existing product '+row.product);
     campaign=found[0]?.id;
     if(!campaign){
      const dates=plan.rows.filter(r=>r.name===row.name&&r.platform===row.platform&&canonical(r.product)===canonical(row.product)).map(r=>r.date).sort();
      campaign=(await client.query("insert into campaigns(name,product,platform,owner_id,status,start_date,end_date,notes) values($1,$1,$2,$3,'ended',$4,$5,$6) returning id",[row.product,row.platform,uid,dates[0],dates.at(-1),'Produk arsip dari CSV; tidak tersambung ke sinkronisasi Ads.'])).rows[0].id;
      receipt.createdCampaignIds.push(campaign);
     }
     campaigns.set(key,campaign);
    }
    const item=(await client.query("insert into advertiser_report_items(report_id,campaign_id,\"window\",performance_date,platform,product,spent,impressions,clicks,leads,created_at) values($1,$2,'previous_day',$3,$4,$5,$6,$7,$8,$9,$10) returning id",[report.id,campaign,row.date,row.platform,row.product,row.spent,row.impressions,row.clicks,row.leads,row.submittedAt])).rows[0];
    await client.query('insert into legacy_report_rows(file_hash,source_row,source_data,item_id) values($1,$2,$3,$4)',[plan.sha256,row.line,JSON.stringify({...row,idFlag:'0'}),item.id]);
   }
   const totals=total(group);
   for(const metric of metrics)await client.query('insert into kpi_entries(report_id,user_id,metric_id,date,value) values($1,$2,$3,$4,$5)',[report.id,uid,metric.id,first.date,metric.key==='ad_spend'?totals.spentCents/100:totals.leads]);
  }
  const actual=(await client.query('select count(*)::int as n, coalesce(sum(round(i.spent::numeric*100)),0)::text as cents, coalesce(sum(i.impressions),0)::text as impressions, coalesce(sum(i.clicks),0)::text as clicks, coalesce(sum(i.leads),0)::text as leads from legacy_report_rows l join advertiser_report_items i on i.id=l.item_id where l.file_hash=$1',[plan.sha256])).rows[0];
  assert.equal(actual.n,plan.rows.length);
  assert.deepEqual({spentCents:+actual.cents,impressions:+actual.impressions,clicks:+actual.clicks,leads:+actual.leads},receipt.totals,'Imported totals do not match source');
  await client.query('insert into app_settings(key,value) values($1,$2)',[marker,JSON.stringify(receipt)]);
  await client.query(apply?'COMMIT':'ROLLBACK');
  return receipt;
 }catch(error){await client.query('ROLLBACK');throw error;}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const [planPath,mappingPath,sourcePath,...flags]=process.argv.slice(2);
 const plan=JSON.parse(readFileSync(planPath,'utf8'));
 assert.equal(createHash('sha256').update(readFileSync(sourcePath)).digest('hex'),plan.sha256,'Source CSV hash mismatch');
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();
 try{
  const receipt=await importLegacyReports(client,plan,JSON.parse(readFileSync(mappingPath,'utf8')),flags.includes('--apply'));
  const out=flags.find(f=>f.startsWith('--receipt='))?.slice(10);
  if(out)writeFileSync(out,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({applied:receipt.applied,alreadyImported:receipt.alreadyImported||false,rows:receipt.rows,reports:receipt.reportIds.length,byMember:receipt.byMember,createdUsers:receipt.createdUserIds.length,createdProducts:receipt.createdCampaignIds.length,totals:receipt.totals},null,2));
 }finally{client.release();await pool.end();}
}
